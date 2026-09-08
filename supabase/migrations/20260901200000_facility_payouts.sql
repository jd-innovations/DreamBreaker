-- Facility Marketplace Phase 7 — paying facilities.
--
-- Ported from the coach payout machinery, with one deliberate omission and two
-- additions.
--
-- ── No clawback machinery, on purpose ───────────────────────────────────────
--
-- The coach build carries withheld_cents, shortfall tracking and an
-- oldest-debt-first recovery loop, because a coach refund can land AFTER the
-- payout: redemption makes a purchase payable immediately, and a refund can
-- follow.
--
-- Facilities invert that. A cancellation refund happens at cancellation, which
-- is necessarily BEFORE the slot ends, and a booking is payable only once the
-- slot has ended — the refundable and payable conditions are exact complements
-- (verified in Phase 8). The ordinary refund path therefore cannot produce a
-- facility clawback at all.
--
-- What remains is an admin discretionary refund issued after payout. The
-- settlement hold below plus the refunded-payment exclusion shrink that to a
-- narrow window, and the honest answer for it is a manual reversal rather than
-- half the coach's accounting apparatus carried for a case the design prevents.
-- If discretionary refunds turn out to be common, the coach code is the model.
--
-- ── Settlement hold ─────────────────────────────────────────────────────────
--
-- 48 hours after the slot ends, matching coaches. A booking that ended an hour
-- ago can still be disputed; paying it out immediately means chasing the money
-- back rather than simply not sending it.
--
-- ── Minimum payout ──────────────────────────────────────────────────────────
--
-- $100. A $3 transfer costs the same to make as a $300 one, and a facility with
-- one booking a fortnight does not want a trickle of dollar transfers. Balances
-- accumulate in the payable view until they clear the floor, so nothing is
-- lost — it is only deferred.
--
-- NOTE: applies to FACILITIES only. Coaches still have no minimum; changing a
-- live payout path was not in this phase's scope.

insert into public.platform_settings (key, value, value_type, label, description, sort_order)
values
  ('facility_marketplace_payout_weekday', 'monday', 'string',
   'Facility Marketplace: Payout Day',
   'Day the facility payout runner fires. Matches the coach runner.', 920),
  ('facility_marketplace_settlement_hold_hours', '48', 'number',
   'Facility Marketplace: Settlement Hold',
   'Hours after a slot ends before its booking becomes payable.', 921),
  ('facility_marketplace_minimum_payout_cents', '10000', 'number',
   'Facility Marketplace: Minimum Payout',
   'A facility is not paid until the amount owed reaches this. Balances accumulate until then.', 922)
on conflict (key) do nothing;

-- ── Batches and items ───────────────────────────────────────────────────────

create table if not exists public.facility_payout_batches (
  id                uuid primary key default gen_random_uuid(),
  facility_id       uuid not null references public.facilities(id) on delete cascade,
  amount_cents      integer not null check (amount_cents >= 0),
  currency          text not null default 'usd',
  status            text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  stripe_transfer_id text,
  stripe_account_id text not null,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  failed_at         timestamptz
);

create index if not exists facility_payout_batches_status_idx
  on public.facility_payout_batches (status, created_at);

create table if not exists public.facility_payout_items (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.facility_payout_batches(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  amount_cents   integer not null,
  created_at     timestamptz not null default now()
);

-- The mechanism that makes double payment impossible rather than merely
-- unlikely — the coach equivalent is a unique redemption_id.
create unique index if not exists facility_payout_items_reservation_key
  on public.facility_payout_items (reservation_id);
create index if not exists facility_payout_items_batch_idx
  on public.facility_payout_items (batch_id);

alter table public.facility_payout_batches enable row level security;
alter table public.facility_payout_items enable row level security;

-- A facility owner can see what they were paid; nobody else can, and nobody
-- writes from a client. The runner is service_role.
drop policy if exists "facility payout batches: owner read" on public.facility_payout_batches;
create policy "facility payout batches: owner read"
  on public.facility_payout_batches for select
  using (
    public.is_facility_role_at_least(facility_id, (select auth.uid()), 'owner'::facility_member_role)
    or public.is_admin()
  );

drop policy if exists "facility payout items: owner read" on public.facility_payout_items;
create policy "facility payout items: owner read"
  on public.facility_payout_items for select
  using (
    exists (
      select 1 from public.facility_payout_batches b
       where b.id = batch_id
         and (public.is_facility_role_at_least(b.facility_id, (select auth.uid()), 'owner'::facility_member_role)
              or public.is_admin())
    )
  );

-- ── What is payable ─────────────────────────────────────────────────────────
--
-- Rebuilt from the Phase 4 version with three additions: the settlement hold,
-- exclusion of anything already claimed into a batch, and exclusion of any
-- booking whose payment has been refunded. That last one is what keeps an
-- admin refund from being paid out as well, provided it lands inside the hold.
create or replace view public.v_facility_payable_reservations
with (security_invoker = true) as
select
  r.id as reservation_id,
  r.facility_id,
  r.final_price_cents,
  r.platform_commission_cents,
  r.facility_net_cents,
  lower(r.time_range) as slot_start,
  r.status
from public.reservations r
join public.facilities f on f.id = r.facility_id
where r.facility_net_cents is not null
  and r.facility_net_cents > 0
  and f.payouts_ready = true
  -- Settlement hold: the slot ended at least N hours ago.
  and upper(r.time_range) <= now() - (
        coalesce((select value::numeric from public.platform_settings
                   where key = 'facility_marketplace_settlement_hold_hours'), 48)
      ) * interval '1 hour'
  -- Never twice.
  and not exists (
    select 1 from public.facility_payout_items i where i.reservation_id = r.id
  )
  -- Refunded bookings are not paid out. A late cancellation has no refund and
  -- so is unaffected; this catches the discretionary case.
  and not exists (
    select 1
      from public.payments p
      join public.refunds rf on rf.payment_id = p.id
     where p.purpose_type = 'reservation_payment'
       and p.purpose_id = r.id
       and rf.status = 'succeeded'
  )
  and (
    r.status = 'confirmed'
    or (r.status = 'cancelled'
        and r.cancelled_at > lower(r.time_range) - make_interval(hours => f.cancellation_window_hours))
  );

revoke all on public.v_facility_payable_reservations from anon, authenticated;
grant select on public.v_facility_payable_reservations to service_role;

-- ── Claim ───────────────────────────────────────────────────────────────────

create or replace function public.claim_facility_payout_batch(p_facility_id uuid)
returns table (batch_id uuid, amount_cents integer, stripe_account_id text)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_batch   uuid;
  v_gross   integer;
  v_account text;
  v_minimum integer;
begin
  select a.stripe_connect_account_id into v_account
    from public.facility_payout_accounts a
   where a.facility_id = p_facility_id and a.onboarded_at is not null;

  -- No account, or onboarding unfinished. Nothing is claimed, so the money
  -- stays payable and is picked up once Stripe says the account is ready.
  if v_account is null then
    return;
  end if;

  select coalesce(sum(v.facility_net_cents), 0) into v_gross
    from public.v_facility_payable_reservations v
   where v.facility_id = p_facility_id;

  v_minimum := coalesce(
    (select value::integer from public.platform_settings
      where key = 'facility_marketplace_minimum_payout_cents'), 10000);

  -- Below the floor: leave everything unclaimed so it accumulates into a later
  -- run. Claiming it into a batch we then refuse to send would strand it.
  if v_gross < v_minimum then
    return;
  end if;

  insert into public.facility_payout_batches (facility_id, amount_cents, stripe_account_id)
  values (p_facility_id, v_gross, v_account)
  returning id into v_batch;

  insert into public.facility_payout_items (batch_id, reservation_id, amount_cents)
  select v_batch, v.reservation_id, v.facility_net_cents
    from public.v_facility_payable_reservations v
   where v.facility_id = p_facility_id;

  batch_id          := v_batch;
  amount_cents      := v_gross;
  stripe_account_id := v_account;
  return next;
end;
$fn$;

-- ── Settle ──────────────────────────────────────────────────────────────────

create or replace function public.settle_facility_payout_batch(
  p_batch_id uuid,
  p_transfer_id text default null,
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
    update public.facility_payout_batches
       set status = 'failed', failure_reason = p_failure, failed_at = now()
     where id = p_batch_id and status in ('pending', 'failed');
    return;
  end if;

  -- 'failed' as well as 'pending', the lesson from the coach runner: a failed
  -- batch keeps its items and the payable view excludes them whatever the batch
  -- status, so a batch that can never leave 'failed' strands that money
  -- permanently and invisibly.
  update public.facility_payout_batches
     set status = 'paid',
         stripe_transfer_id = p_transfer_id,
         paid_at = now(),
         failure_reason = null
   where id = p_batch_id and status in ('pending', 'failed');
end;
$fn$;

-- ── What a facility sees ────────────────────────────────────────────────────
--
-- Owner-facing earnings: what has been paid, and what is waiting. The pending
-- figure has to explain itself, or a facility sitting below the $100 floor
-- concludes it is simply not being paid.
create or replace function public.facility_earnings(p_facility_id uuid)
returns table (
  paid_cents      bigint,
  pending_cents   bigint,
  minimum_cents   integer,
  last_paid_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    coalesce((select sum(b.amount_cents) from public.facility_payout_batches b
               where b.facility_id = p_facility_id and b.status = 'paid'), 0),
    coalesce((select sum(r.facility_net_cents) from public.reservations r
               where r.facility_id = p_facility_id
                 and r.facility_net_cents is not null
                 and not exists (select 1 from public.facility_payout_items i
                                  where i.reservation_id = r.id)
                 and (r.status = 'confirmed' or r.status = 'cancelled')), 0),
    coalesce((select value::integer from public.platform_settings
               where key = 'facility_marketplace_minimum_payout_cents'), 10000),
    (select max(b.paid_at) from public.facility_payout_batches b
      where b.facility_id = p_facility_id and b.status = 'paid')
  where public.is_facility_role_at_least(p_facility_id, auth.uid(), 'owner'::facility_member_role);
$fn$;

revoke all on function public.claim_facility_payout_batch(uuid) from public;
revoke all on function public.settle_facility_payout_batch(uuid, text, text) from public;
revoke all on function public.facility_earnings(uuid) from public;
grant execute on function public.claim_facility_payout_batch(uuid) to service_role;
grant execute on function public.settle_facility_payout_batch(uuid, text, text) to service_role;
grant execute on function public.facility_earnings(uuid) to authenticated;

comment on table public.facility_payout_batches is
  'Weekly transfers to a facility Connect account. No clawback columns, unlike coach_payout_batches: a booking refund necessarily precedes the slot ending, so the ordinary refund path cannot produce a facility clawback.';
