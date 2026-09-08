-- Director-chosen amenity chips for the tournament detail strip.
--
-- The strip used to render a module-level constant in the app: every
-- tournament claimed "Sanctioned · USAP" and "Parking · Free" whether or not
-- it was true. This gives directors up to three real chips instead.
--
-- Stores KEYS, not labels. Labels and icons live in the app's catalog
-- (apps/mobile/src/lib/tournamentAmenities.ts), so rewording a chip is a code
-- change rather than a data migration — the same reason play_style stores keys.
--
-- Deliberately NOT constrained to a fixed key list. The app resolves each key
-- through its catalog and silently drops anything it does not recognise, so
-- adding or retiring a chip never needs a migration, and an older client that
-- has not been updated degrades to showing fewer chips rather than erroring.

alter table public.tournaments
  add column if not exists amenities text[] not null default '{}';

-- Three is a layout constraint, not a taste one: the strip is a flex row of
-- equal columns and a fourth makes the labels wrap on narrow devices. Enforced
-- here as well as in the picker so a bad write cannot break the detail screen.
alter table public.tournaments
  drop constraint if exists tournaments_amenities_max_3;

alter table public.tournaments
  add constraint tournaments_amenities_max_3
  check (array_length(amenities, 1) is null or array_length(amenities, 1) <= 3);

comment on column public.tournaments.amenities is
  'Up to 3 amenity keys chosen by the director; resolved to icon/label by the app catalog. Unknown keys are ignored by clients.';
