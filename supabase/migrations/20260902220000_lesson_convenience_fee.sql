-- Switch on the lesson convenience fee.
--
-- No function changes. The machinery shipped with the Coach Marketplace and was
-- left switched off: coach_offer_purchases.buyer_service_fee_cents, the
-- buyer_total = gross + fee + tax CHECK, refund handling, and these two
-- settings with three modes (disabled | fixed | percentage). Turning it on is
-- configuration, which is what that design was for.
--
-- $2 per PURCHASE, not per participant -- deliberately unlike the court
-- convenience fee, which is per slot. A lesson is one transaction whatever the
-- headcount, and the fee exists to offset per-transaction processing cost.
-- create_coach_offer_purchase's 'fixed' branch already computes it that way:
--
--   WHEN 'fixed' THEN ROUND(v_fee_amount)::integer
--
-- with no v_qty multiplier, while 'percentage' scales through v_gross_cents.
--
-- Both values stay admin-adjustable, and the mode can move to percentage later
-- with no code change. Worth remembering if the fee is ever meant to track
-- processing cost rather than merely offset it: Stripe is 2.9% + 30c, so a flat
-- $2 more than covers a $45 clinic and falls about $4 short on a $195 package.
--
-- Applies to purchases made from now on. The fee is snapshotted onto each
-- purchase row at creation and never re-derived from current settings, so
-- existing vouchers keep the zero fee they were bought under.

update public.platform_settings
   set "value" = 'fixed'
 where "key" = 'coach_marketplace_buyer_service_fee_mode';

update public.platform_settings
   set "value" = '200'
 where "key" = 'coach_marketplace_buyer_service_fee_amount';
