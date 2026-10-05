-- Hide test data before public TestFlight (owner decisions, 2026-10-05).
--
-- Everything in production was loaded by the owner for testing. Testers should
-- not be matched with, or browse, fake people and fake events. Kept visible:
--   people        the owner, Tyler Cruz, Mia Carter (demo accounts)
--   tournaments   RATE LAS VEGAS OPEN - DEMO (finished; shows brackets/results)
--                 Futures Classic (free and open; the reviewer's path)
--   the owner's own lessons, listings, play events and groups; both groups
-- Hidden:
--   test profiles     is_discoverable -> false (directory, partner finder, search)
--   other tournaments -> 'draft' (out of public lists). No notification fires:
--                     fn_notify_tournament_status emails on draft only when
--                     returning from pending_approval.
--   test accounts' open play events -> 'cancelled' (no trigger notifies)
--   test accounts' active listings  -> 'expired'   (no trigger notifies)
-- Test-coach lessons need nothing: production builds already hide them, and
-- purchases from test coaches are refused (20261005120000).
--
-- REVERSIBLE: every changed value is recorded in private.prelaunch_hidden first.
-- To undo, run the block at the bottom of this file (commented out).

create table if not exists private.prelaunch_hidden (
  entity     text not null,
  row_id     uuid not null,
  old_value  text,
  hidden_at  timestamptz not null default now(),
  primary key (entity, row_id)
);

create temporary table keep_people as
  select id from public.profiles
   where id = '8eb9b4cf-e059-4666-8c8f-1717cd0c0014'
      or lower(email) in ('dhjesus122+tyler@gmail.com', 'dhjesus122+mia@gmail.com');

-- Profiles
insert into private.prelaunch_hidden (entity, row_id, old_value)
select 'profile', id, is_discoverable::text from public.profiles
 where deleted_at is null and is_discoverable and id not in (select id from keep_people)
on conflict do nothing;
update public.profiles set is_discoverable = false
 where deleted_at is null and is_discoverable and id not in (select id from keep_people);

-- Tournaments
insert into private.prelaunch_hidden (entity, row_id, old_value)
select 'tournament', id, status::text from public.tournaments
 where status not in ('draft', 'cancelled')
   and name not in ('RATE LAS VEGAS OPEN - DEMO', 'Futures Classic')
on conflict do nothing;
update public.tournaments set status = 'draft'
 where status not in ('draft', 'cancelled')
   and name not in ('RATE LAS VEGAS OPEN - DEMO', 'Futures Classic');

-- Play events organised by test accounts
insert into private.prelaunch_hidden (entity, row_id, old_value)
select 'play_event', id, status::text from public.play_events
 where status in ('open', 'full', 'in_progress') and organizer_id not in (select id from keep_people)
on conflict do nothing;
update public.play_events set status = 'cancelled'
 where status in ('open', 'full', 'in_progress') and organizer_id not in (select id from keep_people);

-- Listings by test accounts
insert into private.prelaunch_hidden (entity, row_id, old_value)
select 'listing', id, status::text from public.marketplace_listings
 where status in ('active', 'pending') and removed_at is null and seller_id not in (select id from keep_people)
on conflict do nothing;
update public.marketplace_listings set status = 'expired'
 where status in ('active', 'pending') and removed_at is null and seller_id not in (select id from keep_people);

drop table if exists keep_people;

-- ─── UNDO (run by hand if ever needed) ──────────────────────────────────────
-- update public.profiles p set is_discoverable = true
--   from private.prelaunch_hidden h where h.entity = 'profile' and h.row_id = p.id;
-- update public.tournaments t set status = h.old_value::public.tournament_status
--   from private.prelaunch_hidden h where h.entity = 'tournament' and h.row_id = t.id;
-- update public.play_events e set status = h.old_value::public.play_event_status
--   from private.prelaunch_hidden h where h.entity = 'play_event' and h.row_id = e.id;
-- update public.marketplace_listings l set status = h.old_value::public.marketplace_listing_status
--   from private.prelaunch_hidden h where h.entity = 'listing' and h.row_id = l.id;
