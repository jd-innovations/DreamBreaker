-- Supabase advisor flagged fn_protect_registration_payment_fields (added in
-- 20260809140000_shared_payment_foundation.sql) with a mutable search_path —
-- a known privilege-escalation vector. Pin it, matching the existing
-- is_admin() / is_facility_role_at_least() convention.

CREATE OR REPLACE FUNCTION "public"."fn_protect_registration_payment_fields"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.entry_fee_paid_cents <> 0 OR NEW.hold_fee_paid_cents <> 0
       OR NEW.stripe_hold_intent_id IS NOT NULL OR NEW.stripe_entry_intent_id IS NOT NULL THEN
      RAISE EXCEPTION 'entry_fee_paid_cents/hold_fee_paid_cents/stripe intent ids may only be set by the payment webhook handler';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.entry_fee_paid_cents IS DISTINCT FROM OLD.entry_fee_paid_cents
     OR NEW.hold_fee_paid_cents IS DISTINCT FROM OLD.hold_fee_paid_cents
     OR NEW.stripe_hold_intent_id IS DISTINCT FROM OLD.stripe_hold_intent_id
     OR NEW.stripe_entry_intent_id IS DISTINCT FROM OLD.stripe_entry_intent_id THEN
    RAISE EXCEPTION 'entry_fee_paid_cents/hold_fee_paid_cents/stripe intent ids may only be changed by the payment webhook handler';
  END IF;

  RETURN NEW;
END;
$$;
