-- play_participants_public (granted to anon + authenticated) deliberately
-- omits claimed_by so anonymous browsers can't scrape which real accounts
-- attend which events. But signed-in players tapping a roster entry need the
-- claimed player's profile id to open their profile — so add a second view,
-- authenticated-only, that includes claimed_by (still excluding email/phone,
-- which stay organizer/self-only via play_participants' own RLS).

create view public.play_participants_authenticated as
  select
    pp.id, pp.event_id, pp.first_name, pp.last_initial, pp.self_rating, pp.gender,
    pp.claimed_by, (pp.claimed_by is not null) as is_claimed, pp.created_at,
    prof.avatar_url, prof.location_city, prof.location_state,
    prof.self_rating as profile_self_rating
  from public.play_participants pp
  left join public.profiles prof on prof.id = pp.claimed_by;

grant select on public.play_participants_authenticated to authenticated;
