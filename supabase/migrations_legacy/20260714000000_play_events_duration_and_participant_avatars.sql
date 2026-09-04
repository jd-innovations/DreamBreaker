-- Community Play event screen enhancements:
-- 1. duration_minutes lets the app compute an event's end time (start_time + duration).
-- 2. play_participants_public gains avatar_url so claimed participants show their
--    profile photo instead of always falling back to initials.

alter table public.play_events
  add column if not exists duration_minutes integer;

comment on column public.play_events.duration_minutes is
  'Event duration in minutes; nullable — older events have no computed end time.';

drop view if exists public.play_participants_public;

create view public.play_participants_public as
  select
    pp.id, pp.event_id, pp.first_name, pp.last_initial, pp.self_rating, pp.gender,
    (pp.claimed_by is not null) as is_claimed, pp.created_at,
    prof.avatar_url
  from public.play_participants pp
  left join public.profiles prof on prof.id = pp.claimed_by;

grant select on public.play_participants_public to anon, authenticated;
