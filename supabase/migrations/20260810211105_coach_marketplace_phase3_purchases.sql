-- Coach Marketplace V1 — Phase 3: Coach Purchase + Financial Ledger.
--
-- Per COACH_MARKETPLACE_V1_SPEC.md (full spec, read into context this
-- session) and the phased implementation plan. This migration establishes
-- the authoritative purchase + financial-accounting foundation that Phase 4
-- (Wallet vouchers), Phase 5 (redemption), and Phase 6 (payouts) will later
-- consume. It does NOT create Wallet vouchers, redemption credentials, or
-- payout logic — those are later phases, deliberately deferred.
--
-- STRIPE: no PaymentIntent is created here. createPayment() (the Phase 0
-- Stripe-calling primitive) is NOT invoked by this migration or by the RPC
-- below. Payment-success is exercised exclusively via the existing
-- dev-only /api/dev/simulate-payment route + finalizePaymentSucceeded(),
-- per explicit instruction: Stripe connectivity is a deferred release gate,
-- not a development dependency for this phase.
--
-- CLIENT NEVER AUTHORITATIVE FOR MONEY: every price/commission/fee/tax
-- value on coach_offer_purchases is computed server-side inside
-- create_coach_offer_purchase() (SECURITY DEFINER) from platform_settings,
-- coach_offers, and profiles — the client may only supply offer_id and a
-- participant quantity (validated against offer.max_participants).

-- ── profiles: coach-specific commission override (spec §8, §49) ────────────
-- Per-coach commission override, admin-set only. Mirrors the
-- coach_status client-self-escalation protection pattern
-- (fn_protect_coach_status_transitions, Phase 1) — a coach must never be
-- able to grant themselves a lower commission rate.

ALTER TABLE "public"."profiles"
  ADD COLUMN "coach_commission_override_pct" numeric CHECK ("coach_commission_override_pct" IS NULL OR ("coach_commission_override_pct" >= 0 AND "coach_commission_override_pct" <= 100));

COMMENT ON COLUMN "public"."profiles"."coach_commission_override_pct" IS
  'Admin-set per-coach commission override (spec §8). NULL = no override, falls through to platform default. Never client-writable — see trg_protect_coach_commission_override.';

CREATE OR REPLACE FUNCTION "public"."fn_protect_coach_commission_override"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.coach_commission_override_pct IS DISTINCT FROM OLD.coach_commission_override_pct THEN
    RAISE EXCEPTION 'coach_commission_override_pct may only be set by an administrator';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."fn_protect_coach_commission_override" IS
  'Blocks client writes to profiles.coach_commission_override_pct. Coach Marketplace V1 Phase 3.';

CREATE TRIGGER "trg_protect_coach_commission_override"
  BEFORE UPDATE ON "public"."profiles"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_protect_coach_commission_override"();

REVOKE EXECUTE ON FUNCTION "public"."fn_protect_coach_commission_override"() FROM PUBLIC, anon, authenticated;

-- ── coach_offers: per-offer commission override (spec §8, §49) ─────────────

ALTER TABLE "public"."coach_offers"
  ADD COLUMN "commission_override_pct" numeric CHECK ("commission_override_pct" IS NULL OR ("commission_override_pct" >= 0 AND "commission_override_pct" <= 100));

COMMENT ON COLUMN "public"."coach_offers"."commission_override_pct" IS
  'Admin-set per-offer commission override (spec §8), highest precedence. NULL = no override. Offer owner update RLS already allows writes to this column today — acceptable for V1 since only admin tooling is expected to set it in practice, but note this is NOT trigger-protected like the coach-level override. Flagged, not fixed, to keep this migration scoped to purchase/ledger schema.';

-- ── Purchase + processing-fee status enums ──────────────────────────────────
-- Deliberately narrow: PURCHASE STATE only. Redemption state (Phase 5) and
-- payout state (Phase 6) are logically distinct and must not be folded into
-- this enum (spec: "Keep PAYMENT STATE / PURCHASE STATE / REDEMPTION STATE
-- / PAYOUT STATE logically distinct"). PAYMENT STATE already exists as
-- public.payment_status on the payments table (Phase 0) and is not
-- duplicated here.
--
-- 'refunded' is included so the schema does not make future refund
-- workflows (Phase 7) impossible, even though nothing in this migration
-- ever transitions a row into it yet.

CREATE TYPE "public"."coach_offer_purchase_status" AS ENUM (
  'payment_pending',
  'finalized',
  'failed',
  'cancelled',
  'refunded'
);

CREATE TYPE "public"."coach_offer_purchase_processing_fee_status" AS ENUM (
  'pending_reconciliation',
  'reconciled',
  'not_applicable_dev_test'
);

-- ── coach_offer_purchases ────────────────────────────────────────────────────
--
-- One row per purchase attempt. Created in 'payment_pending' status by
-- create_coach_offer_purchase() below — that RPC call IS the "PURCHASE
-- INITIATED" step from the spec's lifecycle; no separate persisted
-- "initiated" row exists prior to it (if validation fails, no row is ever
-- inserted). All commercial terms are snapshotted and locked at creation —
-- see trg_protect_coach_offer_purchase_immutable_terms — and are never
-- revalidated or recomputed at finalization, so a coach editing price or an
-- admin changing commission mid-checkout can never alter a purchase whose
-- payment has already been requested.
--
-- INVENTORY TIMING (spec "Inventory Timing" section): two mechanisms work
-- together, both required:
--   1. At creation, create_coach_offer_purchases() locks the coach_offers
--      row (SELECT ... FOR UPDATE) and checks
--      coach_offers.quantity_remaining minus the live sum of OTHER
--      not-yet-expired 'payment_pending' rows for the same offer. This is
--      the "reservation hold" — self-healing (an abandoned/expired hold
--      simply ages out of that live SUM once inventory_hold_expires_at
--      passes) with no cron/sweep job required.
--   2. coach_offers.quantity_remaining itself is only ever decremented once,
--      at finalization (see finalizePayment.ts), guarded by the same
--      payment/purchase idempotency check that prevents double-finalization
--      — matching the Phase 2 column comment ("decremented at purchase
--      time... no purchase logic touches it yet").
-- Together: a payment_pending hold prevents overselling during the
-- checkout window; the finalization-time decrement is what actually
-- permanently depletes inventory for a completed sale.

CREATE TABLE "public"."coach_offer_purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "offer_id" uuid NOT NULL REFERENCES "public"."coach_offers"("id"),
  "coach_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "buyer_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),

  -- Offer snapshot — immutable, independent of later edits to coach_offers.
  "offer_title" text NOT NULL,
  "offer_type" "public"."coach_offer_type" NOT NULL,
  "facility_id" uuid REFERENCES "public"."facilities"("id"),
  "lessons_included" integer,
  "participant_quantity" integer NOT NULL CHECK ("participant_quantity" > 0),

  -- Pricing snapshot.
  "regular_price_cents" integer NOT NULL CHECK ("regular_price_cents" > 0),
  "selling_price_cents" integer NOT NULL CHECK ("selling_price_cents" > 0 AND "selling_price_cents" <= "regular_price_cents"),
  "discount_pct" numeric NOT NULL,
  -- Premium membership infrastructure does not exist anywhere in this repo
  -- yet (verified: no is_premium/premium tier column on profiles or
  -- elsewhere). Both flags are therefore always false in V1 — a
  -- premium_only offer is rejected outright at purchase time rather than
  -- fabricating entitlement. See create_coach_offer_purchase() and the
  -- "Known Gaps" section of the Phase 3 handoff.
  "premium_price_applied" boolean NOT NULL DEFAULT false,
  "premium_eligible_at_purchase" boolean NOT NULL DEFAULT false,
  "currency" text NOT NULL DEFAULT 'usd',

  "gross_selling_price_cents" integer NOT NULL CHECK ("gross_selling_price_cents" > 0),

  -- Buyer-side additions. Tax is not implemented — see tax_status.
  "buyer_service_fee_cents" integer NOT NULL DEFAULT 0 CHECK ("buyer_service_fee_cents" >= 0),
  "tax_amount_cents" integer NOT NULL DEFAULT 0 CHECK ("tax_amount_cents" >= 0),
  "tax_status" text NOT NULL DEFAULT 'not_yet_implemented',
  "buyer_total_charged_cents" integer NOT NULL CHECK ("buyer_total_charged_cents" > 0),

  -- Commission snapshot — resolution precedence: offer override -> coach
  -- override -> platform default (spec §8). Never trust a client value.
  "commission_source" text NOT NULL CHECK ("commission_source" IN ('offer_override', 'coach_override', 'platform_default')),
  "commission_pct" numeric NOT NULL CHECK ("commission_pct" >= 0 AND "commission_pct" <= 100),
  "platform_commission_amount_cents" integer NOT NULL CHECK ("platform_commission_amount_cents" >= 0),

  -- Boost snapshot — reserved for Phase 9. Always false/0 until a real
  -- boost system exists; the client can never claim boost attribution.
  "boost_attributed" boolean NOT NULL DEFAULT false,
  "boost_commission_pct" numeric NOT NULL DEFAULT 0 CHECK ("boost_commission_pct" >= 0),
  "boost_commission_amount_cents" integer NOT NULL DEFAULT 0 CHECK ("boost_commission_amount_cents" >= 0),

  -- Stripe processing fee is unknown until Stripe provides the balance
  -- transaction. 'not_applicable_dev_test' is set by finalizePayment.ts
  -- when the underlying payments row has provider='dev_test'. Real
  -- payments start 'pending_reconciliation' and stay there — no
  -- reconciliation writer exists yet (Phase 6+); this column exists so one
  -- can be added later without a schema change or rewriting purchase terms.
  "processing_fee_status" "public"."coach_offer_purchase_processing_fee_status" NOT NULL DEFAULT 'pending_reconciliation',
  "processing_fee_cents" integer,

  -- Coach net proceeds = gross - platform commission - boost commission.
  -- Deliberately excludes buyer_service_fee_cents and tax_amount_cents
  -- (never coach revenue) and excludes processing_fee_cents (unknown at
  -- purchase time) — hence "provisional" until a future reconciliation
  -- phase adjusts it via an append-only ledger event, never by silently
  -- rewriting this column's history.
  "coach_net_proceeds_cents" integer NOT NULL CHECK ("coach_net_proceeds_cents" >= 0),
  "coach_net_proceeds_provisional" boolean NOT NULL DEFAULT true,

  "status" "public"."coach_offer_purchase_status" NOT NULL DEFAULT 'payment_pending',
  "inventory_hold_expires_at" timestamptz NOT NULL,
  "paid_at" timestamptz,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "coach_offer_purchases_gross_formula" CHECK (
    "gross_selling_price_cents" = "selling_price_cents" * "participant_quantity"
  ),
  CONSTRAINT "coach_offer_purchases_buyer_total_formula" CHECK (
    "buyer_total_charged_cents" = "gross_selling_price_cents" + "buyer_service_fee_cents" + "tax_amount_cents"
  ),
  CONSTRAINT "coach_offer_purchases_net_proceeds_formula" CHECK (
    "coach_net_proceeds_cents" = "gross_selling_price_cents" - "platform_commission_amount_cents" - "boost_commission_amount_cents"
  )
);

CREATE INDEX "idx_coach_offer_purchases_offer" ON "public"."coach_offer_purchases" ("offer_id");
CREATE INDEX "idx_coach_offer_purchases_buyer" ON "public"."coach_offer_purchases" ("buyer_id");
CREATE INDEX "idx_coach_offer_purchases_coach" ON "public"."coach_offer_purchases" ("coach_id");
CREATE INDEX "idx_coach_offer_purchases_status" ON "public"."coach_offer_purchases" ("status");
-- Supports the live "active hold" aggregate query in create_coach_offer_purchase().
CREATE INDEX "idx_coach_offer_purchases_pending_holds" ON "public"."coach_offer_purchases" ("offer_id", "inventory_hold_expires_at") WHERE "status" = 'payment_pending';

COMMENT ON TABLE "public"."coach_offer_purchases" IS
  'Coach Marketplace V1 Phase 3. Authoritative purchase + financial snapshot. No Wallet voucher, redemption, or payout logic here (Phase 4/5/6). purpose_id target for payments.purpose_type = ''coach_offer_purchase''.';

CREATE OR REPLACE TRIGGER "trg_coach_offer_purchases_updated_at"
  BEFORE UPDATE ON "public"."coach_offer_purchases"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- Immutability + status-transition guard. Applies even to the service role
-- — defense in depth against a future bug in finalization code
-- accidentally rewriting economic terms or double-finalizing a purchase.
-- Mutable columns (allowed to change after INSERT): status, paid_at,
-- processing_fee_status, processing_fee_cents, coach_net_proceeds_cents,
-- coach_net_proceeds_provisional, updated_at. Everything else is locked
-- for the life of the row.

CREATE OR REPLACE FUNCTION "public"."fn_protect_coach_offer_purchase_integrity"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
BEGIN
  IF NEW.offer_id IS DISTINCT FROM OLD.offer_id
     OR NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.offer_title IS DISTINCT FROM OLD.offer_title
     OR NEW.offer_type IS DISTINCT FROM OLD.offer_type
     OR NEW.facility_id IS DISTINCT FROM OLD.facility_id
     OR NEW.lessons_included IS DISTINCT FROM OLD.lessons_included
     OR NEW.participant_quantity IS DISTINCT FROM OLD.participant_quantity
     OR NEW.regular_price_cents IS DISTINCT FROM OLD.regular_price_cents
     OR NEW.selling_price_cents IS DISTINCT FROM OLD.selling_price_cents
     OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct
     OR NEW.premium_price_applied IS DISTINCT FROM OLD.premium_price_applied
     OR NEW.premium_eligible_at_purchase IS DISTINCT FROM OLD.premium_eligible_at_purchase
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.gross_selling_price_cents IS DISTINCT FROM OLD.gross_selling_price_cents
     OR NEW.buyer_service_fee_cents IS DISTINCT FROM OLD.buyer_service_fee_cents
     OR NEW.tax_amount_cents IS DISTINCT FROM OLD.tax_amount_cents
     OR NEW.tax_status IS DISTINCT FROM OLD.tax_status
     OR NEW.buyer_total_charged_cents IS DISTINCT FROM OLD.buyer_total_charged_cents
     OR NEW.commission_source IS DISTINCT FROM OLD.commission_source
     OR NEW.commission_pct IS DISTINCT FROM OLD.commission_pct
     OR NEW.platform_commission_amount_cents IS DISTINCT FROM OLD.platform_commission_amount_cents
     OR NEW.boost_attributed IS DISTINCT FROM OLD.boost_attributed
     OR NEW.boost_commission_pct IS DISTINCT FROM OLD.boost_commission_pct
     OR NEW.boost_commission_amount_cents IS DISTINCT FROM OLD.boost_commission_amount_cents
     OR NEW.inventory_hold_expires_at IS DISTINCT FROM OLD.inventory_hold_expires_at
  THEN
    RAISE EXCEPTION 'coach_offer_purchases economic/snapshot terms are immutable after creation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'payment_pending' AND NEW.status IN ('finalized', 'failed', 'cancelled')) THEN
      RAISE EXCEPTION 'invalid coach_offer_purchases status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."fn_protect_coach_offer_purchase_integrity" IS
  'Locks economic/snapshot columns for the life of a row and restricts status transitions to payment_pending -> {finalized, failed, cancelled}. Applies even to service_role. Coach Marketplace V1 Phase 3.';

CREATE TRIGGER "trg_protect_coach_offer_purchase_integrity"
  BEFORE UPDATE ON "public"."coach_offer_purchases"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_protect_coach_offer_purchase_integrity"();

REVOKE EXECUTE ON FUNCTION "public"."fn_protect_coach_offer_purchase_integrity"() FROM PUBLIC, anon, authenticated;

ALTER TABLE "public"."coach_offer_purchases" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_offer_purchases: buyer read own" ON "public"."coach_offer_purchases"
  FOR SELECT USING ("buyer_id" = (SELECT auth.uid()));

CREATE POLICY "coach_offer_purchases: coach read own" ON "public"."coach_offer_purchases"
  FOR SELECT USING ("coach_id" = (SELECT auth.uid()));

CREATE POLICY "coach_offer_purchases: admin full access" ON "public"."coach_offer_purchases"
  USING ("public"."is_admin"());

-- Deliberately no INSERT/UPDATE/DELETE policy for "authenticated" — rows
-- are created only via create_coach_offer_purchase() (SECURITY DEFINER,
-- bypasses RLS) and finalized only via the service role from
-- finalizePayment.ts. A client can never mark its own purchase paid.

-- ── coach_offer_purchase_ledger_events ───────────────────────────────────────
-- Append-only financial audit log (spec §9, §50). Phase 3 only ever inserts
-- a single 'purchase' event at finalization. Every other event_type exists
-- so later phases (refund, payout, admin_adjustment, ...) never require a
-- schema migration to add a new kind of financial event — only new writer
-- code. Immutable at the database level: the block trigger below rejects
-- UPDATE/DELETE unconditionally, including for service_role.

CREATE TABLE "public"."coach_offer_purchase_ledger_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchase_id" uuid NOT NULL REFERENCES "public"."coach_offer_purchases"("id"),
  "event_type" text NOT NULL CHECK ("event_type" IN (
    'purchase', 'commission', 'processing_fee_reconciled', 'refund', 'reversal',
    'coach_penalty', 'payout', 'payout_reversal', 'admin_adjustment'
  )),
  "amount_cents" integer,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "public"."profiles"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_coach_offer_purchase_ledger_events_purchase" ON "public"."coach_offer_purchase_ledger_events" ("purchase_id");
CREATE INDEX "idx_coach_offer_purchase_ledger_events_type" ON "public"."coach_offer_purchase_ledger_events" ("event_type");

COMMENT ON TABLE "public"."coach_offer_purchase_ledger_events" IS
  'Append-only financial audit log for Coach Marketplace purchases (spec §50). Rows are never updated or deleted — see trg_block_ledger_event_mutation. Phase 3 writes only ''purchase'' events; other event_type values are reserved for Phase 6/7.';

CREATE OR REPLACE FUNCTION "public"."fn_block_ledger_event_mutation"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
BEGIN
  RAISE EXCEPTION 'coach_offer_purchase_ledger_events rows are immutable — append a new event, never update or delete an existing one';
END;
$$;

COMMENT ON FUNCTION "public"."fn_block_ledger_event_mutation" IS
  'Unconditionally rejects UPDATE/DELETE on coach_offer_purchase_ledger_events, including for service_role. True database-level immutability for the financial audit log.';

CREATE TRIGGER "trg_block_ledger_event_mutation"
  BEFORE UPDATE OR DELETE ON "public"."coach_offer_purchase_ledger_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_block_ledger_event_mutation"();

REVOKE EXECUTE ON FUNCTION "public"."fn_block_ledger_event_mutation"() FROM PUBLIC, anon, authenticated;

ALTER TABLE "public"."coach_offer_purchase_ledger_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_offer_purchase_ledger_events: buyer read own" ON "public"."coach_offer_purchase_ledger_events"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.coach_offer_purchases p
    WHERE p.id = "purchase_id" AND p.buyer_id = (SELECT auth.uid())
  ));

CREATE POLICY "coach_offer_purchase_ledger_events: coach read own" ON "public"."coach_offer_purchase_ledger_events"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.coach_offer_purchases p
    WHERE p.id = "purchase_id" AND p.coach_id = (SELECT auth.uid())
  ));

CREATE POLICY "coach_offer_purchase_ledger_events: admin full access" ON "public"."coach_offer_purchase_ledger_events"
  USING ("public"."is_admin"());

-- No INSERT policy for authenticated — only the service role (from
-- finalizePayment.ts) ever writes a ledger event.

-- ── create_coach_offer_purchase(): the ONLY way a purchase row is created ──
--
-- SECURITY DEFINER — runs as the function owner so it can bypass RLS to
-- INSERT into coach_offer_purchases (no client INSERT policy exists) and
-- read profiles.coach_commission_override_pct regardless of caller. Callers
-- authenticate normally (auth.uid() from their own JWT); the function
-- itself enforces every business rule server-side. The client supplies
-- only p_offer_id and p_participant_quantity — every price, commission,
-- fee, and tax value is resolved from trusted server-side data.

CREATE OR REPLACE FUNCTION "public"."create_coach_offer_purchase"(
  "p_offer_id" uuid,
  "p_participant_quantity" integer DEFAULT 1
)
  RETURNS "public"."coach_offer_purchases"
  LANGUAGE plpgsql SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_buyer_id uuid := auth.uid();
  v_offer public.coach_offers%ROWTYPE;
  v_qty integer := GREATEST(COALESCE(p_participant_quantity, 1), 1);
  v_base_commission_pct numeric;
  v_coach_commission_override numeric;
  v_commission_pct numeric;
  v_commission_source text;
  v_selling_price_cents integer;
  v_gross_cents integer;
  v_fee_mode text;
  v_fee_amount numeric;
  v_service_fee_cents integer;
  v_platform_commission_cents integer;
  v_buyer_total_cents integer;
  v_reserved_qty integer;
  v_existing_qty integer;
  v_hold_expires timestamptz := now() + interval '15 minutes';
  v_row public.coach_offer_purchases;
BEGIN
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Lock the offer row so concurrent purchase attempts for the same offer
  -- serialize here — the inventory/limit checks below read a consistent,
  -- locked snapshot. This is what makes the "reserved" aggregate query
  -- concurrency-safe without a separate mutable counter.
  SELECT * INTO v_offer FROM public.coach_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer_not_found';
  END IF;

  IF v_offer.status != 'active' THEN
    RAISE EXCEPTION 'offer_not_active';
  END IF;

  IF v_offer.coach_id = v_buyer_id THEN
    RAISE EXCEPTION 'cannot_purchase_own_offer';
  END IF;

  IF NOT public.is_coach_publish_ready(v_offer.coach_id) THEN
    RAISE EXCEPTION 'coach_not_publish_ready';
  END IF;

  -- No Premium membership infrastructure exists yet anywhere in this repo.
  -- Rather than fabricate entitlement, a premium_only offer cannot be
  -- purchased by anyone in V1. See table comment / Known Gaps.
  IF v_offer.premium_only THEN
    RAISE EXCEPTION 'premium_membership_not_available';
  END IF;

  IF v_offer.max_participants IS NOT NULL AND v_qty > v_offer.max_participants THEN
    RAISE EXCEPTION 'participant_quantity_exceeds_offer_max';
  END IF;

  -- Inventory: quantity_remaining already reflects finalized sales
  -- (decremented at finalization). Subtract currently-active, unexpired
  -- payment_pending holds for this offer to get true availability right now.
  IF v_offer.quantity_remaining IS NOT NULL THEN
    SELECT COALESCE(SUM(participant_quantity), 0) INTO v_reserved_qty
    FROM public.coach_offer_purchases
    WHERE offer_id = p_offer_id
      AND status = 'payment_pending'
      AND inventory_hold_expires_at > now();

    IF (v_offer.quantity_remaining - v_reserved_qty) < v_qty THEN
      RAISE EXCEPTION 'offer_sold_out';
    END IF;
  END IF;

  -- Purchase limit per customer: finalized purchases plus this buyer's own
  -- currently-active pending holds count toward the limit, so a buyer can't
  -- bypass it by opening multiple simultaneous checkout attempts.
  IF v_offer.purchase_limit_per_customer IS NOT NULL THEN
    SELECT COALESCE(SUM(participant_quantity), 0) INTO v_existing_qty
    FROM public.coach_offer_purchases
    WHERE offer_id = p_offer_id
      AND buyer_id = v_buyer_id
      AND (status = 'finalized' OR (status = 'payment_pending' AND inventory_hold_expires_at > now()));

    IF (v_existing_qty + v_qty) > v_offer.purchase_limit_per_customer THEN
      RAISE EXCEPTION 'purchase_limit_exceeded';
    END IF;
  END IF;

  -- Price: always the standard discounted price. No buyer is ever treated
  -- as Premium in V1 (see premium_eligible_at_purchase comment).
  v_selling_price_cents := v_offer.discounted_price_cents;
  v_gross_cents := v_selling_price_cents * v_qty;

  -- Commission resolution: offer override -> coach override -> platform default.
  SELECT "value"::numeric INTO v_base_commission_pct
  FROM public.platform_settings WHERE "key" = 'coach_marketplace_base_commission_pct';
  v_base_commission_pct := COALESCE(v_base_commission_pct, 0);

  SELECT coach_commission_override_pct INTO v_coach_commission_override
  FROM public.profiles WHERE id = v_offer.coach_id;

  IF v_offer.commission_override_pct IS NOT NULL THEN
    v_commission_pct := v_offer.commission_override_pct;
    v_commission_source := 'offer_override';
  ELSIF v_coach_commission_override IS NOT NULL THEN
    v_commission_pct := v_coach_commission_override;
    v_commission_source := 'coach_override';
  ELSE
    v_commission_pct := v_base_commission_pct;
    v_commission_source := 'platform_default';
  END IF;

  v_platform_commission_cents := ROUND(v_gross_cents * v_commission_pct / 100.0);

  -- Buyer service fee (spec §10). V1 default is 'disabled' -> $0.
  SELECT "value" INTO v_fee_mode
  FROM public.platform_settings WHERE "key" = 'coach_marketplace_buyer_service_fee_mode';
  SELECT "value"::numeric INTO v_fee_amount
  FROM public.platform_settings WHERE "key" = 'coach_marketplace_buyer_service_fee_amount';
  v_fee_amount := COALESCE(v_fee_amount, 0);

  v_service_fee_cents := CASE COALESCE(v_fee_mode, 'disabled')
    WHEN 'fixed' THEN ROUND(v_fee_amount)::integer
    WHEN 'percentage' THEN ROUND(v_gross_cents * v_fee_amount / 100.0)::integer
    ELSE 0
  END;

  -- Tax is not implemented (spec §11) — always 0, status documents why.
  v_buyer_total_cents := v_gross_cents + v_service_fee_cents;

  INSERT INTO public.coach_offer_purchases (
    offer_id, coach_id, buyer_id,
    offer_title, offer_type, facility_id, lessons_included, participant_quantity,
    regular_price_cents, selling_price_cents, discount_pct,
    premium_price_applied, premium_eligible_at_purchase, currency,
    gross_selling_price_cents, buyer_service_fee_cents, tax_amount_cents, tax_status,
    buyer_total_charged_cents,
    commission_source, commission_pct, platform_commission_amount_cents,
    boost_attributed, boost_commission_pct, boost_commission_amount_cents,
    processing_fee_status, coach_net_proceeds_cents, coach_net_proceeds_provisional,
    status, inventory_hold_expires_at
  ) VALUES (
    v_offer.id, v_offer.coach_id, v_buyer_id,
    v_offer.title, v_offer.offer_type, v_offer.facility_id, v_offer.lessons_included, v_qty,
    v_offer.regular_price_cents, v_selling_price_cents,
    ROUND((1 - (v_selling_price_cents::numeric / NULLIF(v_offer.regular_price_cents, 0))) * 100, 2),
    false, false, 'usd',
    v_gross_cents, v_service_fee_cents, 0, 'not_yet_implemented',
    v_buyer_total_cents,
    v_commission_source, v_commission_pct, v_platform_commission_cents,
    false, 0, 0,
    'pending_reconciliation', (v_gross_cents - v_platform_commission_cents), true,
    'payment_pending', v_hold_expires
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION "public"."create_coach_offer_purchase" IS
  'The only way a coach_offer_purchases row is created. SECURITY DEFINER — resolves price/commission/fee server-side from platform_settings, coach_offers, and profiles; the client supplies only offer_id and participant quantity. Coach Marketplace V1 Phase 3.';

REVOKE EXECUTE ON FUNCTION "public"."create_coach_offer_purchase"(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."create_coach_offer_purchase"(uuid, integer) TO authenticated;

-- ── finalize_coach_offer_purchase_inventory(): atomic finalization-time decrement ──
--
-- Called exactly once per purchase, from finalizePayment.ts's
-- finalizeCoachOfferPurchase(), guarded by that function's own
-- payment_pending status check (so this never double-decrements). A single
-- UPDATE...WHERE statement is atomic under Postgres row locking — safe
-- against concurrent finalizations of *different* purchases against the
-- same offer, without needing an explicit SELECT ... FOR UPDATE here.
-- NULL quantity_remaining means unlimited inventory; the WHERE clause
-- leaves those offers untouched.

CREATE OR REPLACE FUNCTION "public"."finalize_coach_offer_purchase_inventory"(
  "p_offer_id" uuid,
  "p_quantity" integer
)
  RETURNS void
  LANGUAGE sql
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
  UPDATE public.coach_offers
  SET quantity_remaining = quantity_remaining - p_quantity
  WHERE id = p_offer_id AND quantity_remaining IS NOT NULL;
$$;

COMMENT ON FUNCTION "public"."finalize_coach_offer_purchase_inventory" IS
  'Atomically decrements coach_offers.quantity_remaining at purchase finalization. Service-role-only caller (finalizePayment.ts) — not a client-facing RPC. Coach Marketplace V1 Phase 3.';

REVOKE EXECUTE ON FUNCTION "public"."finalize_coach_offer_purchase_inventory"(uuid, integer) FROM PUBLIC, anon, authenticated;
