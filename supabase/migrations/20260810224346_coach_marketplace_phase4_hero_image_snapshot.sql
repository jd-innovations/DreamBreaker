-- Fix: capture the offer's primary image URL into the voucher metadata
-- snapshot at creation time, for the Wallet hero image (spec "DEFAULT HERO
-- IMAGE SUPPORT" + "custom hero image displays" mobile requirement).
-- Presentation-only: if the image is later deleted/changed, the historical
-- URL simply 404s and the client falls back to the existing deterministic
-- placeholder pattern already used on the Lesson Marketplace detail screen
-- (Ionicons icon, not a second image pipeline) — never a business-logic
-- dependency.

CREATE OR REPLACE FUNCTION "public"."create_coach_voucher_from_finalized_purchase"("p_purchase_id" uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_purchase public.coach_offer_purchases%ROWTYPE;
  v_coach_name text;
  v_facility_name text;
  v_hero_image_url text;
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

  IF v_purchase.status != 'finalized' THEN
    RETURN;
  END IF;

  SELECT full_name INTO v_coach_name FROM public.profiles WHERE id = v_purchase.coach_id;
  IF v_purchase.facility_id IS NOT NULL THEN
    SELECT name INTO v_facility_name FROM public.facilities WHERE id = v_purchase.facility_id;
  END IF;
  SELECT url INTO v_hero_image_url FROM public.coach_offer_images
    WHERE coach_offer_id = v_purchase.offer_id ORDER BY sort_order ASC LIMIT 1;

  v_anchor := COALESCE(v_purchase.paid_at, v_purchase.created_at);
  v_expires_at := v_anchor + make_interval(days => v_purchase.expiration_days);

  v_metadata := jsonb_build_object(
    'purchaseId', v_purchase.id,
    'coachId', v_purchase.coach_id,
    'offerId', v_purchase.offer_id,
    'offerType', v_purchase.offer_type,
    'facilityId', v_purchase.facility_id,
    'facilityName', v_facility_name,
    'heroImageUrl', v_hero_image_url,
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

REVOKE EXECUTE ON FUNCTION "public"."create_coach_voucher_from_finalized_purchase"(uuid) FROM PUBLIC, anon, authenticated;
