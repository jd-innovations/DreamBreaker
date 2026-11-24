-- "Players near you" for the mobile Find Players screen — owner-approved 2026-11-24.
--
-- Fills the directory's empty state (before the user types) with discoverable
-- players around the viewer. Same privacy model as the web players map
-- (20260922170000), which this reuses rather than restates:
--
--   * A player is placed at their HOME COURT (a public place, already on their
--     public profile), else at their CITY's centre (average of the directory's
--     courts there). profiles.location_lat/lng — a person's own position — is
--     never read for the players returned.
--   * Eligibility is private.directory_eligible(): signed-in only, discoverable,
--     not deleted, not the viewer, not blocked in either direction.
--   * Distance is from that public point, rounded to whole miles.
--
-- The viewer's anchor: p_lat/p_lng when the app has location permission (that
-- is the viewer's own position, used only to sort and never stored or
-- returned), else the viewer's home court, else the viewer's city centre.
-- No anchor -> no rows (the app asks the viewer to set a home court).

create or replace function public.directory_nearby_players(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_meters double precision default 40234,  -- 25 miles
  p_limit integer default 30,
  p_offset integer default 0
)
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
  mutual_count integer,
  place_label text,      -- home court name, or "City, ST"
  place_kind text,       -- 'court' | 'city'
  distance_miles integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  viewer as (
    select p.home_court_id, p.location_city, p.location_state
      from public.profiles p
     where p.id = (select uid from me)
  ),
  anchor as (
    select coalesce(
      case when p_lat between -90 and 90 and p_lng between -180 and 180
           then public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography end,
      (select public.st_setsrid(public.st_makepoint(f.longitude::double precision, f.latitude::double precision), 4326)::public.geography
         from viewer v join public.facilities f on f.id = v.home_court_id
        where f.latitude is not null and f.longitude is not null),
      (select public.st_setsrid(public.st_makepoint(c.lng, c.lat), 4326)::public.geography
         from viewer v
         join private.directory_city_centroids() c
           on c.key = lower(btrim(v.location_city)) || '|' || lower(btrim(coalesce(v.location_state, ''))))
    ) as g
  ),
  my_conns as (
    select case when pm.user_a = (select uid from me) then pm.user_b else pm.user_a end as id
      from public.partner_matches pm
     where (select uid from me) in (pm.user_a, pm.user_b)
  ),
  e as (select * from private.directory_eligible()),
  placed as (
    -- Home court first; city centre only when there is no usable home court.
    select e.id, hc.name as place_label, 'court'::text as place_kind,
           public.st_setsrid(public.st_makepoint(hc.longitude::double precision, hc.latitude::double precision), 4326)::public.geography as g
      from e join public.facilities hc on hc.id = e.home_court_id
     where hc.latitude is not null and hc.longitude is not null
    union all
    select e.id, concat_ws(', ', c.city, nullif(c.state, '')), 'city'::text,
           public.st_setsrid(public.st_makepoint(c.lng, c.lat), 4326)::public.geography
      from e
      left join public.facilities hc on hc.id = e.home_court_id
      join private.directory_city_centroids() c
        on c.key = lower(btrim(e.location_city)) || '|' || lower(btrim(coalesce(e.location_state, '')))
     where (e.home_court_id is null or hc.latitude is null or hc.longitude is null)
       and nullif(btrim(e.location_city), '') is not null
  ),
  near as (
    select pl.*, public.st_distance(pl.g, a.g) as meters
      from placed pl, anchor a
     where a.g is not null
       and public.st_dwithin(pl.g, a.g, greatest(least(coalesce(p_radius_meters, 40234), 160934), 1))
  )
  select p.id, p.full_name, p.handle, p.avatar_url, p.dupr, p.self_rating,
         p.location_city, p.location_state,
         exists (select 1 from my_conns c where c.id = p.id),
         (select count(*)::integer
            from public.partner_matches pm2
           where p.id in (pm2.user_a, pm2.user_b)
             and (case when pm2.user_a = p.id then pm2.user_b else pm2.user_a end) in (select c.id from my_conns c)),
         n.place_label,
         n.place_kind,
         round(n.meters / 1609.344)::integer
    from near n
    join public.profiles p on p.id = n.id
   order by round(n.meters / 1609.344), 10 desc, p.full_name asc, p.id
   limit greatest(least(coalesce(p_limit, 30), 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.directory_nearby_players(double precision, double precision, double precision, integer, integer) is
  'Players near you (mobile Find Players empty state). Places players at their home court or city centre, never their own coordinates; eligibility via private.directory_eligible(). SECURITY DEFINER because is_blocked_between() must see blocks in both directions.';

revoke all on function public.directory_nearby_players(double precision, double precision, double precision, integer, integer) from public, anon;
grant execute on function public.directory_nearby_players(double precision, double precision, double precision, integer, integer) to authenticated;
