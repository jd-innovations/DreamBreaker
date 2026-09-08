-- Payment reconciliation queue (TODO1.1_EXECUTION_PLAN.md 3.3).
--
-- Every failure mode below was already DETECTED somewhere in the codebase --
-- and then written to a log line nobody reads. finalizePayment.ts screams
-- PAYMENT_RECONCILIATION_REQUIRED into stderr when money moves and the domain
-- side does not follow; cancel-registration does the same when a Stripe refund
-- fails. A greppable marker in a log stream is a record, not an operation.
-- This migration turns those states into rows someone can work.
--
-- Why a SECURITY DEFINER function rather than a view:
--
--   1. stripe_webhook_events has RLS on and NO policies at all -- deliberately
--      locked to the service role. An admin's own session cannot read it, so
--      "webhook recorded but never processed" is invisible from the client no
--      matter how the query is written. Definer rights are the only way to
--      surface it without loosening that table.
--   2. The stuck threshold is a judgement call, not a constant. A parameter
--      lets ops widen or narrow the window while triaging instead of waiting
--      on a migration.
--
-- Detection is derived from live state, NEVER from a flag some writer had to
-- remember to set. A reconciliation queue that depends on the failing code
-- path correctly reporting its own failure is exactly as reliable as the code
-- path that just failed.

-- ── payment_is_fulfilled ─────────────────────────────────────────────────────
-- "Did the thing this payment was for actually happen?" -- the mirror of
-- dispatchPaymentSucceeded() in web/src/lib/payments/finalizePayment.ts. Each
-- branch below checks for the exact row that purpose's finalizer writes.
--
-- Kept as its own function so the check is callable against a single payment
-- while investigating one case, and so adding a purpose means editing one
-- readable CASE rather than a subquery buried in a UNION. An unknown
-- purpose_type returns false ON PURPOSE: a payment no finalizer claims is
-- unfulfilled by definition. That is not hypothetical -- a deployment missing
-- the tournament_registration_hold branch once banked a real $10 payment and
-- created nothing.

CREATE OR REPLACE FUNCTION "public"."payment_is_fulfilled"(p_payment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_p    record;
  v_meta jsonb;
BEGIN
  SELECT pay.id, pay.purpose_type, pay.purpose_id, pay.provider_payment_intent_id, pay.metadata
    INTO v_p
    FROM "public"."payments" pay
   WHERE pay.id = p_payment_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_meta := COALESCE(v_p.metadata, '{}'::jsonb);

  CASE v_p.purpose_type

    -- create_reservation() made the row in 'held' before any payment; the
    -- finalizer's only job is held -> confirmed.
    WHEN 'reservation_payment' THEN
      RETURN EXISTS (
        SELECT 1 FROM "public"."reservations" res
         WHERE res.id = COALESCE(NULLIF(v_meta ->> 'reservationId', ''), v_p.purpose_id::text)::uuid
           AND res.status = 'confirmed'
      );

    -- purpose_id here is the TOURNAMENT, not the registration, so the intent
    -- id is the only link back to the specific row the finalizer created.
    WHEN 'tournament_registration_hold' THEN
      RETURN v_p.provider_payment_intent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM "public"."registrations" reg
         WHERE reg.stripe_hold_intent_id = v_p.provider_payment_intent_id
      );

    -- Entry and balance both land on stripe_entry_intent_id: one creates the
    -- registration outright, the other converts a held one, and either way
    -- that column ends up carrying this intent.
    WHEN 'tournament_registration_entry', 'tournament_registration_balance' THEN
      RETURN v_p.provider_payment_intent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM "public"."registrations" reg
         WHERE reg.stripe_entry_intent_id = v_p.provider_payment_intent_id
      );

    -- Per-player team share: mark_registration_group_member_paid() stamps the
    -- payment onto the member row. The TEAM may still be incomplete -- that is
    -- a teammate who has not paid yet, not a reconciliation problem.
    WHEN 'tournament_team_entry' THEN
      RETURN EXISTS (
        SELECT 1 FROM "public"."registration_group_members" m
         WHERE m.payment_id = v_p.id
      );

    -- The purchase row exists as 'payment_pending' before payment; leaving
    -- that status IS the finalization.
    WHEN 'coach_offer_purchase' THEN
      RETURN EXISTS (
        SELECT 1 FROM "public"."coach_offer_purchases" cop
         WHERE cop.id = v_p.purpose_id
           AND cop.status <> 'payment_pending'
      );

    ELSE
      -- No finalizer claims this purpose. Money was taken for something this
      -- deployment does not know how to deliver.
      RETURN false;
  END CASE;
END;
$function$;

COMMENT ON FUNCTION "public"."payment_is_fulfilled"(uuid) IS
  'Did the domain side of this payment actually happen? Mirrors dispatchPaymentSucceeded() in web/src/lib/payments/finalizePayment.ts, one branch per purpose_type. Unknown purpose_type returns false deliberately.';

-- ── admin_payment_reconciliation ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS "public"."admin_payment_reconciliation"(integer, integer);

CREATE OR REPLACE FUNCTION "public"."admin_payment_reconciliation"(
  p_stuck_minutes integer DEFAULT 30,
  p_limit         integer DEFAULT 200
)
RETURNS TABLE (
  -- Stable machine keys. The UI groups on `kind` and the runbook
  -- (docs/PAYMENT_RECONCILIATION_RUNBOOK.md) is indexed by it -- do not rename
  -- one without updating both.
  kind            text,
  severity        text,
  payment_id      uuid,
  refund_id       uuid,
  purpose_type    text,
  purpose_id      uuid,
  payer_user_id   uuid,
  payer_name      text,
  amount_cents    integer,
  currency        text,
  provider_ref    text,
  occurred_at     timestamptz,
  age_minutes     integer,
  detail          text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cutoff timestamptz := now() - make_interval(mins => GREATEST(p_stuck_minutes, 1));
BEGIN
  -- Definer rights read tables an admin's own session cannot (see header), so
  -- this gate is the entire security boundary of the function.
  IF NOT "public"."is_admin"() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- ── 1. Money taken, nothing delivered ──────────────────────────────────────
  -- The worst state in the system: a real person has been charged and has no
  -- registration, reservation, or voucher to show for it.
  RETURN QUERY
  SELECT
    'succeeded_not_fulfilled'::text,
    'critical'::text,
    p.id,
    NULL::uuid,
    p.purpose_type,
    p.purpose_id,
    p.payer_user_id,
    pr.full_name,
    p.amount_cents,
    p.currency,
    p.provider_payment_intent_id,
    COALESCE(p.confirmed_at, p.updated_at),
    (EXTRACT(EPOCH FROM (now() - COALESCE(p.confirmed_at, p.updated_at))) / 60)::integer,
    format('Charged %s and no %s exists for it.',
           '$' || to_char(p.amount_cents / 100.0, 'FM999,999,990.00'),
           CASE p.purpose_type
             WHEN 'reservation_payment'  THEN 'confirmed reservation'
             WHEN 'coach_offer_purchase' THEN 'finalized purchase'
             WHEN 'tournament_team_entry' THEN 'settled team obligation'
             WHEN 'tournament_registration_entry' THEN 'registration'
             WHEN 'tournament_registration_hold' THEN 'registration'
             WHEN 'tournament_registration_balance' THEN 'registration'
             -- Anything else has no finalizer at all, which is a far worse
             -- situation than one that failed -- EVERY payment of this purpose
             -- is failing, not just this one -- so it must not be described in
             -- the same words as a missing registration.
             ELSE format('handler for purpose "%s" in this deployment', p.purpose_type)
           END)
    FROM "public"."payments" p
    LEFT JOIN "public"."profiles" pr ON pr.id = p.payer_user_id
   WHERE p.status = 'succeeded'
     -- Grace period. The webhook fires asynchronously and finalization is a
     -- few writes behind it; anything inside the window is in flight, not
     -- stuck. Paging on those would train people to ignore this queue.
     AND COALESCE(p.confirmed_at, p.updated_at) < v_cutoff
     AND NOT "public"."payment_is_fulfilled"(p.id)
   ORDER BY COALESCE(p.confirmed_at, p.updated_at)
   LIMIT p_limit;

  -- ── 2. PaymentIntent stuck before resolution ───────────────────────────────
  -- Usually an abandoned checkout, which is harmless. Occasionally a captured
  -- charge whose webhook never arrived, which is not -- and the two are
  -- indistinguishable from this side of Stripe. Hence: surfaced, lower
  -- severity, resolved by looking the intent up in the Stripe dashboard.
  RETURN QUERY
  SELECT
    'stuck_pending'::text,
    'warning'::text,
    p.id,
    NULL::uuid,
    p.purpose_type,
    p.purpose_id,
    p.payer_user_id,
    pr.full_name,
    p.amount_cents,
    p.currency,
    p.provider_payment_intent_id,
    p.created_at,
    (EXTRACT(EPOCH FROM (now() - p.created_at)) / 60)::integer,
    format('PaymentIntent has sat at %s since it was created.', p.status)
    FROM "public"."payments" p
    LEFT JOIN "public"."profiles" pr ON pr.id = p.payer_user_id
   WHERE p.status IN ('requires_confirmation', 'processing')
     AND p.created_at < v_cutoff
   ORDER BY p.created_at
   LIMIT p_limit;

  -- ── 3. Webhook recorded but never processed ────────────────────────────────
  -- The handler inserts the event id, acts on it, then stamps processed_at. A
  -- row with a null stamp means the handler threw or the process died between
  -- the two -- and because the event id is already recorded, Stripe's
  -- redelivery gets deduped away as "already processed." Nothing retries
  -- these. They are found here or not at all.
  RETURN QUERY
  SELECT
    'webhook_unprocessed'::text,
    'critical'::text,
    p.id,
    NULL::uuid,
    p.purpose_type,
    p.purpose_id,
    p.payer_user_id,
    pr.full_name,
    p.amount_cents,
    p.currency,
    e.event_id,
    e.created_at,
    (EXTRACT(EPOCH FROM (now() - e.created_at)) / 60)::integer,
    format('Stripe %s was recorded but never finished processing. Redelivery is deduped, so it will not retry itself.', e.type)
    FROM "public"."stripe_webhook_events" e
    -- The intent id sits at a different path per event type (charge.refunded
    -- nests it, payment_intent.* is the object itself), so both are tried --
    -- a null join here still yields a row, just without payer context.
    LEFT JOIN "public"."payments" p
      ON p.provider_payment_intent_id = COALESCE(
           e.payload #>> '{data,object,payment_intent}',
           e.payload #>> '{data,object,id}')
    LEFT JOIN "public"."profiles" pr ON pr.id = p.payer_user_id
   WHERE e.processed_at IS NULL
     AND e.created_at < v_cutoff
   ORDER BY e.created_at
   LIMIT p_limit;

  -- ── 4. Refund owed and not delivered ───────────────────────────────────────
  -- 'failed' is a refund Stripe rejected; the refunds row is the retry handle
  -- (cancel-registration deliberately does not retry in-request, because a
  -- refund that silently retries is how money goes out twice). 'pending' past
  -- the window means the obligation was recorded and the Stripe call never
  -- happened -- a crash between the two, which is the exact scenario the
  -- write-intent-before-calling-Stripe ordering exists to make visible.
  RETURN QUERY
  SELECT
    (CASE r.status WHEN 'failed' THEN 'refund_failed' ELSE 'refund_stuck' END)::text,
    'critical'::text,
    r.payment_id,
    r.id,
    p.purpose_type,
    p.purpose_id,
    p.payer_user_id,
    pr.full_name,
    r.amount_cents,
    p.currency,
    COALESCE(r.provider_refund_id, p.provider_payment_intent_id),
    r.created_at,
    (EXTRACT(EPOCH FROM (now() - r.updated_at)) / 60)::integer,
    CASE r.status
      WHEN 'failed' THEN format('Refund of %s failed: %s',
        '$' || to_char(r.amount_cents / 100.0, 'FM999,999,990.00'),
        COALESCE(r.failure_reason, 'no reason recorded'))
      WHEN 'pending' THEN format('Refund of %s was authorised but never submitted to Stripe.',
        '$' || to_char(r.amount_cents / 100.0, 'FM999,999,990.00'))
      ELSE format('Refund of %s was submitted to Stripe and never acknowledged.',
        '$' || to_char(r.amount_cents / 100.0, 'FM999,999,990.00'))
    END
    FROM "public"."refunds" r
    JOIN "public"."payments" p ON p.id = r.payment_id
    LEFT JOIN "public"."profiles" pr ON pr.id = p.payer_user_id
   WHERE r.status = 'failed'
      OR (r.status = 'pending' AND r.created_at < v_cutoff)
      -- Submitted and still unacknowledged a day later: the charge.refunded
      -- webhook settles these, so a stale one is the same webhook gap as kind
      -- 3, seen from the refund side. A day, not p_stuck_minutes, because
      -- Stripe refunds legitimately take days to reach a terminal state and a
      -- tighter window would report every healthy refund as broken.
      OR (r.status = 'submitted' AND r.updated_at < now() - interval '24 hours')
   ORDER BY r.created_at
   LIMIT p_limit;

  -- ── 5. Charged twice for the same thing ────────────────────────────────────
  -- Same payer, same purpose, more than one live (not fully refunded) success.
  -- The oldest is treated as the real one and every later row is reported,
  -- since those are the ones to give back. Idempotency keys already cover the
  -- retried-request case; this catches the ones they cannot -- two devices, or
  -- a second attempt after a client gave up waiting on a slow webhook.
  RETURN QUERY
  SELECT
    'duplicate_payment'::text,
    'warning'::text,
    d.id,
    NULL::uuid,
    d.purpose_type,
    d.purpose_id,
    d.payer_user_id,
    pr.full_name,
    d.amount_cents,
    d.currency,
    d.provider_payment_intent_id,
    d.created_at,
    (EXTRACT(EPOCH FROM (now() - d.created_at)) / 60)::integer,
    format('Payment #%s of %s for the same %s by the same payer.',
           d.dup_rank,
           '$' || to_char(d.amount_cents / 100.0, 'FM999,999,990.00'),
           d.purpose_type)
    FROM (
      SELECT pay.*,
             ROW_NUMBER() OVER (
               PARTITION BY pay.purpose_type, pay.purpose_id, pay.payer_user_id
               ORDER BY pay.created_at
             ) AS dup_rank
        FROM "public"."payments" pay
       WHERE pay.status = 'succeeded'
         AND pay.refunded_amount_cents < pay.amount_cents
    ) d
    LEFT JOIN "public"."profiles" pr ON pr.id = d.payer_user_id
   WHERE d.dup_rank > 1
   ORDER BY d.created_at
   LIMIT p_limit;
END;
$function$;

COMMENT ON FUNCTION "public"."admin_payment_reconciliation"(integer, integer) IS
  'Admin-only payment reconciliation queue (TODO1.1 3.3). Derives stuck/failed payment states from live rows rather than from any writer-set flag. SECURITY DEFINER because stripe_webhook_events is service-role-only; gated on is_admin(). Runbook: docs/PAYMENT_RECONCILIATION_RUNBOOK.md.';

-- admin_payment_reconciliation gates itself on is_admin(). payment_is_fulfilled
-- is NOT granted to authenticated: on its own it would let any signed-in user
-- probe the fulfilment state of an arbitrary payment id. Admins reach it only
-- through the gated queue above, which runs as definer.
REVOKE ALL ON FUNCTION "public"."admin_payment_reconciliation"(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."payment_is_fulfilled"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_payment_reconciliation"(integer, integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."payment_is_fulfilled"(uuid) TO "service_role";

-- Supports kinds 1, 2 and 5, all of which scan payments by status.
CREATE INDEX IF NOT EXISTS "idx_payments_status_created"
  ON "public"."payments" ("status", "created_at");

-- Supports kind 3. Partial, so it stays tiny even as the event ledger grows
-- without bound -- the healthy case is that almost nothing is in it.
CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_unprocessed"
  ON "public"."stripe_webhook_events" ("created_at")
  WHERE "processed_at" IS NULL;
