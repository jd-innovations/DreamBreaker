-- ─────────────────────────────────────────────────────────────────────────────
-- Reservation hold sweeper — closes the gap Booking Engine Phase 2 deferred.
--
-- 20260809162811_booking_engine_phase2_reservation_core.sql says outright:
-- "server-side hold-expiry sweep (client-side countdown only this phase)".
-- That sweep was never built. `reservations` rows therefore sit in 'held'
-- forever once abandoned — `hold_expires_at` elapses and nothing acts on it.
--
-- Why that leaks inventory rather than merely looking untidy: the
-- `reservations_no_overlap` exclusion constraint is
--
--     EXCLUDE USING gist (asset_type WITH =, asset_id WITH =, time_range WITH &&)
--     WHERE (status IN ('held', 'confirmed'))
--
-- It keys on `status` alone and never consults `hold_expires_at`. So an expired
-- hold still blocks its slot — permanently. Every abandoned checkout removes
-- that court-hour from inventory for good. Production already carries three
-- such rows (2026-08-12 and 2026-08-16).
--
-- Note the existing `expire-holds` cron job does NOT cover this: it runs
-- `expire_stale_holds()`, which only touches tournament `registrations`. The
-- generic name is misleading; reservations have never had a sweeper.
--
-- This matters more after execution-plan 3.1. Wiring PaymentSheet made
-- "dismiss the sheet" a normal, silent, expected outcome — before it, the flow
-- pushed everyone through a test-mode confirmation. Cancelled checkouts are now
-- the common case, and each one used to strand a slot.
--
-- ── The payment-in-flight guard ─────────────────────────────────────────────
-- A hold must NOT be expired while a payment against it is mid-flight. If it
-- were, the sequence would be: user completes PaymentSheet -> sweeper expires
-- the hold -> webhook arrives -> finalizeReservationPayment() hits its
-- `status <> 'held'` guard, logs PAYMENT_RECONCILIATION_REQUIRED, and returns.
-- Money captured, no booking, no refund. That is strictly worse than the leak
-- this migration fixes, so the guard is not optional.
--
-- create-booking-payment-intent already refuses to START a charge against an
-- elapsed hold, so the only exposure is a sheet opened just before expiry and
-- completed just after. The 15-minute grace below covers that comfortably —
-- measured PaymentIntent-to-webhook latency in this project is ~19s.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."expire_stale_reservation_holds"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE reservations r
     SET status = 'expired',
         updated_at = now()
   WHERE r.status = 'held'
     AND r.hold_expires_at IS NOT NULL
     AND r.hold_expires_at < now()
     -- Never touch a hold with a live payment attempt against it. See the
     -- header: expiring one of these converts a captured payment into an
     -- unreconciled charge.
     AND NOT EXISTS (
       SELECT 1
         FROM payments p
        WHERE p.purpose_type = 'reservation_payment'
          AND p.purpose_id   = r.id
          AND p.status IN ('requires_confirmation', 'processing')
          AND p.created_at > now() - interval '15 minutes'
     );

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

ALTER FUNCTION "public"."expire_stale_reservation_holds"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."expire_stale_reservation_holds"() IS
  'Sweeps elapsed reservation holds to ''expired'' so the reservations_no_overlap exclusion constraint stops blocking their slot. Skips reservations with a payment attempt created in the last 15 minutes, so a PaymentSheet completing just after expiry still finalizes. Distinct from expire_stale_holds(), which covers tournament registrations only.';

-- Server-side only. Nothing client-reachable should be able to expire another
-- organizer's hold.
REVOKE EXECUTE ON FUNCTION "public"."expire_stale_reservation_holds"() FROM authenticated;
REVOKE EXECUTE ON FUNCTION "public"."expire_stale_reservation_holds"() FROM anon;

-- Scheduled as plain SQL, matching expire_registration_group_invites
-- (20260817010000) rather than the HTTP-invoking waitlist sweeper. Guarded so
-- the migration still applies on an environment without pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('expire-reservation-holds');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- not scheduled yet
    END;
    PERFORM cron.schedule(
      'expire-reservation-holds',
      '*/5 * * * *',
      $cron$ SELECT public.expire_stale_reservation_holds(); $cron$
    );
  END IF;
END;
$$;
