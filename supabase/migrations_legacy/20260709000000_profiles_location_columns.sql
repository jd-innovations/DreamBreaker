-- =============================================================================
-- Profile location columns — foundation for Dynamic Stories ranking
--
-- profiles.location_coords (a PostGIS geography(Point) from the initial
-- schema) already exists but is dead: nothing in the app reads or writes it.
-- Rather than resurrect that, add plain lat/lng columns that are trivial to
-- use in arithmetic distance without PostGIS function calls in every query.
-- Nothing captures these yet (no onboarding screen, no location-settings
-- write) — that capture UI is a separate follow-up. These columns exist so
-- Dynamic Stories ranking has somewhere to read from once that capture ships.
-- =============================================================================

alter table public.profiles
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists home_court_id uuid references public.facilities(id) on delete set null,
  add column if not exists story_radius_miles integer not null default 25;

create index if not exists idx_profiles_home_court on public.profiles(home_court_id);
