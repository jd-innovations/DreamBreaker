-- Shared payment foundation (TODO1.1.md Task C7).
--
-- Domain-neutral, server-authoritative Stripe payment primitive shared by the
-- whole app — not specific to Coach Marketplace, tournaments, or any other
-- feature. A "purpose" (purpose_type + purpose_id) says what a payment is
-- for; this schema has no foreign keys into any feature table on purpose,
-- because the paying party for a purpose can vary by domain and future
-- domains (Coach Marketplace, etc.) must be addable without a migration here.
--
-- Money-state rule: a payment's status changes ONLY in response to a
-- verified Stripe webhook event (see stripe_webhook_events below for replay
-- protection). No RLS INSERT/UPDATE/DELETE policy is granted to
-- "authenticated" on either table — only the service role (which bypasses
-- RLS) may write, and only from the webhook handler / payment-intent-creation
-- server code, never directly from a client.
--
-- This migration also closes the concrete hole documented in
-- TODO1.1.md Task C7: apps/mobile/src/lib/supabase/registrations.ts writes
-- entry_fee_paid_cents / hold_fee_paid_cents directly from a client-supplied
-- amount (see register.tsx's entryAmountCents route param). The trigger below
-- blocks any non-service-role write that touches those columns (or the
-- Stripe intent id columns) with a nonzero value. $0 (free) registrations are
-- untouched — no payment is ever involved there.

-- ── payments ───────────────────────────────────────────────────────────────

CREATE TYPE "public"."payment_status" AS ENUM (
  'requires_confirmation',
  'processing',
  'succeeded',
  'failed',
  'canceled',
  'refunded',
  'partially_refunded'
);

CREATE TABLE "public"."payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What this payment is for. Free-text/uuid rather than a FK so any current
  -- or future domain (tournament_registration_entry, tournament_registration_hold,
  -- coach_offer_purchase, ...) can use this table without a schema change.
  "purpose_type" text NOT NULL,
  "purpose_id" uuid NOT NULL,
  "payer_user_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "provider" text NOT NULL DEFAULT 'stripe',
  "provider_payment_intent_id" text UNIQUE,
  "status" "public"."payment_status" NOT NULL DEFAULT 'requires_confirmation',
  "amount_cents" integer NOT NULL CHECK ("amount_cents" > 0),
  "refunded_amount_cents" integer NOT NULL DEFAULT 0 CHECK ("refunded_amount_cents" >= 0),
  "currency" text NOT NULL DEFAULT 'usd',
  -- Caller-supplied, unique per attempt — lets a retried client request reuse
  -- the same PaymentIntent instead of creating a duplicate charge.
  "idempotency_key" text UNIQUE,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "failure_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "confirmed_at" timestamptz,
  "failed_at" timestamptz,
  CONSTRAINT "payments_refund_not_over_amount" CHECK ("refunded_amount_cents" <= "amount_cents")
);

CREATE INDEX "idx_payments_purpose" ON "public"."payments" ("purpose_type", "purpose_id");
CREATE INDEX "idx_payments_payer" ON "public"."payments" ("payer_user_id");
CREATE INDEX "idx_payments_provider_intent" ON "public"."payments" ("provider_payment_intent_id");

COMMENT ON TABLE "public"."payments" IS
  'Domain-neutral, server-authoritative payment record. Status transitions only from a verified Stripe webhook event (see stripe_webhook_events) — never client-writable. purpose_type/purpose_id is a soft pointer, not a FK, so new domains never require a migration here.';

CREATE OR REPLACE TRIGGER "trg_payments_updated_at"
  BEFORE UPDATE ON "public"."payments"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments: payer read own" ON "public"."payments"
  FOR SELECT USING ("payer_user_id" = (SELECT auth.uid()));

CREATE POLICY "payments: admin full access" ON "public"."payments"
  USING ("public"."is_admin"());

-- Deliberately no INSERT/UPDATE/DELETE policy for "authenticated" — only the
-- service role (which bypasses RLS) may write payments rows.

-- ── stripe_webhook_events ────────────────────────────────────────────────────
-- Idempotency ledger for Stripe webhook delivery. Stripe redelivers events on
-- timeout/error; the handler must insert the event_id here before acting on
-- it, and a unique-violation on that insert means "already processed, skip."

CREATE TABLE "public"."stripe_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" text NOT NULL UNIQUE,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE "public"."stripe_webhook_events" IS
  'Replay/idempotency guard for Stripe webhook delivery. One row per event_id — a duplicate delivery hits the unique constraint and is a no-op.';

ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
-- No policies at all: fully locked to the service role. Not even admin read
-- access is needed here (payments.metadata / failure_reason cover ops needs).

-- ── Close the C7 hole on registrations ───────────────────────────────────────
-- Existing RLS ("registrations: player update own") lets a player UPDATE any
-- column on their own row as long as the resulting status is 'withdrawn' or
-- the row already has a waiver acceptance — it does not protect individual
-- columns. INSERT policies have the same gap. This trigger closes both paths
-- for the payment-related columns specifically, without touching the
-- legitimate client/director actions (withdraw, check-in, no-show, waitlist)
-- that don't touch money.

CREATE OR REPLACE FUNCTION "public"."fn_protect_registration_payment_fields"()
  RETURNS trigger
  LANGUAGE plpgsql
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

  -- UPDATE: these columns may only change via the service role (i.e. from a
  -- confirmed Stripe webhook). Free ($0) rows and every non-payment column
  -- (status transitions for withdraw/check-in/no-show/waitlist, etc.) are
  -- unaffected.
  IF NEW.entry_fee_paid_cents IS DISTINCT FROM OLD.entry_fee_paid_cents
     OR NEW.hold_fee_paid_cents IS DISTINCT FROM OLD.hold_fee_paid_cents
     OR NEW.stripe_hold_intent_id IS DISTINCT FROM OLD.stripe_hold_intent_id
     OR NEW.stripe_entry_intent_id IS DISTINCT FROM OLD.stripe_entry_intent_id THEN
    RAISE EXCEPTION 'entry_fee_paid_cents/hold_fee_paid_cents/stripe intent ids may only be changed by the payment webhook handler';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."fn_protect_registration_payment_fields" IS
  'Blocks client/director writes to registrations payment columns (TODO1.1.md C7). Only the service role — i.e. the Stripe webhook handler, after a confirmed PaymentIntent — may set these.';

CREATE TRIGGER "trg_protect_registration_payment_fields"
  BEFORE INSERT OR UPDATE ON "public"."registrations"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_protect_registration_payment_fields"();
