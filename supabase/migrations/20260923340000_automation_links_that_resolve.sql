-- Repoint the automation links that opened nothing.
--
-- A tapped push routes ONLY through resolveDeepLink (see
-- apps/mobile/src/lib/pushNotifications.ts): anything it refuses is logged as
-- "no supported route" and the tap is swallowed. 17 of the 35 enabled
-- automations pointed somewhere it refused, so the notification arrived, the
-- person tapped, and the app opened wherever it already was.
--
-- The companion change adds SECTION roots to packages/shared/src/deep-link.ts
-- (/wallet, /stats, /membership, /profile, /matchmaking, /games), which covers
-- most of them. Three could not be fixed by the resolver because the link
-- itself named a screen that does not exist:
--
--   /(tabs)/stats   an expo-router INTERNAL path. "(tabs)" is a layout group
--                   and never appears in a URL. It could never have resolved.
--   /membership-settings  the screen's filename, not a route vocabulary word.
--                   The link is now /membership; the mobile HREF map points
--                   that at membership-settings.tsx.
--   /community      the community root addresses ONE event and needs an id.
--                   games_near_you means "several games near you", which is
--                   the games list — /games, the same place inactive_return
--                   already pointed.
--
-- new_match and liked_you both said /matchmaking, which is not a mobile route
-- at all (the tab is "finder"). They also want different screens: one is a
-- mutual match, the other is somebody's pending like.
--
-- Left alone deliberately: every link that already resolved — tournaments,
-- bookings, groups, the review invite, the support reply, the play-event
-- invite. 18 of them.
--
-- NOTE: this migration is only half the fix. Without the shared deep-link
-- change shipped in a NATIVE BUILD, /wallet, /stats, /membership, /profile
-- and /matchmaking still do not resolve on an installed app — the resolver
-- lives in the binary, not in the database. Publishing these link changes
-- alone would leave the taps just as dead.

update public.notification_automations
   set link_template = '/membership'
 where key in ('membership_renewing', 'membership_payment_failed', 'membership_expired');

update public.notification_automations
   set link_template = '/stats'
 where key in ('match_recorded', 'match_claimed');

update public.notification_automations
   set link_template = '/matchmaking/connections'
 where key = 'new_match';

update public.notification_automations
   set link_template = '/matchmaking/requests'
 where key = 'liked_you';

update public.notification_automations
   set link_template = '/games'
 where key = 'games_near_you';
