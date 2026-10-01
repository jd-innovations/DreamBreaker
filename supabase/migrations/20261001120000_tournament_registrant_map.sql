-- Registrant map for the director (web first, mobile later) — owner-approved 2026-10-01.
--
-- "Where is my field from": registrants pinned at their home court or city,
-- with the venue, for the tournament's own director only.
--
-- ── Who may call it ─────────────────────────────────────────────────────────
--
-- The tournament's director, decided by the same rule as the existing
-- "registrations: director read own tournament" policy: tournaments.director_id
-- = auth.uid(). There is no co-director or staff model; when one exists, change
-- private.assert_tournament_director() and both functions follow. Anyone else
-- gets 42501, not an empty map — an empty map would read as "no registrants".
--
-- ── Never a precise location ────────────────────────────────────────────────
--
-- Same placement as the players map (20260922170000): HOME COURT, else CITY
-- (average of that city's courts), else unplaced. profiles.location_lat/lng are
-- never read.
--
-- Unlike the directory, is_discoverable and blocks are NOT applied: these are
-- the director's own registrants, already on the director's roster. Deleted
-- accounts (anonymized tombstones) are left out. Guests (no app account,
-- guest_player_id / guest_partner_id) have no location and are counted apart.
--
-- ── People, not rows ────────────────────────────────────────────────────────
--
-- A doubles partner usually holds a registration row of their own as well as
-- appearing as partner_id on their teammate's, so people are deduplicated
-- across player_id and partner_id.

-- ─── Authorization ──────────────────────────────────────────────────────────

create or replace function private.assert_tournament_director(p_tournament_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.tournaments t
     where t.id = p_tournament_id and t.director_id = auth.uid()
  ) then
    raise exception 'Not authorized for this tournament' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_tournament_director(uuid) from public;

-- ─── The people in scope ────────────────────────────────────────────────────
--
-- p_status_group: 'active' (default) | 'waitlist' | 'all' (active + waitlist).
-- Held, expired holds, withdrawn and disqualified are never included.

create or replace function private.tournament_registrant_people(
  p_tournament_id uuid,
  p_division_id uuid,
  p_status_group text
)
returns table (profile_id uuid, guest_id uuid, division_id uuid, status text)
language sql
stable
set search_path = ''
as $$
  with regs as (
    select r.player_id, r.partner_id, r.guest_player_id, r.guest_partner_id,
           r.division_id, r.status::text as status
      from public.registrations r
     where r.tournament_id = p_tournament_id
       and (p_division_id is null or r.division_id = p_division_id)
       and r.status::text = any (
             case coalesce(p_status_group, 'active')
               when 'waitlist' then array['waitlisted', 'waitlist_offered']
               when 'all'      then array['registered', 'checked_in', 'substitute', 'no_show',
                                          'waitlisted', 'waitlist_offered']
               else                 array['registered', 'checked_in', 'substitute', 'no_show']
             end)
  )
  select player_id, null::uuid, division_id, status from regs where player_id is not null
  union
  select partner_id, null::uuid, division_id, status from regs where partner_id is not null
  union
  select null::uuid, guest_player_id, division_id, status from regs where guest_player_id is not null
  union
  select null::uuid, guest_partner_id, division_id, status from regs where guest_partner_id is not null;
$$;

revoke all on function private.tournament_registrant_people(uuid, uuid, text) from public;

-- ─── Pins ───────────────────────────────────────────────────────────────────
--
-- kind:  'venue'    the tournament's facility (player_count 0); absent when the
--                   tournament has no facility with coordinates
--        'court'    registrants whose home court is here
--        'city'     registrants with no usable home court, at their city
--        'unplaced' accounts with neither (lat/lng null)
--        'guest'    registrants with no app account (lat/lng null)

create or replace function public.tournament_registrant_pins(
  p_tournament_id uuid,
  p_division_id uuid default null,
  p_status_group text default 'active'
)
returns table (
  kind text,
  key text,
  label text,
  sublabel text,
  lat double precision,
  lng double precision,
  player_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_tournament_director(p_tournament_id);

  return query
  with people as (
    select distinct profile_id, guest_id
      from private.tournament_registrant_people(p_tournament_id, p_division_id, p_status_group)
  ),
  e as (
    select p.id, p.home_court_id, p.location_city, p.location_state
      from people x
      join public.profiles p on p.id = x.profile_id
     where p.deleted_at is null
  ),
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
  ),
  venue as (
    select 'venue'::text, f.id::text, f.name,
           concat_ws(', ', nullif(btrim(f.city), ''), nullif(btrim(f.state), '')),
           f.latitude::double precision, f.longitude::double precision, 0
      from public.tournaments t
      join public.facilities f on f.id = t.facility_id
     where t.id = p_tournament_id
       and f.latitude is not null and f.longitude is not null
  ),
  placed as (select * from courts union all select * from cities)
  select * from venue
  union all
  select * from placed
  union all
  select 'unplaced'::text, 'unplaced'::text, 'No home court or city'::text, ''::text,
         null::double precision, null::double precision,
         ((select count(*) from e) - coalesce((select sum(pl.player_count) from placed pl), 0))::integer
  union all
  select 'guest'::text, 'guest'::text, 'Guests (no app account)'::text, ''::text,
         null::double precision, null::double precision,
         (select count(distinct guest_id) from people where guest_id is not null)::integer;
end;
$$;

-- ─── The registrants at one pin ─────────────────────────────────────────────
--
-- p_kind 'court' | 'city' | 'unplaced'. Guests are not listable here; the
-- roster already names them.

create or replace function public.tournament_registrant_pin_players(
  p_tournament_id uuid,
  p_kind text,
  p_key text,
  p_division_id uuid default null,
  p_status_group text default 'active'
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
  divisions text,
  statuses text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.assert_tournament_director(p_tournament_id);

  return query
  with rows_in as (
    select x.profile_id, x.division_id, x.status
      from private.tournament_registrant_people(p_tournament_id, p_division_id, p_status_group) x
     where x.profile_id is not null
  ),
  e as (
    select p.id, p.home_court_id, p.location_city, p.location_state
      from (select distinct profile_id from rows_in) x
      join public.profiles p on p.id = x.profile_id
     where p.deleted_at is null
  ),
  located as (
    select e.id,
           case
             when hc.latitude is not null and hc.longitude is not null then 'court'
             when c.key is not null then 'city'
             else 'unplaced'
           end as kind,
           case
             when hc.latitude is not null and hc.longitude is not null then hc.id::text
             when c.key is not null then c.key
             else 'unplaced'
           end as key
      from e
      left join public.facilities hc on hc.id = e.home_court_id
      left join private.directory_city_centroids() c
        on nullif(btrim(e.location_city), '') is not null
       and c.key = lower(btrim(e.location_city)) || '|' || lower(btrim(coalesce(e.location_state, '')))
  )
  select p.id, p.full_name, p.handle, p.avatar_url, p.dupr, p.self_rating,
         p.location_city, p.location_state,
         (select string_agg(distinct d.name, ', ')
            from rows_in ri join public.divisions d on d.id = ri.division_id
           where ri.profile_id = p.id),
         (select string_agg(distinct ri.status, ', ') from rows_in ri where ri.profile_id = p.id)
    from located l
    join public.profiles p on p.id = l.id
   where l.kind = p_kind and l.key = p_key
   order by p.full_name asc nulls last
   limit 500;
end;
$$;

revoke all on function public.tournament_registrant_pins(uuid, uuid, text) from public, anon;
revoke all on function public.tournament_registrant_pin_players(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.tournament_registrant_pins(uuid, uuid, text) to authenticated;
grant execute on function public.tournament_registrant_pin_players(uuid, text, text, uuid, text) to authenticated;
