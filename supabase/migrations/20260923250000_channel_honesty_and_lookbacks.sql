-- Two corrections before any of this is switched on.
--
-- ── 1. The Email channel was decorative on three automations ────────────────
-- coach_voucher_expiring, membership_renewing and membership_payment_failed
-- all listed Email in their channels, but none of their senders sends one —
-- there is no email template for any of the three, and the senders only write
-- notifications. An admin toggling Email on those rows would have changed
-- nothing, which is exactly the class of bug this project keeps finding (the
-- dead notification toggles; the coach reminder-days setting nothing read). A
-- switch that lies is worse than a missing one, so the channel is removed.
--
-- Adding email back is real work, not a toggle: each needs a branded template
-- in email_templates and a send call in its sender. Worth doing for
-- membership_payment_failed in particular — money is at risk and a push can be
-- missed — but that is a separate change.
--
-- checkin_open KEEPS its email channel: its template already exists
-- (20260807000000) and the automation is unwired, so nothing can claim to
-- honour it yet. Whoever builds that sender must send the email.
--
-- ── 2. Lookback windows would fire a backlog on first enable ────────────────
--   rating_changed        14 days — three players have PAR events from
--                         2026-09-11 in range right now, so enabling it would
--                         send a catch-up burst about a fortnight-old matches.
--   review_invite (auto)  14 days — worse, because it EMAILS: every scanned
--                         check-in from the last two weeks would be invited at
--                         once, on the first run.
--
-- Both drop to 2 days: enough for an hourly job to survive some downtime,
-- short enough that enabling either tomorrow does not dredge up history. Both
-- stay admin-editable.

update public.notification_automations
   set channels = array_remove(channels, 'email')
 where key in ('coach_voucher_expiring', 'membership_renewing', 'membership_payment_failed');

update public.notification_automations
   set timing = jsonb_set(timing, '{lookback_days}', '2'::jsonb)
 where key in ('rating_changed', 'review_invite');
