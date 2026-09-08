-- Real Stripe saved-payment-methods support (apps/mobile payments-settings.tsx
-- previously showed a hardcoded "Visa •••• 4321" placeholder — see that
-- file's own TODO comment). profiles.stripe_customer_id already existed
-- (baseline migration) but was never populated by anything; this is the
-- first feature to write it.
--
-- Same money-state discipline as payments/stripe_webhook_events
-- (20260809232329_shared_payment_foundation.sql): no client
-- INSERT/UPDATE/DELETE grant on payment_methods. All writes happen from
-- server code (the confirm-payment-method / delete-payment-method edge
-- functions, after a server-side round trip to Stripe — never from a
-- client-supplied card brand/last4) or from the set_default_payment_method
-- RPC below, which is SECURITY DEFINER but still scoped to the caller's own
-- rows and does not touch Stripe at all (a preference flag, not a money or
-- card-identity change), so a direct RPC is the right level of ceremony for
-- it rather than a dedicated edge function.

CREATE TABLE "public"."payment_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "stripe_payment_method_id" text NOT NULL UNIQUE,
  -- Snapshotted from Stripe at attach time (confirm-payment-method), not
  -- re-derived later — matches how payments snapshots amount_cents rather
  -- than re-pricing on read.
  "brand" text NOT NULL,
  "last4" text NOT NULL,
  "exp_month" smallint NOT NULL CHECK ("exp_month" BETWEEN 1 AND 12),
  "exp_year" smallint NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_payment_methods_profile" ON "public"."payment_methods" ("profile_id");

COMMENT ON TABLE "public"."payment_methods" IS
  'Saved card metadata mirrored from Stripe (Customer + PaymentMethod). Server-written only — see confirm-payment-method and delete-payment-method edge functions. Card brand/last4/exp are a snapshot at attach time, matching the payments table''s amount_cents snapshot convention.';

CREATE OR REPLACE TRIGGER "trg_payment_methods_updated_at"
  BEFORE UPDATE ON "public"."payment_methods"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_methods: owner read own" ON "public"."payment_methods"
  FOR SELECT USING ("profile_id" = (SELECT auth.uid()));

CREATE POLICY "payment_methods: admin full access" ON "public"."payment_methods"
  USING ("public"."is_admin"());

-- Deliberately no INSERT/UPDATE/DELETE policy for "authenticated" — only the
-- service role (edge functions, after a verified Stripe round trip) writes
-- card rows. set_default_payment_method below is the one client-callable
-- write path, and it is a controlled RPC, not a raw grant.

CREATE OR REPLACE FUNCTION "public"."set_default_payment_method"(p_payment_method_id uuid)
RETURNS "public"."payment_methods"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_profile_id uuid;
  v_result "public"."payment_methods";
BEGIN
  SELECT profile_id INTO v_profile_id
    FROM "public"."payment_methods"
   WHERE id = p_payment_method_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'payment method not found';
  END IF;

  IF v_profile_id <> auth.uid() THEN
    -- Same "not found" as a missing row, not "forbidden" — do not confirm
    -- another user's card id exists.
    RAISE EXCEPTION 'payment method not found';
  END IF;

  UPDATE "public"."payment_methods"
     SET is_default = (id = p_payment_method_id)
   WHERE profile_id = v_profile_id
     AND is_default <> (id = p_payment_method_id);

  SELECT * INTO v_result FROM "public"."payment_methods" WHERE id = p_payment_method_id;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION "public"."set_default_payment_method"(uuid) IS
  'Marks one of the caller''s own saved cards as default, unsetting any other. SECURITY DEFINER only to read/write across the no-client-UPDATE RLS gap on payment_methods -- still scoped to auth.uid() internally, and touches no Stripe state.';

REVOKE ALL ON FUNCTION "public"."set_default_payment_method"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_default_payment_method"(uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."set_default_payment_method"(uuid) TO "authenticated";
