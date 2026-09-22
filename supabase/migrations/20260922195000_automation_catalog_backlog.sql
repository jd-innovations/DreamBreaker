-- Phase B: seed the rest of the catalog.
--
-- These are events the app ALREADY has — reservations, memberships, coaching,
-- wallet, groups, games, ratings, discovery, win-back — that notify nobody, or
-- notify only inside the app. Seeding them makes the backlog visible in
-- /admin/notifications instead of living in a document, and turning one on
-- later is a copy edit plus (usually) a small sender, not a project.
--
-- Every row lands `wired = false`: a database constraint stops an unwired row
-- being enabled, so nothing here can send by accident. The copy is a starting
-- draft for the owner to edit.
--
-- Two deliberate omissions:
--
--   marketplace_price_drop  already has its own push path
--                           (fn_notify_price_drop -> send-message-push
--                           kind:"price_drop"). A catalog row with that key
--                           would push it TWICE once enabled. Folding it into
--                           the catalog means retiring that path first.
--   message                 DMs never write a notifications row, so the
--                           dispatcher cannot see them. Same reasoning.
--
-- Where a row's description says "already writes in-app", the event writes a
-- notifications row today with this exact key, but its wording is built by its
-- own trigger. Pointing those senders at private.render_automation is what
-- makes them `wired` — the follow-up after this migration.

insert into public.notification_automations
  (key, name, description, category, pref_column, channels, title_template, body_template, link_template, timing, throttle_hours, sort_order)
values
  -- ── Court reservations ────────────────────────────────────────────────────
  ('reservation_confirmed', 'Court booked',
   'Confirms a court reservation.', 'critical', null, array['push','in_app'],
   'Court booked ✅', '{{facility_name}} on {{event_date}} at {{start_time}}. See you there.',
   '/booking/{{reservation_id}}', '{}'::jsonb, null, 100),

  ('reservation_reminder', 'Court reminder',
   'Reminds a player before a booked court session.', 'critical', null, array['push','in_app'],
   'Court time tomorrow', '{{facility_name}} at {{start_time}}. Tap for directions and details.',
   '/booking/{{reservation_id}}', '{"days_before": 1, "send_local_hour": 17}'::jsonb, 24, 101),

  ('reservation_invite', 'Invited to a booking',
   'Someone added this player to a court reservation.', 'social', null, array['push','in_app'],
   '{{inviter_name}} invited you 🏓', '{{facility_name}}, {{event_date}} at {{start_time}}. Tap to join.',
   '/booking/{{reservation_id}}', '{}'::jsonb, null, 102),

  ('reservation_cancelled', 'Booking cancelled',
   'A court reservation this player was part of was cancelled.', 'critical', null, array['push','in_app'],
   'Booking cancelled', 'Your court at {{facility_name}} on {{event_date}} was cancelled. Any payment is refunded.',
   '/booking', '{}'::jsonb, null, 103),

  -- ── Membership ────────────────────────────────────────────────────────────
  ('membership_renewing', 'Membership renewing',
   'Warns before a membership renews. Real money, and nothing notifies today.', 'critical', null, array['push','in_app','email'],
   'Your membership renews soon', 'It renews on {{renewal_date}} for {{amount}}. Manage it any time.',
   '/membership', '{"days_before": 7, "send_local_hour": 10}'::jsonb, 168, 110),

  ('membership_payment_failed', 'Membership payment failed',
   'A renewal payment did not go through and the membership is at risk.', 'critical', null, array['push','in_app','email'],
   'Payment problem', 'We could not renew your membership. Update your card to keep your benefits.',
   '/membership', '{}'::jsonb, 24, 111),

  ('membership_expired', 'Membership ended',
   'A membership lapsed.', 'critical', null, array['push','in_app'],
   'Your membership has ended', 'Renew any time to get your benefits back.',
   '/membership', '{}'::jsonb, null, 112),

  -- ── Coaching ──────────────────────────────────────────────────────────────
  ('coach_voucher_purchased', 'Coaching purchased',
   'Confirms a coaching voucher purchase.', 'critical', null, array['push','in_app'],
   'Booked with {{coach_name}} 🎾', 'Your voucher is in your wallet. Tap to schedule your session.',
   '/wallet', '{}'::jsonb, null, 120),

  ('coach_voucher_expiring', 'Coaching voucher expiring',
   'A purchased voucher is about to expire unused.', 'critical', null, array['push','in_app','email'],
   'Use it before it goes', 'Your session with {{coach_name}} expires on {{expiry_date}}.',
   '/wallet', '{"days_before": 14, "send_local_hour": 10}'::jsonb, 168, 121),

  ('coach_session_booked', 'Coaching session booked',
   'A coaching session was scheduled.', 'critical', null, array['push','in_app'],
   'Session confirmed', '{{coach_name}} on {{event_date}} at {{start_time}}.',
   '/wallet', '{}'::jsonb, null, 122),

  ('refund_processed', 'Refund processed',
   'A refund reached the player. Emails today; this adds push.', 'critical', null, array['push','in_app'],
   'Refund on its way', '{{amount}} for {{item_name}} is heading back to your card.',
   '/wallet', '{}'::jsonb, null, 123),

  -- ── Wallet ────────────────────────────────────────────────────────────────
  ('wallet_item_available', 'Benefit ready',
   'A wallet benefit finished processing. Already writes in-app.', 'social', null, array['push','in_app'],
   '{{item_name}} is ready', 'Tap to view your benefit.',
   '/wallet/{{item_id}}', '{}'::jsonb, null, 130),

  ('wallet_item_added', 'Benefit added',
   'Something new landed in the wallet. Already writes in-app.', 'social', null, array['push','in_app'],
   'Added to your wallet', '{{item_name}} is yours. Tap to see it.',
   '/wallet/{{item_id}}', '{}'::jsonb, null, 131),

  ('wallet_item_expiring', 'Benefit expiring',
   'A wallet benefit is about to expire unused.', 'social', null, array['push','in_app'],
   'Expiring soon', '{{item_name}} expires on {{expiry_date}}. Use it before it goes.',
   '/wallet/{{item_id}}', '{"days_before": 7, "send_local_hour": 10}'::jsonb, 168, 132),

  ('flash_deal', 'Flash deal',
   'A time-limited offer. Marketing: obeys quiet hours and the caps.', 'marketing', 'notif_marketplace', array['push','in_app'],
   '{{deal_title}} ⚡', '{{deal_summary}} Ends {{ends_at}}.',
   '/wallet', '{}'::jsonb, 24, 133),

  -- ── Groups ────────────────────────────────────────────────────────────────
  ('group_invite', 'Group invitation',
   'Invited to a group. Already writes in-app.', 'social', null, array['push','in_app'],
   '{{inviter_name}} invited you to {{group_name}}', 'Tap to see the group and join.',
   '/groups/{{group_id}}', '{}'::jsonb, null, 140),

  ('group_post_new', 'New group post',
   'Someone posted in a group this player belongs to. Needs a throttle: a busy group could otherwise notify all day.',
   'social', null, array['push','in_app'],
   'New in {{group_name}}', '{{author_name}}: {{post_preview}}',
   '/groups/{{group_id}}', '{}'::jsonb, 6, 141),

  ('group_post_reply', 'Reply to your post',
   'Someone commented on this player''s group post.', 'social', null, array['push','in_app'],
   '{{author_name}} replied', '{{post_preview}}',
   '/groups/{{group_id}}', '{}'::jsonb, null, 142),

  -- ── Games and matches ─────────────────────────────────────────────────────
  ('play_event_invite', 'Game invitation',
   'Invited to a game. Already writes in-app.', 'social', null, array['push','in_app'],
   '{{inviter_name}} invited you to play', '{{event_date}} at {{venue_name}}. Tap to accept.',
   '/games/{{event_id}}', '{}'::jsonb, null, 150),

  ('play_event_starting_soon', 'Game starting soon',
   'A game this player joined or saved starts shortly.', 'critical', null, array['push','in_app'],
   'Game in {{hours_left}} hours', '{{venue_name}} at {{start_time}}. Don''t be late.',
   '/games/{{event_id}}', '{"offsets_hours": [3]}'::jsonb, 6, 151),

  ('match_recorded', 'Match recorded',
   'A result was recorded for this player. Already writes in-app.', 'social', null, array['push','in_app'],
   'Match recorded', '{{opponent_name}} · {{score}}. Tap to see your stats.',
   '/stats', '{}'::jsonb, null, 152),

  ('match_claimed', 'Match claimed',
   'Someone claimed a spot in this player''s recorded match. Already writes in-app.', 'social', null, array['push','in_app'],
   '{{player_name}} claimed a match', 'Tap to review it.',
   '/stats', '{}'::jsonb, null, 153),

  ('new_match', 'New partner match',
   'Two players liked each other in Matchmaking. Emails today.', 'social', 'notif_new_match', array['push','in_app'],
   'It''s a match! 🏓', 'You and {{player_name}} both want to play. Say hello.',
   '/matchmaking', '{}'::jsonb, null, 154),

  ('liked_you', 'Someone liked you',
   'Another player liked this one in Matchmaking.', 'social', 'notif_liked_you', array['push','in_app'],
   'Someone wants to play', 'A player near you liked your profile. Tap to see who.',
   '/matchmaking', '{}'::jsonb, 24, 155),

  -- ── Discovery (all obey quiet hours and the caps) ─────────────────────────
  ('tournament_near_you', 'New tournament near you',
   'A tournament was published within the discovery radius of this player''s home court or city. Never uses precise location.',
   'discovery', 'notif_tournaments', array['push','in_app'],
   'New near you: {{tournament_name}}', '{{distance}} away · {{event_date}} · {{spots_left}} spots left.',
   '/tournament/{{tournament_id}}', '{"radius_miles": 25}'::jsonb, 24, 160),

  ('tournament_closing_soon', 'Registration closing',
   'Registration is about to close for a tournament this player bookmarked but never entered. tournament_bookmarks already exists.',
   'discovery', 'notif_tournaments', array['push','in_app'],
   'Last call: {{tournament_name}}', 'Registration closes {{closes_at}}. {{spots_left}} spots left.',
   '/tournament/{{tournament_id}}', '{"days_before": 2, "send_local_hour": 18}'::jsonb, 48, 161),

  ('games_near_you', 'Games near you',
   'Open community games near this player this weekend.', 'discovery', null, array['push','in_app'],
   'Plans = handled 🏓', '{{count}} open games near you this weekend. Tap to grab a spot.',
   '/games', '{"radius_miles": 25}'::jsonb, 168, 162),

  -- ── Reviews and ratings ───────────────────────────────────────────────────
  ('review_invite', 'Review invitation',
   'Invites a review after an event. Emails today; this adds push.', 'social', null, array['push','in_app'],
   'How was {{subject_label}}?', 'Ten seconds of your time helps the next player know what to expect.',
   '/reviews', '{}'::jsonb, 168, 170),

  ('rating_changed', 'Your rating changed',
   'This player''s PAR moved after a recorded match.', 'social', null, array['push','in_app'],
   'Your PAR is now {{rating}}', '{{direction}} {{change}} after {{tournament_name}}.',
   '/stats', '{}'::jsonb, 24, 171),

  -- ── Support ───────────────────────────────────────────────────────────────
  ('support_ticket_reply', 'Support replied',
   'A reply landed on this player''s support ticket. Emails today.', 'critical', null, array['push','in_app'],
   'We replied to your question', '{{message_preview}}',
   '/support', '{}'::jsonb, null, 180),

  -- ── Win-back (marketing: quiet hours and caps apply) ──────────────────────
  ('inactive_return', 'Come back',
   'A player who has not opened the app in a while. The cap is what stops this becoming nagging.',
   'marketing', 'notif_announcements', array['push'],
   'The courts miss you 🏓', '{{count}} games near you this week. Find one in a couple of taps.',
   '/games', '{"inactive_days": 14}'::jsonb, 336, 190),

  ('profile_incomplete', 'Finish your profile',
   'A player whose profile is missing the fields that make matchmaking work.', 'marketing', 'notif_announcements', array['push'],
   'Get better matches', 'Add your skill level and home court so the right players find you.',
   '/profile', '{}'::jsonb, 720, 191)
on conflict (key) do nothing;
