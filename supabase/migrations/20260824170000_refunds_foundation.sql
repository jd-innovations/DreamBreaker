-- Refund foundation, part 1: the record and the arithmetic.
--
-- Deliberately contains NO Stripe call. This migration decides *whether* a
-- refund is owed and *how much*, and gives it somewhere to be recorded. Asking
-- Stripe for the money is a separate, later step, because the two failure modes
-- are different: getting the amount wrong is a correctness bug, and failing to
-- reach Stripe is an operational one that has to be retryable.
--
-- Why the amount cannot be computed client-side, which is what the dashboard
-- did before: it read tournaments.entry_fee_cents -- the LIST price -- and
-- showed that as the refund. A player who registered through Hold My Spot paid
-- a $10 deposit plus a $55 balance, and the deposit is non-refundable, so they
-- are owed $55 while the dashboard promised $65. The number has to come from
-- what that player actually paid.

-- ── refunds ──────────────────────────────────────────────────────────────────
-- payments.refunded_amount_cents already records THAT money went back. It does
-- not record who authorised it, why, or under what policy -- which is the
-- entire point for a discretionary refund. That needs rows, not a column.

CREATE TABLE IF NOT EXISTS "public"."refunds" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "payment_id"      uuid NOT NULL REFERENCES "public"."payments"("id"),
  -- Nullable: the refund foundation is domain-neutral like payments itself.
  -- Tournament cancellations set it; a coach purchase or booking refund later
  -- will not.
  "registration_id" uuid REFERENCES "public"."registrations"("id"),
  "amount_cents"    integer NOT NULL CHECK ("amount_cents" > 0),
  -- 'policy'        -- the cancellation window was met, amount computed
  -- 'discretionary' -- a human decided, outside the policy
  "kind"            text NOT NULL CHECK ("kind" IN ('policy', 'discretionary')),
  "reason"          text NOT NULL,
  "requested_by"    uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "approved_by"     uuid REFERENCES "public"."profiles"("id"),
  "status"          text NOT NULL DEFAULT 'pending'
                      CHECK ("status" IN ('pending', 'submitted', 'succeeded', 'failed', 'canceled')),
  "provider"        text NOT NULL DEFAULT 'stripe',
  "provider_refund_id" text UNIQUE,
  -- The policy AS EVALUATED, frozen at request time: cutoff days, event date,
  -- days remaining, what was excluded. A director can change
  -- refund_cutoff_days afterwards, and without this nobody could answer "why
  -- did this person get $55?" six months later.
  "policy_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "failure_reason"  text,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),
  "completed_at"    timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_refunds_payment" ON "public"."refunds" ("payment_id");
CREATE INDEX IF NOT EXISTS "idx_refunds_registration" ON "public"."refunds" ("registration_id");
CREATE INDEX IF NOT EXISTS "idx_refunds_status" ON "public"."refunds" ("status");

-- One in-flight or successful refund per payment. A double-clicked cancel
-- button must not be able to refund twice; a previously FAILED attempt is
-- excluded so a retry is still possible.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_refunds_payment_live"
  ON "public"."refunds" ("payment_id")
  WHERE "status" IN ('pending', 'submitted', 'succeeded');

COMMENT ON TABLE "public"."refunds" IS
  'Audit record of refund decisions. One row per refund attempt against a payment. Written server-side only -- like payments, no client may insert or update. The money movement itself is recorded on payments.refunded_amount_cents by the charge.refunded webhook; this table records who decided, why, and under what policy.';

CREATE OR REPLACE TRIGGER "trg_refunds_updated_at"
  BEFORE UPDATE ON "public"."refunds"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;

-- Mirrors the payments policy set exactly: the payer reads their own, admins
-- read everything, and there is deliberately no INSERT/UPDATE/DELETE policy
-- for authenticated -- only the service role (which bypasses RLS) writes here.
-- Dropped first so the whole migration is safe to re-run; CREATE POLICY has no
-- IF NOT EXISTS, and these get applied by hand via the dashboard SQL editor
-- where a retry after a timeout is a real possibility.
DROP POLICY IF EXISTS "refunds: payer read own" ON "public"."refunds";
DROP POLICY IF EXISTS "refunds: admin full access" ON "public"."refunds";

CREATE POLICY "refunds: payer read own" ON "public"."refunds"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "public"."payments" p
       WHERE p.id = "refunds"."payment_id"
         AND p.payer_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "refunds: admin full access" ON "public"."refunds"
  USING ("public"."is_admin"());

-- ── compute_registration_refund ──────────────────────────────────────────────
-- The single source of truth for "what is this registration owed?". Returns a
-- breakdown rather than one number so the cancel dialog can explain the
-- deduction instead of surprising someone with a smaller figure than the
-- entry fee they remember paying.

CREATE OR REPLACE FUNCTION "public"."compute_registration_refund"(p_registration_id uuid)
RETURNS TABLE (
  eligible              boolean,
  refundable_cents      integer,
  non_refundable_cents  integer,
  cutoff_days           integer,
  days_until_event      integer,
  entry_payment_id      uuid,
  ineligible_reason     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reg        record;
  v_cutoff     integer;
  v_days       integer;
  v_entry      record;
  v_hold_cents integer := 0;
BEGIN
  SELECT r.id, r.status, r.tournament_id, r.stripe_entry_intent_id, r.stripe_hold_intent_id,
         t.event_date, t.refund_cutoff_days
    INTO v_reg
    FROM "public"."registrations" r
    JOIN "public"."tournaments" t ON t.id = r.tournament_id
   WHERE r.id = p_registration_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, 0, 0, NULL::uuid, 'registration_not_found';
    RETURN;
  END IF;

  v_cutoff := coalesce(v_reg.refund_cutoff_days, 15);
  v_days   := (v_reg.event_date - current_date);

  -- The entry/balance/team payment. Registrations record the settling intent
  -- id on the row itself (finalizeTournamentRegistrationEntry, _Balance and
  -- mark_registration_group_member_paid all set it), and
  -- payments.provider_payment_intent_id is UNIQUE -- so this is an exact join
  -- rather than a metadata match.
  SELECT p.id, p.amount_cents, p.refunded_amount_cents, p.status
    INTO v_entry
    FROM "public"."payments" p
   WHERE p.provider_payment_intent_id = v_reg.stripe_entry_intent_id
     AND v_reg.stripe_entry_intent_id IS NOT NULL;

  -- The Hold My Spot deposit, reported so the UI can show the deduction, never
  -- added to the refundable total. Non-refundable by policy, not by arithmetic.
  SELECT coalesce(p.amount_cents, 0)
    INTO v_hold_cents
    FROM "public"."payments" p
   WHERE p.provider_payment_intent_id = v_reg.stripe_hold_intent_id
     AND v_reg.stripe_hold_intent_id IS NOT NULL;

  v_hold_cents := coalesce(v_hold_cents, 0);

  IF v_entry.id IS NULL THEN
    RETURN QUERY SELECT false, 0, v_hold_cents, v_cutoff, v_days, NULL::uuid, 'no_entry_payment';
    RETURN;
  END IF;

  -- 'refunded' and 'partially_refunded' are settled states, not unsettled ones:
  -- the money did move. Treating them as unsettled reported a fully refunded
  -- payment as "not settled", and worse, blocked refunding the REMAINDER of a
  -- partially refunded one -- the amount arithmetic below already handles that
  -- case correctly, it just never got the chance to run.
  IF v_entry.status NOT IN ('succeeded', 'refunded', 'partially_refunded') THEN
    RETURN QUERY SELECT false, 0, v_hold_cents, v_cutoff, v_days, v_entry.id, 'entry_payment_not_settled';
    RETURN;
  END IF;

  IF v_entry.refunded_amount_cents >= v_entry.amount_cents THEN
    RETURN QUERY SELECT false, 0, v_hold_cents, v_cutoff, v_days, v_entry.id, 'already_refunded';
    RETURN;
  END IF;

  IF v_days < v_cutoff THEN
    RETURN QUERY SELECT false, 0, v_hold_cents + (v_entry.amount_cents - v_entry.refunded_amount_cents),
                        v_cutoff, v_days, v_entry.id, 'inside_cutoff_window';
    RETURN;
  END IF;

  RETURN QUERY SELECT true,
                      (v_entry.amount_cents - v_entry.refunded_amount_cents),
                      v_hold_cents,
                      v_cutoff, v_days, v_entry.id, NULL::text;
END;
$function$;

COMMENT ON FUNCTION "public"."compute_registration_refund"(uuid) IS
  'Server-side refund eligibility and amount for one registration. Returns the refundable total, the non-refundable portion (Hold My Spot deposit, and the whole amount when inside the cutoff) and the policy inputs used, so a caller can both act on it and explain it. Never include the hold deposit in refundable_cents.';

-- Readable by signed-in users: the cancel dialog needs the breakdown before
-- anything is committed, and it only ever reports on a registration the caller
-- must already be able to see. It changes nothing.
REVOKE ALL ON FUNCTION "public"."compute_registration_refund"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."compute_registration_refund"(uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."compute_registration_refund"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."compute_registration_refund"(uuid) TO "service_role";
