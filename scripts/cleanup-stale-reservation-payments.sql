-- ─────────────────────────────────────────────────────────────────────────────
-- One-off data repair: stale `reservation_payment` rows from the pre-PaymentSheet
-- booking flow.  Written 2026-08-21 alongside execution-plan item 3.1.
--
-- NOT a migration.  This repairs production data created by a code path that no
-- longer exists; it is not reproducible from schema and must not be replayed
-- against a fresh database.  Run it once, against production, by hand.
--
-- ── What these rows are ──────────────────────────────────────────────────────
-- Until 3.1, booking/review.tsx created a real Stripe PaymentIntent and then
-- offered "Continue in Test Mode", which confirmed the reservation without ever
-- presenting PaymentSheet.  So the intents were created and abandoned: no
-- payment method was ever attached, no charge was ever made, and no webhook
-- event ever arrived to move `payments.status` off `requires_confirmation`.
--
-- Five rows are affected, all created between 2026-08-12 and 2026-08-16:
--
--   payment_id  intent                          amount  reservation  slot
--   dcbb008a…   pi_3U5ARjICYlWw8dgu0YBF6uqA     $32.00  held         2026-08-16
--   b5532ccf…   pi_3U4V94ICYlWw8dgu07dHsoRV     $32.00  CONFIRMED    2026-08-15
--   a9ad3019…   pi_3U4V7lICYlWw8dgu0Y2nnFlx     $30.00  CONFIRMED    2026-08-14
--   7f9d20ca…   pi_3U3QbwQxzgwuVmp10dhR7ycr     $15.00  held         2026-08-11
--   67d72d4a…   pi_3U3PrQQxzgwuVmp11r5jZvrK     $32.00  held         2026-08-11
--
-- Every slot is in the past.  The three `held` reservations all have a
-- `hold_expires_at` that elapsed within ~10 minutes of creation.  The two
-- CONFIRMED ones are the "Continue in Test Mode" artifacts — a real confirmed
-- booking with no completed charge behind it.
--
-- ── BEFORE RUNNING: verify in Stripe ────────────────────────────────────────
-- This script assumes no money moved.  That assumption is well supported (no
-- webhook event references any of these intents, and the old flow never showed
-- a payment sheet) but it has NOT been verified against Stripe directly.
-- Open the Stripe dashboard in TEST mode and confirm each of the five `pi_…`
-- ids above is in a non-succeeded state.  If any one of them was actually
-- charged, STOP — that row needs a refund, not a status flip.
--
-- ── What this does ──────────────────────────────────────────────────────────
--   1. All five payments  requires_confirmation -> canceled, with a
--      failure_reason recording why.  Mirrors exactly what the webhook writes
--      for payment_intent.canceled (see web/src/app/api/stripe/webhooks/route.ts).
--   2. Nothing to the `held` reservations — see the note at step 2 below. They
--      are fixed systemically by the hold-sweeper migration instead.
--   3. The two CONFIRMED reservations are deliberately LEFT ALONE.  Those
--      bookings really happened and the slots are in the past; un-confirming
--      them would rewrite history.  Their payment row moving to `canceled`
--      changes My Bookings from a permanent "Payment Pending" to "Payment
--      Canceled", which is the honest description: the booking exists, the
--      charge never completed.
--
-- Guarded by predicate, not by hardcoded ids, so it cannot touch a payment that
-- has since progressed.  The row counts are asserted; a mismatch aborts.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── Before ───────────────────────────────────────────────────────────────────
select 'BEFORE' as phase, p.id, p.status, p.amount_cents, r.status as res_status
from payments p
left join reservations r on r.id = p.purpose_id
where p.purpose_type = 'reservation_payment'
order by p.created_at desc;

-- ── 1. Cancel the abandoned payments ─────────────────────────────────────────
do $$
declare
  n int;
begin
  update payments p
     set status         = 'canceled',
         failed_at      = now(),
         failure_reason = 'Abandoned pre-PaymentSheet booking intent; never confirmed, never charged. Cleaned up 2026-08-21 (execution plan 3.1).',
         updated_at     = now()
   where p.purpose_type = 'reservation_payment'
     and p.status       = 'requires_confirmation'
     and p.provider     = 'stripe'
     -- Created before 3.1 shipped; never widen this bound.
     and p.created_at   < timestamptz '2026-08-21 00:00:00+00'
     -- Belt and braces: if a webhook ever landed for this intent, leave it be.
     and not exists (
       select 1 from stripe_webhook_events e
       where e.payload->'data'->'object'->>'id' = p.provider_payment_intent_id
     );

  get diagnostics n = row_count;
  if n <> 5 then
    raise exception 'Expected to cancel 5 payments, updated %. Aborting — the data is not in the state this script was written for.', n;
  end if;
  raise notice 'Canceled % abandoned reservation payments.', n;
end $$;

-- ── 2. The dead holds are NOT handled here ───────────────────────────────────
-- An earlier draft of this script expired the three `held` reservations behind
-- these payments. It no longer does, because the problem turned out to be much
-- larger than these three rows: 11 reservations are sitting in 'held' with an
-- elapsed `hold_expires_at`, and because `reservations_no_overlap` keys on
-- status alone, every one of them is permanently blocking its court-hour.
--
-- That is a systemic gap, not a payment artifact — Booking Engine Phase 2
-- deferred the sweep and it was never built. It is fixed properly by
-- `supabase/migrations/20260821020000_reservation_hold_sweeper.sql`, which adds
-- `expire_stale_reservation_holds()` on a 5-minute cron and clears all 11.
--
-- So: apply that migration, and the holds resolve themselves. Running this
-- script before or after it makes no difference — they touch different columns
-- on different rows, and the sweeper's payment-in-flight guard ignores payments
-- older than 15 minutes, which all of these are.

-- ── After ────────────────────────────────────────────────────────────────────
select 'AFTER' as phase, p.id, p.status, p.failure_reason, r.status as res_status
from payments p
left join reservations r on r.id = p.purpose_id
where p.purpose_type = 'reservation_payment'
order by p.created_at desc;

-- Review the AFTER block, then COMMIT.  Expected end state:
--   5 payments  status = canceled
--   3 reservations status = held       (unchanged here; the sweeper expires them)
--   2 reservations status = confirmed  (unchanged, by design)
--
-- If anything looks wrong: ROLLBACK;
commit;
