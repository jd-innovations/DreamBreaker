-- Voucher validity moves from 180 days to one year.
--
-- Affects FUTURE purchases only. coach_offer_purchases snapshots
-- expiration_days at purchase and the voucher's expires_at is derived from
-- that snapshot, so a setting change can never retroactively shorten or extend
-- something already sold — which is the property that makes the snapshot worth
-- having.
--
-- coach_marketplace_min_voucher_validity_days stays at 180 as a floor; 365
-- clears it.
update public.platform_settings
   set value = '365'
 where key = 'coach_marketplace_voucher_expiration_days';
