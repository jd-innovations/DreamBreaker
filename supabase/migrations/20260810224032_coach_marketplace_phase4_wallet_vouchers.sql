-- Coach Marketplace V1 — Phase 4: Wallet Vouchers.
--
-- Per COACH_MARKETPLACE_V1_SPEC.md §12-16, §24-26. Converts a finalized
-- coach_offer_purchases row into a Wallet item (existing generic
-- infrastructure, Phase 1 wallet_phase1.sql — extended, not duplicated) plus
-- one or more redemption entitlements (new, coach-specific — the old
-- wallet_redemptions stub is not the authoritative Coach redemption engine
-- per explicit instruction).
--
-- Does NOT build QR/manual-code redemption (Phase 5), settlement/payout
-- (Phase 6), or refund/revocation workflows (Phase 7) — the entitlement
-- schema below reserves the fields those phases need (status, revoked_at,
-- revoked_reason) without implementing the logic that sets them.

-- ── wallet_items: add the coach_voucher type ────────────────────────────────

ALTER TABLE "public"."wallet_items" DROP CONSTRAINT "check_wallet_item_type";
ALTER TABLE "public"."wallet_items" ADD CONSTRAINT "check_wallet_item_type" CHECK (
  "type" = ANY (ARRAY['credit'::text, 'membership'::text, 'offer'::text, 'pass'::text, 'ticket'::text, 'reward'::text, 'coach_voucher'::text])
);

-- No new wallet_items RLS/columns needed: the existing "user select own"
-- policy and the idx_wallet_items_idempotent_source unique index
-- (user_id, source_type, source_id, type) already cover coach vouchers —
-- source_type='coach_offer_purchase', source_id=<purchase id>. That index
-- is what create_coach_voucher_from_finalized_purchase() below relies on
-- for "one Wallet item per purchase" idempotency, with zero new schema.

-- ── coach_voucher_entitlements ──────────────────────────────────────────────
--
-- The authoritative Coach redemption-entitlement model. Deliberately a new,
-- coach-specific table rather than forcing this into wallet_redemptions
-- (which is a generic "redemption attempt log" stub with no concept of
-- "N remaining of M" or per-participant credentials).
--
-- Participant vs package (spec §16):
--   - Standard/multi-participant offer -> one row per participant
--     (entitlement_type='participant', participant_index 1..N), each with
--     total_redemptions=1. Redeeming one never touches the others.
--   - Package offer -> exactly one row (entitlement_type='package') with
--     total_redemptions = offer.lessons_included, decrementing.
--
-- QR/manual-code redemption credentials are Phase 5's — deliberately not
-- reserved here beyond what the status/remaining fields already need.

CREATE TABLE "public"."coach_voucher_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  "purchase_id" uuid NOT NULL REFERENCES "public"."coach_offer_purchases"("id"),
  "wallet_item_id" uuid NOT NULL REFERENCES "public"."wallet_items"("id"),
  "buyer_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "coach_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
  "offer_id" uuid NOT NULL REFERENCES "public"."coach_offers"("id"),

  "entitlement_type" text NOT NULL CHECK ("entitlement_type" IN ('participant', 'package')),
  -- 1-based index within the purchase for 'participant' rows; always NULL
  -- for 'package' rows (a package is one decrementing entitlement, not N).
  "participant_index" integer CHECK ("participant_index" IS NULL OR "participant_index" > 0),

  "total_redemptions" integer NOT NULL CHECK ("total_redemptions" > 0),
  "remaining_redemptions" integer NOT NULL CHECK ("remaining_redemptions" >= 0 AND "remaining_redemptions" <= "total_redemptions"),

  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'exhausted', 'expired', 'revoked')),
  -- Derived from the Phase 3 purchase snapshot's expiration_policy/days at
  -- creation time (paid_at + expiration_days) — never re-read from the
  -- current platform_settings value. SECURITY NOTE: Phase 5 redemption must
  -- independently compare now() against this column at validation time —
  -- the `status` column above is not re-synced by a cron and must never be
  -- the sole authority for whether a redemption is allowed.
  "expires_at" timestamptz NOT NULL,

  "exhausted_at" timestamptz,
  "revoked_at" timestamptz,
  "revoked_reason" text,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Idempotency (spec's explicit examples): one package entitlement per
-- purchase; one participant entitlement per (purchase, participant index).
CREATE UNIQUE INDEX "idx_coach_voucher_entitlements_package" ON "public"."coach_voucher_entitlements" ("purchase_id") WHERE "entitlement_type" = 'package';
CREATE UNIQUE INDEX "idx_coach_voucher_entitlements_participant" ON "public"."coach_voucher_entitlements" ("purchase_id", "participant_index") WHERE "entitlement_type" = 'participant';

CREATE INDEX "idx_coach_voucher_entitlements_buyer" ON "public"."coach_voucher_entitlements" ("buyer_id");
CREATE INDEX "idx_coach_voucher_entitlements_coach" ON "public"."coach_voucher_entitlements" ("coach_id");
CREATE INDEX "idx_coach_voucher_entitlements_wallet_item" ON "public"."coach_voucher_entitlements" ("wallet_item_id");
CREATE INDEX "idx_coach_voucher_entitlements_offer" ON "public"."coach_voucher_entitlements" ("offer_id");

COMMENT ON TABLE "public"."coach_voucher_entitlements" IS
  'Coach Marketplace V1 Phase 4. Authoritative redemption-entitlement record consumed by Phase 5 QR/manual redemption. Not wallet_redemptions (that table is a generic attempt-log stub, insufficient for N-of-M / per-participant entitlement tracking).';

CREATE OR REPLACE TRIGGER "trg_coach_voucher_entitlements_updated_at"
  BEFORE UPDATE ON "public"."coach_voucher_entitlements"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

-- Identity/terms are immutable for the life of the row, even for
-- service_role (mirrors Phase 3's integrity trigger). remaining_redemptions,
-- status, exhausted_at, revoked_at, revoked_reason, updated_at are the only
-- mutable columns — Phase 5 (redemption) and Phase 7 (revocation) write
-- through those, never through this table's identity/terms.
CREATE OR REPLACE FUNCTION "public"."fn_protect_coach_voucher_entitlement_integrity"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
BEGIN
  IF NEW.purchase_id IS DISTINCT FROM OLD.purchase_id
     OR NEW.wallet_item_id IS DISTINCT FROM OLD.wallet_item_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.offer_id IS DISTINCT FROM OLD.offer_id
     OR NEW.entitlement_type IS DISTINCT FROM OLD.entitlement_type
     OR NEW.participant_index IS DISTINCT FROM OLD.participant_index
     OR NEW.total_redemptions IS DISTINCT FROM OLD.total_redemptions
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'coach_voucher_entitlements identity/terms are immutable after creation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."fn_protect_coach_voucher_entitlement_integrity" IS
  'Locks entitlement identity/terms for the life of the row, including against service_role. Coach Marketplace V1 Phase 4.';

CREATE TRIGGER "trg_protect_coach_voucher_entitlement_integrity"
  BEFORE UPDATE ON "public"."coach_voucher_entitlements"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_protect_coach_voucher_entitlement_integrity"();

REVOKE EXECUTE ON FUNCTION "public"."fn_protect_coach_voucher_entitlement_integrity"() FROM PUBLIC, anon, authenticated;

ALTER TABLE "public"."coach_voucher_entitlements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_voucher_entitlements: buyer read own" ON "public"."coach_voucher_entitlements"
  FOR SELECT USING ("buyer_id" = (SELECT auth.uid()));

-- Coach needs entitlement state (remaining/status/expiry) to validate a
-- redemption in Phase 5 — but no buyer/payment financial data lives on this
-- table at all, so this exposes nothing sensitive.
CREATE POLICY "coach_voucher_entitlements: coach read own" ON "public"."coach_voucher_entitlements"
  FOR SELECT USING ("coach_id" = (SELECT auth.uid()));

CREATE POLICY "coach_voucher_entitlements: admin full access" ON "public"."coach_voucher_entitlements"
  USING ("public"."is_admin"());

-- Deliberately no INSERT/UPDATE/DELETE policy for "authenticated" — rows
-- are created only via create_coach_voucher_from_finalized_purchase()
-- (SECURITY DEFINER) and will be mutated only by Phase 5 (redemption) and
-- Phase 7 (revocation) service-role code, never directly by a client.

-- ── create_coach_voucher_from_finalized_purchase(): idempotent voucher issuance ──
--
-- Called from finalizeCoachOfferPurchase() in finalizePayment.ts, right
-- after the Phase 3 ledger event is appended. Consumes the already-finalized
-- purchase; never recomputes price/commission/discount. Safe to call more
-- than once for the same purchase — the wallet_items idempotent-source
-- unique index and the two entitlement partial unique indexes above make
-- every insert an idempotent get-or-create.

CREATE OR REPLACE FUNCTION "public"."create_coach_voucher_from_finalized_purchase"("p_purchase_id" uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_purchase public.coach_offer_purchases%ROWTYPE;
  v_coach_name text;
  v_facility_name text;
  v_wallet_item_id uuid;
  v_expires_at timestamptz;
  v_metadata jsonb;
  v_anchor timestamptz;
  i integer;
BEGIN
  SELECT * INTO v_purchase FROM public.coach_offer_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_not_found';
  END IF;

  -- Only a finalized purchase is an owned entitlement (spec: never from
  -- payment_pending/failed/cancelled/refunded). Silent no-op, not an error —
  -- this keeps the function safe to call speculatively without the caller
  -- needing to pre-check status itself.
  IF v_purchase.status != 'finalized' THEN
    RETURN;
  END IF;

  SELECT full_name INTO v_coach_name FROM public.profiles WHERE id = v_purchase.coach_id;
  IF v_purchase.facility_id IS NOT NULL THEN
    SELECT name INTO v_facility_name FROM public.facilities WHERE id = v_purchase.facility_id;
  END IF;

  v_anchor := COALESCE(v_purchase.paid_at, v_purchase.created_at);
  v_expires_at := v_anchor + make_interval(days => v_purchase.expiration_days);

  v_metadata := jsonb_build_object(
    'purchaseId', v_purchase.id,
    'coachId', v_purchase.coach_id,
    'offerId', v_purchase.offer_id,
    'offerType', v_purchase.offer_type,
    'facilityId', v_purchase.facility_id,
    'facilityName', v_facility_name,
    'regularPriceCents', v_purchase.regular_price_cents,
    'sellingPriceCents', v_purchase.selling_price_cents,
    'discountPct', v_purchase.discount_pct,
    'participantQuantity', v_purchase.participant_quantity,
    'lessonsIncluded', v_purchase.lessons_included,
    'buyerTotalChargedCents', v_purchase.buyer_total_charged_cents,
    'purchasedAt', v_anchor
  );

  INSERT INTO public.wallet_items (
    user_id, type, status, title, subtitle, description,
    value_amount, currency_code, original_value_amount, remaining_value_amount,
    expires_at, action_type, action_label,
    source_type, source_id, metadata
  ) VALUES (
    v_purchase.buyer_id, 'coach_voucher', 'active',
    v_purchase.offer_title,
    CASE WHEN v_facility_name IS NOT NULL THEN COALESCE(v_coach_name, 'Coach') || ' · ' || v_facility_name ELSE COALESCE(v_coach_name, 'Coach') END,
    NULL,
    (v_purchase.buyer_total_charged_cents::numeric / 100),
    upper(v_purchase.currency),
    (v_purchase.regular_price_cents::numeric * v_purchase.participant_quantity / 100),
    NULL,
    v_expires_at, 'view_details', 'View Voucher',
    'coach_offer_purchase', v_purchase.id::text, v_metadata
  )
  ON CONFLICT (user_id, source_type, source_id, type) WHERE source_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_wallet_item_id;

  IF v_wallet_item_id IS NULL THEN
    SELECT id INTO v_wallet_item_id FROM public.wallet_items
    WHERE user_id = v_purchase.buyer_id AND source_type = 'coach_offer_purchase'
      AND source_id = v_purchase.id::text AND type = 'coach_voucher';
  END IF;

  IF v_purchase.offer_type = 'package' THEN
    INSERT INTO public.coach_voucher_entitlements (
      purchase_id, wallet_item_id, buyer_id, coach_id, offer_id,
      entitlement_type, participant_index, total_redemptions, remaining_redemptions,
      status, expires_at
    ) VALUES (
      v_purchase.id, v_wallet_item_id, v_purchase.buyer_id, v_purchase.coach_id, v_purchase.offer_id,
      'package', NULL, COALESCE(v_purchase.lessons_included, 1), COALESCE(v_purchase.lessons_included, 1),
      'active', v_expires_at
    )
    ON CONFLICT (purchase_id) WHERE entitlement_type = 'package' DO NOTHING;
  ELSE
    FOR i IN 1..v_purchase.participant_quantity LOOP
      INSERT INTO public.coach_voucher_entitlements (
        purchase_id, wallet_item_id, buyer_id, coach_id, offer_id,
        entitlement_type, participant_index, total_redemptions, remaining_redemptions,
        status, expires_at
      ) VALUES (
        v_purchase.id, v_wallet_item_id, v_purchase.buyer_id, v_purchase.coach_id, v_purchase.offer_id,
        'participant', i, 1, 1,
        'active', v_expires_at
      )
      ON CONFLICT (purchase_id, participant_index) WHERE entitlement_type = 'participant' DO NOTHING;
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION "public"."create_coach_voucher_from_finalized_purchase" IS
  'Idempotent: converts a finalized coach_offer_purchases row into one wallet_items row + its participant/package entitlement rows. Service-role-only caller (finalizePayment.ts) — not a client-facing RPC. Coach Marketplace V1 Phase 4.';

REVOKE EXECUTE ON FUNCTION "public"."create_coach_voucher_from_finalized_purchase"(uuid) FROM PUBLIC, anon, authenticated;
