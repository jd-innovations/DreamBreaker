-- Coarsen the home location every signed-in user can read.
--
-- profiles.location_lat/lng is SELECT-able by `authenticated`, and it has to
-- be: distance is computed CLIENT-side in four places (web matchmaking, the
-- players directory, the mobile partner finder, and the profile page through
-- PUBLIC_PROFILE_COLUMNS). Revoking the grant would break all four, and an
-- app-layer helper protects nothing anyway — anyone with a session can read
-- the column straight through PostgREST.
--
-- The problem is precision, not readability. describeCoords() in
-- apps/mobile/src/lib/geocode.ts returns the coordinates it was handed and
-- only resolves the city NAME, so "use my current location" in Location
-- Settings wrote the device's exact position. 16 of 50 profiles carried more
-- than 2 decimal places. Ahead of a PUBLIC TestFlight that is every tester's
-- home, readable by every other tester.
--
-- 2 decimal places ~= a 1.1 km grid: a neighbourhood, not an address.
--
-- Measured against the 120 real profile pairs before applying:
--   worst distance shift   0.588 mi
--   average shift          0.268 mi
--   pairs crossing the 25-mile radius boundary   0
-- So radius filters and match scoring are unaffected. A displayed whole-mile
-- figure moves by 1 for some pairs, which is honest: the extra digits were
-- false precision about where someone lives.
--
-- Enforced by TRIGGER rather than at the call sites, because the column has
-- several writers (onboarding, Location Settings, profile edit) and a future
-- one must not be able to reintroduce precise coordinates by forgetting.

create or replace function public.fn_profiles_coarse_location()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.location_lat is not null then
    new.location_lat := round(new.location_lat::numeric, 2)::double precision;
  end if;
  if new.location_lng is not null then
    new.location_lng := round(new.location_lng::numeric, 2)::double precision;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_profiles_coarse_location() from public, anon, authenticated;

drop trigger if exists trg_profiles_coarse_location on public.profiles;
create trigger trg_profiles_coarse_location
  before insert or update of location_lat, location_lng on public.profiles
  for each row execute function public.fn_profiles_coarse_location();

comment on function public.fn_profiles_coarse_location() is
  'Rounds profiles.location_lat/lng to 2 decimal places (~1.1 km) on every '
  'write. The column is readable by every signed-in user, so this is what '
  'keeps a home address from being one of them.';

-- Existing rows. Only lat/lng change; the other profile triggers guard handle,
-- director status and coach fields and are unaffected.
update public.profiles
   set location_lat = round(location_lat::numeric, 2)::double precision,
       location_lng = round(location_lng::numeric, 2)::double precision
 where location_lat is not null or location_lng is not null;
