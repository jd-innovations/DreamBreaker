-- A practice match is a play event with two players.
--
-- The "Practice Match" option on /players/[id]/invite used to send a formatted
-- chat message and nothing else: no invite record, no accept or decline, and
-- nothing in the recipient's Invitations. The date, time, venue and skill range
-- the sender filled in became text in a chat bubble.
--
-- Modelling it as a play_event rather than inventing a practice_matches table
-- means the whole existing rail comes free -- play_event_invites, the accept
-- and decline actions, the /invites cards, the participant records. Community
-- Play already works exactly this way; this makes Practice Match the same
-- thing with max_players = 2.
--
-- The client must keep these OUT of public discovery. Three queries list
-- play_events without scoping to an organizer, participant or group:
-- fetchOpenPlayEvents, fetchNearbyPlayEvents (lib/supabase/playEvents.ts) and
-- the facility event list (lib/supabase/facilities.ts). All three now exclude
-- 'practice'. Group event lists are scoped by group_id and a practice match
-- carries none, so they are unaffected.

alter type public.play_event_type add value if not exists 'practice';

comment on type public.play_event_type is
  'How a play event is run. `practice` is a private two-player match created from the Invite to Play flow -- it is deliberately excluded from public discovery queries and has no group.';
