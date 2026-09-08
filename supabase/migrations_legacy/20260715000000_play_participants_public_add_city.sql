-- Expose the claimed participant's city/state so the roster can show
-- "location below name" alongside their avatar, matching the profile's
-- location_city / location_state fields.

drop view if exists public.play_participants_public;

create view public.play_participants_public as
  select
    pp.id, pp.event_id, pp.first_name, pp.last_initial, pp.self_rating, pp.gender,
    (pp.claimed_by is not null) as is_claimed, pp.created_at,
    prof.avatar_url, prof.location_city, prof.location_state
  from public.play_participants pp
  left join public.profiles prof on prof.id = pp.claimed_by;

grant select on public.play_participants_public to anon, authenticated;
