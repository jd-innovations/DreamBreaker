-- The seeded 168h throttle on coach_voucher_expiring is wrong for what this
-- automation does, and a dry run showed exactly how: a buyer holding two
-- vouchers got the 30-day reminder for one, and the 3-day reminder for the
-- other — the urgent one, on money already spent — was suppressed for a week.
--
-- The per-band idempotency key ('coach-expiring/<entitlement>/<days>') already
-- guarantees each voucher is mentioned at most once per band, which is the
-- limit that actually matters here. Someone holding several vouchers expiring
-- in the same week SHOULD hear about each of them.
update public.notification_automations
   set throttle_hours = null
 where key = 'coach_voucher_expiring';
