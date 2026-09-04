-- Fix: Phase 3 initially omitted the expiration snapshot required by spec
-- §24 ("EXPIRATION SNAPSHOT") — caught on review before any purchase rows
-- existed (table was empty), so this is a clean add, not a backfill.
--
-- Phase 3 does not create a Wallet voucher yet, but must record enough
-- information for Phase 4 to deterministically compute one, and must lock
-- in the expiration policy that applied at purchase time so a later admin
-- change to coach_marketplace_voucher_expiration_days can never shrink a
-- buyer's already-purchased rights.

ALTER TABLE "public"."coach_offer_purchases"
  ADD COLUMN "expiration_policy" text NOT NULL DEFAULT 'days_after_purchase' CHECK ("expiration_policy" IN ('days_after_purchase')),
  ADD COLUMN "expiration_days" integer NOT NULL CHECK ("expiration_days" > 0);

ALTER TABLE "public"."coach_offer_purchases" ALTER COLUMN "expiration_policy" DROP DEFAULT;

COMMENT ON COLUMN "public"."coach_offer_purchases"."expiration_days" IS
  'Snapshot of platform_settings.coach_marketplace_voucher_expiration_days at purchase time (spec §24). Phase 4 computes voucher expiry as purchased_at + expiration_days deterministically from this row, never from the current (possibly since-changed) platform setting.';

-- Extend the immutability guard to cover the two new columns.
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
     OR NEW.expiration_policy IS DISTINCT FROM OLD.expiration_policy
     OR NEW.expiration_days IS DISTINCT FROM OLD.expiration_days
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

-- Extend create_coach_offer_purchase() to resolve and snapshot expiration.
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
  v_expiration_days integer;
  v_hold_expires timestamptz := now() + interval '15 minutes';
  v_row public.coach_offer_purchases;
BEGIN
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

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

  IF v_offer.premium_only THEN
    RAISE EXCEPTION 'premium_membership_not_available';
  END IF;

  IF v_offer.max_participants IS NOT NULL AND v_qty > v_offer.max_participants THEN
    RAISE EXCEPTION 'participant_quantity_exceeds_offer_max';
  END IF;

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

  v_selling_price_cents := v_offer.discounted_price_cents;
  v_gross_cents := v_selling_price_cents * v_qty;

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

  v_buyer_total_cents := v_gross_cents + v_service_fee_cents;

  SELECT "value"::integer INTO v_expiration_days
  FROM public.platform_settings WHERE "key" = 'coach_marketplace_voucher_expiration_days';
  v_expiration_days := COALESCE(v_expiration_days, 180);

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
    expiration_policy, expiration_days,
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
    'days_after_purchase', v_expiration_days,
    'payment_pending', v_hold_expires
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."create_coach_offer_purchase"(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."create_coach_offer_purchase"(uuid, integer) TO authenticated;
