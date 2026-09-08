-- Coach Marketplace Phase 7 (step 1) — the refund spine.
--
-- Spec §27-31: unused purchases are non-refundable by default and exceptions
-- run through an admin-mediated process. Refunds after redemption are rare but
-- permitted — a technical failure, a dispute, a support resolution — and are
-- always an admin decision, never automatic.
--
-- Mirrors the Phase 6 payout design deliberately: a row is created and claimed
-- in the database BEFORE Stripe is called, so a crash between the two leaves a
-- pending refund to retry rather than an unrecorded movement of money. The
-- purchase only becomes 'refunded' once Stripe has confirmed.

-- ── Loosening the integrity guard ───────────────────────────────────────────
--
-- The trigger allowed exactly one transition, payment_pending -> finalized |
-- failed | cancelled, with no escape for any role. That made a finalized
-- purchase permanently immutable, which is correct until refunds exist and
-- impossible once they do.
--
-- finalized -> refunded is added and nothing else. Every economic column stays
-- immutable, so a refund can never quietly restate what was charged, what
-- commission applied, or what the coach was owed — the refund is recorded
-- alongside those figures, not on top of them.
create or replace function public.fn_protect_coach_offer_purchase_integrity()
returns trigger
language plpgsql
as $fn$
begin
  if NEW.offer_id IS DISTINCT FROM OLD.offer_id
     or NEW.coach_id IS DISTINCT FROM OLD.coach_id
     or NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     or NEW.offer_title IS DISTINCT FROM OLD.offer_title
     or NEW.offer_type IS DISTINCT FROM OLD.offer_type
     or NEW.facility_id IS DISTINCT FROM OLD.facility_id
     or NEW.lessons_included IS DISTINCT FROM OLD.lessons_included
     or NEW.participant_quantity IS DISTINCT FROM OLD.participant_quantity
     or NEW.regular_price_cents IS DISTINCT FROM OLD.regular_price_cents
     or NEW.selling_price_cents IS DISTINCT FROM OLD.selling_price_cents
     or NEW.discount_pct IS DISTINCT FROM OLD.discount_pct
     or NEW.premium_price_applied IS DISTINCT FROM OLD.premium_price_applied
     or NEW.premium_eligible_at_purchase IS DISTINCT FROM OLD.premium_eligible_at_purchase
     or NEW.currency IS DISTINCT FROM OLD.currency
     or NEW.gross_selling_price_cents IS DISTINCT FROM OLD.gross_selling_price_cents
     or NEW.buyer_service_fee_cents IS DISTINCT FROM OLD.buyer_service_fee_cents
     or NEW.tax_amount_cents IS DISTINCT FROM OLD.tax_amount_cents
     or NEW.tax_status IS DISTINCT FROM OLD.tax_status
     or NEW.buyer_total_charged_cents IS DISTINCT FROM OLD.buyer_total_charged_cents
     or NEW.commission_source IS DISTINCT FROM OLD.commission_source
     or NEW.commission_pct IS DISTINCT FROM OLD.commission_pct
     or NEW.platform_commission_amount_cents IS DISTINCT FROM OLD.platform_commission_amount_cents
     or NEW.boost_attributed IS DISTINCT FROM OLD.boost_attributed
     or NEW.boost_commission_pct IS DISTINCT FROM OLD.boost_commission_pct
     or NEW.boost_commission_amount_cents IS DISTINCT FROM OLD.boost_commission_amount_cents
     or NEW.inventory_hold_expires_at IS DISTINCT FROM OLD.inventory_hold_expires_at
     or NEW.expiration_policy IS DISTINCT FROM OLD.expiration_policy
     or NEW.expiration_days IS DISTINCT FROM OLD.expiration_days
  then
    raise exception 'coach_offer_purchases economic/snapshot terms are immutable after creation';
  end if;

  if NEW.status IS DISTINCT FROM OLD.status then
    if not (
      (OLD.status = 'payment_pending' and NEW.status in ('finalized', 'failed', 'cancelled'))
      or (OLD.status = 'finalized' and NEW.status = 'refunded')
    ) then
      raise exception 'invalid coach_offer_purchases status transition: % -> %', OLD.status, NEW.status;
    end if;
  end if;

  return NEW;
end;
$fn$;

-- ── Refunds ─────────────────────────────────────────────────────────────────
create table if not exists public.coach_refunds (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid not null references public.coach_offer_purchases(id) on delete restrict,
  amount_cents      integer not null check (amount_cents > 0),
  reason            text not null,
  -- Who authorised it. Spec §31: never a silent change; a refund always has a
  -- named actor and a reason.
  requested_by      uuid not null references public.profiles(id) on delete restrict,
  status            text not null default 'pending'
                      check (status in ('pending', 'completed', 'failed')),
  stripe_refund_id  text,
  -- Was the coach already paid for this, and did we get it back? Recorded even
  -- when the reversal fails, so money owed is visible rather than lost.
  payout_reversed_cents integer not null default 0,
  clawback_shortfall_cents integer not null default 0,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  failed_at         timestamptz
);

-- One refund per purchase. Partial refunds are not in scope: the spec treats a
-- refund as an exception to a non-refundable product, not a routine amount.
create unique index if not exists coach_refunds_purchase_key
  on public.coach_refunds (purchase_id) where status in ('pending', 'completed');
create index if not exists coach_refunds_status_idx
  on public.coach_refunds (status, created_at desc);

alter table public.coach_refunds enable row level security;

drop policy if exists "coach_refunds: participants read" on public.coach_refunds;
create policy "coach_refunds: participants read"
  on public.coach_refunds for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.coach_offer_purchases p
       where p.id = purchase_id
         and (p.buyer_id = (select auth.uid()) or p.coach_id = (select auth.uid()))
    )
  );

-- ── Claiming a refund ───────────────────────────────────────────────────────
--
-- Admin-only. Creates the pending row before Stripe is called; the unique index
-- is what stops a double refund if this is invoked twice.
create or replace function public.claim_coach_refund(
  p_purchase_id uuid,
  p_reason text
)
returns table (refund_id uuid, amount_cents integer, payment_intent_id text, already_paid_out boolean)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_refund uuid;
  v_purchase public.coach_offer_purchases%rowtype;
  v_intent text;
  v_paid boolean;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required';
  end if;

  select * into v_purchase
    from public.coach_offer_purchases where id = p_purchase_id for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if v_purchase.status <> 'finalized' then
    raise exception 'purchase_not_refundable';
  end if;

  select provider_payment_intent_id into v_intent
    from public.payments
   where purpose_type = 'coach_offer_purchase' and purpose_id = p_purchase_id
     and status = 'succeeded'
   order by created_at desc limit 1;

  if v_intent is null then
    raise exception 'no_settled_payment';
  end if;

  select exists (
    select 1 from public.coach_payout_items i
      join public.coach_payout_batches b on b.id = i.batch_id
     where i.purchase_id = p_purchase_id and b.status = 'paid'
  ) into v_paid;

  insert into public.coach_refunds (purchase_id, amount_cents, reason, requested_by)
  values (p_purchase_id, v_purchase.buyer_total_charged_cents, trim(p_reason), auth.uid())
  returning id into v_refund;

  refund_id          := v_refund;
  amount_cents       := v_purchase.buyer_total_charged_cents;
  payment_intent_id  := v_intent;
  already_paid_out   := coalesce(v_paid, false);
  return next;
end;
$fn$;

-- ── Recording the outcome ───────────────────────────────────────────────────
--
-- Called after Stripe. On success this is the only place a purchase becomes
-- 'refunded', entitlements are revoked, and the ledger gains its refund event.
create or replace function public.settle_coach_refund(
  p_refund_id uuid,
  p_stripe_refund_id text,
  p_reversed_cents integer default 0,
  p_shortfall_cents integer default 0,
  p_failure text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_refund public.coach_refunds%rowtype;
begin
  select * into v_refund from public.coach_refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund_not_found';
  end if;

  if p_failure is not null then
    update public.coach_refunds
       set status = 'failed', failure_reason = p_failure, failed_at = now()
     where id = p_refund_id and status = 'pending';
    return;
  end if;

  update public.coach_refunds
     set status = 'completed',
         stripe_refund_id = p_stripe_refund_id,
         payout_reversed_cents = coalesce(p_reversed_cents, 0),
         clawback_shortfall_cents = coalesce(p_shortfall_cents, 0),
         completed_at = now(),
         failure_reason = null
   where id = p_refund_id and status in ('pending', 'failed');

  update public.coach_offer_purchases
     set status = 'refunded'
   where id = v_refund.purchase_id and status = 'finalized';

  -- Unredeemed entitlements are revoked; already-redeemed ones are left
  -- exactly as they were. Spec §31: never silently modify historical
  -- redemption records — the lesson happened, and erasing that would destroy
  -- the evidence the redemption log exists to hold.
  update public.coach_voucher_entitlements
     set status = 'revoked',
         revoked_at = now(),
         revoked_reason = 'refunded',
         updated_at = now()
   where purchase_id = v_refund.purchase_id
     and status <> 'exhausted'
     and revoked_at is null;

  insert into public.coach_offer_purchase_ledger_events
    (purchase_id, event_type, amount_cents, metadata, created_by)
  values
    (v_refund.purchase_id, 'refund', v_refund.amount_cents,
     jsonb_build_object('refund_id', p_refund_id, 'stripe_refund_id', p_stripe_refund_id,
                        'reason', v_refund.reason),
     v_refund.requested_by);

  if coalesce(p_reversed_cents, 0) > 0 then
    insert into public.coach_offer_purchase_ledger_events
      (purchase_id, event_type, amount_cents, metadata, created_by)
    values
      (v_refund.purchase_id, 'payout_reversal', p_reversed_cents,
       jsonb_build_object('refund_id', p_refund_id,
                          'shortfall_cents', coalesce(p_shortfall_cents, 0)),
       v_refund.requested_by);
  end if;
end;
$fn$;

revoke all on function public.claim_coach_refund(uuid, text) from public;
revoke all on function public.settle_coach_refund(uuid, text, integer, integer, text) from public;
grant execute on function public.claim_coach_refund(uuid, text) to authenticated, service_role;
grant execute on function public.settle_coach_refund(uuid, text, integer, integer, text) to service_role;

comment on table public.coach_refunds is
  'Phase 7: admin-authorised refunds. One per purchase; claimed before Stripe is called so a crash leaves a pending row to retry rather than an unrecorded refund.';
