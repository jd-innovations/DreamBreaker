-- ─────────────────────────────────────────────────────────────────────────────
-- One-off data repair: booking payment residue from the pre-PaymentSheet flow.
-- Written 2026-08-21 alongside execution-plan item 3.1; widened the same day
-- once it was established the app has no real users yet, so this can simply
-- make the data correct rather than tiptoe around user-visible history.
--
-- NOT a migration. This repairs production data created by a code path that no
-- longer exists; it is not reproducible from schema and must not be replayed
-- against a fresh database. Run it once, by hand.
--
-- ── What it cleans ──────────────────────────────────────────────────────────
--
-- 1. Stale payment rows. Until 3.1, booking/review.tsx created a real Stripe
--    PaymentIntent and then offered "Continue in Test Mode", confirming the
--    reservation without ever presenting PaymentSheet. Those intents were
--    created and abandoned: no payment method attached, no charge made, and no
--    webhook event ever arrived to move them off 'requires_confirmation'.
--    They read as "Payment Pending" forever in My Bookings.
--
-- 2. Confirmed-but-unpaid reservations — the "Continue in Test Mode" artifacts
--    themselves. Three of them, all for slots in the past:
--
--      125dfa92…  $32.00  confirmed 2026-08-21  (from the stale Aug-18 bundle)
--      c48399f0…  $32.00  confirmed 2026-08-15
--      53b81fc5…  $30.00  confirmed 2026-08-15
--
--    These are bookings nobody paid for. With no real users to preserve history
--    for, cancelling them is more honest than leaving fake confirmed bookings
--    in the table.
--
-- ── What it deliberately never touches ──────────────────────────────────────
-- Any reservation with a SUCCEEDED payment. That guard is what keeps
-- b8b95b21… — the first genuine paid booking, 2026-08-21 22:07 — out of scope.
-- Both statements below are written as predicates, not id lists, so they stay
-- correct as more test data accumulates.
--
-- Expired holds are NOT handled here. That was a systemic gap, not payment
-- residue, and it is fixed by
-- supabase/migrations/20260821020000_reservation_hold_sweeper.sql, which now
-- runs every 5 minutes and already cleared the 13 that had leaked.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── Before ───────────────────────────────────────────────────────────────────
select 'BEFORE' as phase, p.id, p.status as payment_status, p.amount_cents,
       r.id as reservation_id, r.status as res_status
from payments p
left join reservations r on r.id = p.purpose_id
where p.purpose_type = 'reservation_payment'
order by p.created_at desc;

-- ── 1. Cancel every abandoned payment attempt ────────────────────────────────
do $$
declare n int;
begin
  update payments p
     set status         = 'canceled',
         failed_at      = coalesce(p.failed_at, now()),
         failure_reason = 'Abandoned booking payment attempt; never confirmed, never charged. Cleaned up 2026-08-21 (execution plan 3.1).',
         updated_at     = now()
   where p.purpose_type = 'reservation_payment'
     and p.status in ('requires_confirmation', 'processing')
     -- If Stripe ever spoke about this intent, leave it alone — the webhook is
     -- the authority on what actually happened to the money.
     and not exists (
       select 1 from stripe_webhook_events e
       where e.payload->'data'->'object'->>'id' = p.provider_payment_intent_id
     );

  get diagnostics n = row_count;
  raise notice 'Canceled % abandoned booking payment(s).', n;
end $$;

-- ── 2. Cancel the confirmed-but-unpaid bookings ──────────────────────────────
do $$
declare n int;
begin
  update reservations r
     set status       = 'cancelled',
         cancelled_at = now()
   where r.status = 'confirmed'
     -- Only reservations that went down the payment path at all. A genuinely
     -- free booking has no payments row and is none of this script's business.
     and exists (
       select 1 from payments p
       where p.purpose_id = r.id and p.purpose_type = 'reservation_payment'
     )
     -- The guard that matters: never cancel a booking somebody actually paid for.
     and not exists (
       select 1 from payments p
       where p.purpose_id   = r.id
         and p.purpose_type = 'reservation_payment'
         and p.status       = 'succeeded'
     );

  get diagnostics n = row_count;
  raise notice 'Cancelled % confirmed-but-unpaid booking(s).', n;
end $$;

-- ── After ────────────────────────────────────────────────────────────────────
select 'AFTER' as phase, p.id, p.status as payment_status, p.failure_reason,
       r.id as reservation_id, r.status as res_status
from payments p
left join reservations r on r.id = p.purpose_id
where p.purpose_type = 'reservation_payment'
order by p.created_at desc;

-- Expected end state: every reservation_payment row is 'succeeded' or
-- 'canceled' — nothing left pending — and the only 'confirmed' reservation
-- among them is b8b95b21…, the one with a real succeeded payment behind it.
--
-- If anything looks wrong: ROLLBACK;
commit;
