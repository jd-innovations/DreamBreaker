-- play_participants.self_rating is only ever set for guest sign-ups; claimed
-- participants' real rating lives on profiles.self_rating. Expose it so the
-- roster can fall back to the account's actual rating when the per-invite
-- field is empty (which it always is for claimed/existing-account players).

drop view if exists public.play_participants_public;

create view public.play_participants_public as
  select
    pp.id, pp.event_id, pp.first_name, pp.last_initial, pp.self_rating, pp.gender,
    (pp.claimed_by is not null) as is_claimed, pp.created_at,
    prof.avatar_url, prof.location_city, prof.location_state,
    prof.self_rating as profile_self_rating
  from public.play_participants pp
  left join public.profiles prof on prof.id = pp.claimed_by;

grant select on public.play_participants_public to anon, authenticated;
