-- Some events also send a transactional email from a DIFFERENT sender than the
-- one that writes the notification — wiring that predates this catalog:
--
--   registration_confirmed   the registrations insert trigger
--   tournament_cancelled     fn_notify_tournament_status
--   new_match                create_partner_match_on_mutual_like
--   support_ticket_reply     fn_notify_support_ticket_reply's email half
--   waitlist_spot_offered    the waitlist-sweeper edge function
--
-- Listing Email on those rows would imply the channel toggle controls them,
-- and it does not. Making it true would mean this screen could switch off
-- transactional mail for a paid registration or a cancelled event — a bigger
-- product decision than a checkbox, and not one to smuggle in here.
--
-- So the channel stays push + in-app and the description says where the email
-- comes from. The rule this preserves: a channel listed here is a channel this
-- screen controls; anything else is written down rather than implied.
--
-- (hold_expired and review_invite are different — their email is sent by the
-- same function that writes the notification, so their Email channel is real
-- and honoured. See 20260923250100.)

update public.notification_automations
   set description = coalesce(description, '') ||
       ' NOTE: a transactional email is also sent for this event by its own sender, which this screen does not control.'
 where key in ('registration_confirmed', 'tournament_cancelled', 'new_match',
               'support_ticket_reply', 'waitlist_spot_offered')
   and coalesce(description, '') not like '%does not control%';
