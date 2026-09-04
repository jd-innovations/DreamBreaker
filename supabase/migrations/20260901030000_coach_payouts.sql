-- Coach Marketplace Phase 6 — paying coaches.
--
-- Charges are plain platform charges (no transfer_data / on_behalf_of), so
-- money lands in the platform's Stripe balance and reaches a coach as a
-- separate Transfer to their connected account. That is Stripe's "separate
-- charges and transfers" model, and it is what the existing payment path
-- already committed us to.
--
-- Eligibility is REDEMPTION-based, not purchase-based: a coach is paid for a
-- lesson once it has actually been delivered. Paying at purchase would hand
-- over money for a lesson that has not happened and may be refunded, and the
-- platform would be chasing it back.

-- ── Batches ─────────────────────────────────────────────────────────────────
create table if not exists public.coach_payout_batches (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references public.profiles(id) on delete restrict,
  amount_cents       integer not null check (amount_cents > 0),
  currency           text not null default 'usd',
  status             text not null default 'pending'
                       check (status in ('pending', 'paid', 'failed')),
  -- Set only once Stripe has accepted the transfer. Its presence is the single
  -- source of truth for "this money left".
  stripe_transfer_id text,
  stripe_account_id  text not null,
  failure_reason     text,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz,
  failed_at          timestamptz
);

create index if not exists coach_payout_batches_coach_idx
  on public.coach_payout_batches (coach_id, created_at desc);
create unique index if not exists coach_payout_batches_transfer_key
  on public.coach_payout_batches (stripe_transfer_id) where stripe_transfer_id is not null;

-- ── Items ───────────────────────────────────────────────────────────────────
--
-- One row per redemption paid. The UNIQUE on redemption_id is the whole
-- double-payment guard: a redemption can appear in at most one batch, ever,
-- enforced by the database rather than by the correctness of a query.
create table if not exists public.coach_payout_items (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.coach_payout_batches(id) on delete cascade,
  redemption_id  uuid not null references public.coach_voucher_redemptions(id) on delete restrict,
  purchase_id    uuid not null references public.coach_offer_purchases(id) on delete restrict,
  amount_cents   integer not null check (amount_cents >= 0),
  created_at     timestamptz not null default now()
);

create unique index if not exists coach_payout_items_redemption_key
  on public.coach_payout_items (redemption_id);
create index if not exists coach_payout_items_batch_idx
  on public.coach_payout_items (batch_id);

alter table public.coach_payout_batches enable row level security;
alter table public.coach_payout_items  enable row level security;

drop policy if exists "coach_payout_batches: coach read own" on public.coach_payout_batches;
create policy "coach_payout_batches: coach read own"
  on public.coach_payout_batches for select
  using (coach_id = (select auth.uid()) or public.is_admin());

drop policy if exists "coach_payout_items: coach read own" on public.coach_payout_items;
create policy "coach_payout_items: coach read own"
  on public.coach_payout_items for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.coach_payout_batches b
       where b.id = batch_id and b.coach_id = (select auth.uid())
    )
  );

-- ── What a redemption is worth ──────────────────────────────────────────────
--
-- A purchase's coach_net_proceeds_cents covers every redemption it contains: a
-- 2-participant purchase has two, a 5-lesson package has five. Each redemption
-- releases an equal share, and the LAST one releases the remainder so the parts
-- always sum to exactly the whole — integer division alone would quietly strand
-- cents in the platform's account on every package sold.
create or replace function public.coach_redemption_payout_cents(p_redemption_id uuid)
returns integer
language plpgsql
stable
as $fn$
declare
  v_net        integer;
  v_total      integer;
  v_paid_count integer;
  v_share      integer;
begin
  select p.coach_net_proceeds_cents,
         (select coalesce(sum(e.total_redemptions), 0)
            from public.coach_voucher_entitlements e
           where e.purchase_id = p.id)
    into v_net, v_total
    from public.coach_voucher_redemptions r
    join public.coach_offer_purchases p on p.id = r.purchase_id
   where r.id = p_redemption_id;

  if v_net is null or coalesce(v_total, 0) = 0 then
    return 0;
  end if;

  -- How many redemptions of this purchase come at or before this one.
  select count(*)
    into v_paid_count
    from public.coach_voucher_redemptions r2
    join public.coach_voucher_redemptions r on r.id = p_redemption_id
   where r2.purchase_id = r.purchase_id
     and (r2.redeemed_at, r2.id) <= (r.redeemed_at, r.id);

  v_share := v_net / v_total;

  -- Final redemption of the purchase takes whatever rounding left behind.
  if v_paid_count >= v_total then
    return v_net - (v_share * (v_total - 1));
  end if;

  return v_share;
end;
$fn$;

-- ── What is payable now ─────────────────────────────────────────────────────
--
-- A redemption is payable when it is older than the configured settlement hold
-- and has not already been placed in a batch. The hold runs from redemption,
-- not from payment, because redemption is the event that earns the money.
create or replace view public.v_coach_payable_redemptions
with (security_invoker = true) as
select
  r.id                as redemption_id,
  r.purchase_id,
  r.redeemed_by       as coach_id,
  r.redeemed_at,
  public.coach_redemption_payout_cents(r.id) as amount_cents,
  pr.stripe_connect_account_id,
  pr.coach_status
from public.coach_voucher_redemptions r
join public.profiles pr on pr.id = r.redeemed_by
where not exists (
        select 1 from public.coach_payout_items i where i.redemption_id = r.id
      )
  and r.redeemed_at <= now() - (
        coalesce(
          (select value::numeric from public.platform_settings
            where key = 'coach_marketplace_settlement_hold_hours'),
          48
        ) * interval '1 hour'
      )
  and pr.stripe_connect_account_id is not null
  and pr.stripe_connect_onboarded_at is not null;

-- ── Claiming a batch ────────────────────────────────────────────────────────
--
-- Reserves the eligible redemptions for one coach into a pending batch and
-- returns it. Called by the payout runner BEFORE it talks to Stripe: the rows
-- must be claimed first, so a crash between claim and transfer leaves a
-- pending batch to retry rather than redemptions that get paid twice.
create or replace function public.claim_coach_payout_batch(p_coach_id uuid)
returns table (batch_id uuid, amount_cents integer, stripe_account_id text)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_batch   uuid;
  v_total   integer;
  v_account text;
begin
  select stripe_connect_account_id into v_account
    from public.profiles where id = p_coach_id;

  if v_account is null then
    return;
  end if;

  -- One statement: select the eligible rows, create the batch, and insert the
  -- items from the same snapshot. The unique index on redemption_id is what
  -- makes a concurrent second run fail here rather than pay a lesson twice.
  select coalesce(sum(v.amount_cents), 0) into v_total
    from public.v_coach_payable_redemptions v
   where v.coach_id = p_coach_id and v.amount_cents > 0;

  if v_total <= 0 then
    return;
  end if;

  insert into public.coach_payout_batches (coach_id, amount_cents, stripe_account_id)
  values (p_coach_id, v_total, v_account)
  returning id into v_batch;

  insert into public.coach_payout_items (batch_id, redemption_id, purchase_id, amount_cents)
  select v_batch, v.redemption_id, v.purchase_id, v.amount_cents
    from public.v_coach_payable_redemptions v
   where v.coach_id = p_coach_id and v.amount_cents > 0;

  batch_id          := v_batch;
  amount_cents      := v_total;
  stripe_account_id := v_account;
  return next;
end;
$fn$;

-- Recording the outcome. Separate from claiming so the runner can call Stripe
-- in between, and so a failure is written without touching the items.
create or replace function public.settle_coach_payout_batch(
  p_batch_id uuid,
  p_transfer_id text,
  p_failure text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if p_failure is not null then
    update public.coach_payout_batches
       set status = 'failed', failure_reason = p_failure, failed_at = now()
     where id = p_batch_id and status = 'pending';
    return;
  end if;

  update public.coach_payout_batches
     set status = 'paid', stripe_transfer_id = p_transfer_id, paid_at = now()
   where id = p_batch_id and status = 'pending';
end;
$fn$;

revoke all on function public.claim_coach_payout_batch(uuid) from public;
revoke all on function public.settle_coach_payout_batch(uuid, text, text) from public;
grant execute on function public.claim_coach_payout_batch(uuid) to service_role;
grant execute on function public.settle_coach_payout_batch(uuid, text, text) to service_role;

-- Runner only. Coaches read their earnings from coach_offer_purchases, which
-- has its own "coach read own" policy; nobody but the payout job needs this.
grant select on public.v_coach_payable_redemptions to service_role;

comment on view public.v_coach_payable_redemptions is
  'Redemptions past the settlement hold, not yet batched, for coaches with a completed Connect account. Payable-now, not paid.';
