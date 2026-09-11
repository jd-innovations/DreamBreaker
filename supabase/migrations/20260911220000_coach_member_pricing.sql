-- Coach offers charge the member price to paid members.
--
-- Item 3.2 of MEMBERSHIP_EXECUTION_PLAN.md. coach_offers has carried
-- premium_price_cents and premium_only since the coach marketplace's Phase 2,
-- with a constraint that the member price undercuts the public one, and
-- createCoachOffer() has always accepted both. The only missing piece was the
-- consumer: this function computed price from discounted_price_cents and never
-- read the premium one, because no entitlement existed to read.
--
-- The body below is the live definition with four changes, applied
-- programmatically to the dumped source rather than retyped -- this is the
-- function that decides what a person is charged, and a transcription slip here
-- is a billing error. The four: the two new declarations, the premium_only
-- guard, the price selection, and the two audit booleans that were hardcoded
-- false. Everything else is byte-for-byte what was running.
--
-- Refunds are deliberately untouched: claim_coach_refund refunds
-- buyer_total_charged_cents and never reads coach_offers, so a buyer gets back
-- exactly what they paid even if their membership lapsed in between.

CREATE OR REPLACE FUNCTION "public"."create_coach_offer_purchase"("p_offer_id" "uuid", "p_participant_quantity" integer DEFAULT 1) RETURNS "public"."coach_offer_purchases"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
  -- Membership pricing (item 3.2). v_is_member is the buyer's entitlement at
  -- THIS moment; v_premium_applied records whether it actually changed the
  -- price, which is a different fact -- a member buying an offer with no
  -- member price is eligible and still paid the public price.
  v_is_member boolean := false;
  v_premium_applied boolean := false;
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

  v_is_member := public.is_paid_member(v_buyer_id);

  -- Was a blanket refusal -- an honest placeholder while no membership
  -- existed. Now it refuses only a buyer who is not entitled, and says so:
  -- 'nobody can buy this' and 'you cannot buy this' are different messages.
  IF v_offer.premium_only AND NOT v_is_member THEN
    RAISE EXCEPTION 'premium_membership_required';
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

  -- The only line that changes what anyone is charged. Everything below
  -- derives from it: gross, commission as a percentage of gross, the buyer
  -- service fee, and coach_net_proceeds_cents as gross minus commission. So
  -- the coach absorbs the member discount and the platform's commission stays
  -- proportional -- the split decided on 2026-09-11.
  --
  -- Only when the offer defines a member price. A null there means every
  -- buyer pays the same, which is the correct reading of it.
  IF v_is_member AND v_offer.premium_price_cents IS NOT NULL THEN
    v_selling_price_cents := v_offer.premium_price_cents;
    v_premium_applied := true;
  ELSE
    v_selling_price_cents := v_offer.discounted_price_cents;
  END IF;
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
    v_premium_applied, v_is_member, 'usd',
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
