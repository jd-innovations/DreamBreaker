-- Players map for the web directory (/players) — owner-approved 2026-09-22.
--
-- ── Never a precise location ────────────────────────────────────────────────
--
-- profiles.location_lat/lng are personal: every one checked on 2026-09-22 had
-- ~11 m precision and none matched the player's home court. These functions
-- NEVER read them. A player is placed by, in order (owner decision):
--
--   1. HOME COURT   facilities.latitude/longitude of profiles.home_court_id —
--                   a public place, and already shown on the public profile
--   2. CITY         the average position of the directory's courts in the
--                   player's city/state — a city-level point, no geocoder.
--                   profiles has no postal code, so there is no zip level.
--   3. nowhere      still findable by name search, just not on the map
--
-- ── Same rules as search_players (20260921160000) ───────────────────────────
--
-- Signed-in only (anon cannot execute; a null auth.uid() yields no rows),
-- is_discoverable, not deleted, not the viewer, and not blocked in EITHER
-- direction — is_blocked_between() is why these are SECURITY DEFINER.

create or replace function private.directory_eligible()
returns table (id uuid, home_court_id uuid, location_city text, location_state text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.home_court_id, p.location_city, p.location_state
    from public.profiles p
   where auth.uid() is not null
     and p.id <> auth.uid()
     and p.is_discoverable = true
     and p.deleted_at is null
     and not public.is_blocked_between(auth.uid(), p.id);
$$;

revoke all on function private.directory_eligible() from public;

-- City centroids from the courts directory, keyed "city|state" lower-cased.
create or replace function private.directory_city_centroids()
returns table (key text, city text, state text, lat double precision, lng double precision)
language sql
stable
set search_path = ''
as $$
  select lower(btrim(f.city)) || '|' || lower(btrim(coalesce(f.state, ''))),
         min(btrim(f.city)), min(btrim(f.state)),
         avg(f.latitude)::double precision, avg(f.longitude)::double precision
    from public.facilities f
   where f.latitude is not null and f.longitude is not null and nullif(btrim(f.city), '') is not null
   group by 1;
$$;

revoke all on function private.directory_city_centroids() from public;

-- ─── Pins in an area ────────────────────────────────────────────────────────

create or replace function public.directory_map_pins(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision default 80467
)
returns table (
  kind text,           -- 'court' | 'city'
  key text,            -- facility id, or "city|state"
  label text,
  sublabel text,
  lat double precision,
  lng double precision,
  player_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with e as (select * from private.directory_eligible()),
  courts as (
    select 'court'::text as kind, f.id::text as key, f.name as label,
           concat_ws(', ', nullif(btrim(f.city), ''), nullif(btrim(f.state), '')) as sublabel,
           f.latitude::double precision as lat, f.longitude::double precision as lng,
           count(*)::integer as player_count
      from e
      join public.facilities f on f.id = e.home_court_id
     where f.latitude is not null and f.longitude is not null
     group by f.id
  ),
  cities as (
    select 'city'::text, c.key, concat_ws(', ', c.city, nullif(c.state, '')), 'City'::text,
           c.lat, c.lng, count(*)::integer
      from e
      left join public.facilities hc on hc.id = e.home_court_id
      join private.directory_city_centroids() c
        on c.key = lower(btrim(e.location_city)) || '|' || lower(btrim(coalesce(e.location_state, '')))
     where (e.home_court_id is null or hc.latitude is null or hc.longitude is null)
       and nullif(btrim(e.location_city), '') is not null
     group by c.key, c.city, c.state, c.lat, c.lng
  )
  select * from (select * from courts union all select * from cities) pins
   where public.st_dwithin(
           public.st_setsrid(public.st_makepoint(pins.lng, pins.lat), 4326)::public.geography,
           public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography,
           greatest(least(coalesce(p_radius_meters, 80467), 500000), 1))
   order by pins.player_count desc, pins.label
   limit 300;
$$;

-- ─── The players at one pin ─────────────────────────────────────────────────
--
-- Same row shape and ordering as search_players: connected first, then by
-- mutual connections, then by name.

create or replace function public.directory_map_players(p_kind text, p_key text)
returns table (
  id uuid,
  full_name text,
  handle text,
  avatar_url text,
  dupr numeric,
  self_rating text,
  location_city text,
  location_state text,
  is_connected boolean,
  mutual_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  my_conns as (
    select case when pm.user_a = (select uid from me) then pm.user_b else pm.user_a end as id
      from public.partner_matches pm
     where (select uid from me) in (pm.user_a, pm.user_b)
  ),
  e as (select * from private.directory_eligible()),
  picked as (
    select e.id
      from e
      left join public.facilities hc on hc.id = e.home_court_id
     where (p_kind = 'court'
            and e.home_court_id::text = p_key
            and hc.latitude is not null and hc.longitude is not null)
        or (p_kind = 'city'
            and (e.home_court_id is null or hc.latitude is null or hc.longitude is null)
            and lower(btrim(e.location_city)) || '|' || lower(btrim(coalesce(e.location_state, ''))) = p_key)
  )
  select p.id, p.full_name, p.handle, p.avatar_url, p.dupr, p.self_rating,
         p.location_city, p.location_state,
         exists (select 1 from my_conns c where c.id = p.id),
         (select count(*)::integer
            from public.partner_matches pm2
           where p.id in (pm2.user_a, pm2.user_b)
             and (case when pm2.user_a = p.id then pm2.user_b else pm2.user_a end) in (select c.id from my_conns c))
    from picked
    join public.profiles p on p.id = picked.id
   order by 9 desc, 10 desc, p.full_name asc
   limit 100;
$$;

revoke all on function public.directory_map_pins(double precision, double precision, double precision) from public, anon;
revoke all on function public.directory_map_players(text, text) from public, anon;
grant execute on function public.directory_map_pins(double precision, double precision, double precision) to authenticated;
grant execute on function public.directory_map_players(text, text) to authenticated;
