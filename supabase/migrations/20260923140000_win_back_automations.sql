-- Phase D: win-back. Two automations, and the activity stamp one of them needs.
--
-- ── Why not auth.users.last_sign_in_at ──────────────────────────────────────
-- It looks like the answer and is not. Supabase sessions persist and refresh
-- silently, so a player who opens the app daily may not "sign in" for months.
-- Using it would send "the courts miss you" to the most engaged users, which
-- is worse than sending nothing at all. profiles.last_active_at is written by
-- the app itself (touch_last_active, at most hourly).
--
-- Consequence, stated plainly: inactive_return cannot find anyone until the
-- column has been collecting for as long as its own threshold (14 days by
-- default). The job refuses rows where last_active_at is NULL rather than
-- reading "never recorded" as "inactive" — which would have mailed all 50
-- accounts on day one.

alter table public.profiles
  add column if not exists last_active_at timestamptz;

comment on column public.profiles.last_active_at is
  'Last time the app was opened by this user, written at most hourly by '
  'touch_last_active(). NOT auth.users.last_sign_in_at, which only moves on a '
  'real sign-in and would call a daily user lapsed.';

create index if not exists profiles_last_active_idx
  on public.profiles (last_active_at) where deleted_at is null;

create or replace function public.touch_last_active()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.profiles
     set last_active_at = now()
   where id = auth.uid()
     and (last_active_at is null or last_active_at < now() - interval '1 hour');
end;
$$;

revoke all on function public.touch_last_active() from public, anon;
grant execute on function public.touch_last_active() to authenticated;

-- ── Come back ───────────────────────────────────────────────────────────────

update public.notification_automations set
  timing = '{"inactive_days": 14, "send_local_hour": 17}'::jsonb,
  body_template = '{{count}} open {{games_word}} near you this week. Find one in a couple of taps.',
  description = 'A player who has not opened the app in a while, told what is actually happening near them. Needs profiles.last_active_at, which only exists from 2026-09-23 — until it has been collecting for inactive_days, this finds nobody.',
  wired = true
where key = 'inactive_return';

create or replace function public.send_inactive_return()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a        public.notification_automations%rowtype;
  v_days   integer;
  v_hour   integer;
  v_radius double precision;
  r        record;
  v_copy   record;
  v_count  integer := 0;
begin
  select * into a from public.notification_automations where key = 'inactive_return';
  if not found or not a.enabled then
    return 0;
  end if;

  v_days   := coalesce((a.timing ->> 'inactive_days')::int, 14);
  v_hour   := coalesce((a.timing ->> 'send_local_hour')::int, 17);
  v_radius := coalesce((select (timing ->> 'radius_miles')::double precision
                          from public.notification_automations where key = 'games_near_you'), 25) * 1609.344;

  for r in
    with lapsed as (
      select pl.user_id, pl.lat, pl.lng, coalesce(p.timezone, 'UTC') tz
        from private.player_locations() pl
        join public.profiles p on p.id = pl.user_id
       where p.deleted_at is null
         -- NULL is "never recorded", not "inactive". Never guess.
         and p.last_active_at is not null
         and p.last_active_at < now() - make_interval(days => v_days)
         and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC')))::int >= v_hour
    )
    select l.user_id, count(*)::integer games
      from lapsed l
      join public.play_events e on e.status = 'open'
      join public.facilities f  on f.id = e.facility_id
     where e.event_date >= (now() at time zone l.tz)::date
       and e.event_date <= (now() at time zone l.tz)::date + 7
       and f.latitude is not null and f.longitude is not null
       and public.st_dwithin(
             public.st_setsrid(public.st_makepoint(f.longitude, f.latitude), 4326)::public.geography,
             public.st_setsrid(public.st_makepoint(l.lng, l.lat), 4326)::public.geography,
             v_radius)
       and e.organizer_id is distinct from l.user_id
     group by l.user_id
  loop
    -- Nothing near them is a reason to stay quiet, not to invent a reason to
    -- come back. A win-back with nothing in it is just noise.
    if r.games < 1 then
      continue;
    end if;

    if private.automation_push_blocked_reason(r.user_id, 'inactive_return')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('inactive_return', jsonb_build_object(
      'count',      r.games::text,
      'games_word', case when r.games = 1 then 'game' else 'games' end
    ));

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (r.user_id, 'inactive_return',
            coalesce(v_copy.title, 'The courts miss you'),
            coalesce(v_copy.body, r.games || ' open games near you this week.'),
            coalesce(v_copy.link, '/community'),
            -- The month is in the key, so a permanently lapsed account is
            -- contacted at most monthly on top of the catalog's 336h throttle.
            'inactive-return/' || r.user_id || '/' || to_char(now(), 'YYYY-MM'))
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

-- ── Finish your profile ─────────────────────────────────────────────────────

update public.notification_automations set
  timing = '{"after_days": 3, "send_local_hour": 18}'::jsonb,
  description = 'A player whose profile lacks the two fields matchmaking and discovery actually use: skill level and home court. Sent once a month at most.',
  wired = true
where key = 'profile_incomplete';

create or replace function public.send_profile_incomplete()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a       public.notification_automations%rowtype;
  v_after integer;
  v_hour  integer;
  r       record;
  v_copy  record;
  v_count integer := 0;
begin
  select * into a from public.notification_automations where key = 'profile_incomplete';
  if not found or not a.enabled then
    return 0;
  end if;

  v_after := coalesce((a.timing ->> 'after_days')::int, 3);
  v_hour  := coalesce((a.timing ->> 'send_local_hour')::int, 18);

  for r in
    select p.id user_id
      from public.profiles p
     where p.deleted_at is null
       -- The two fields that change what the app can do for them: matchmaking
       -- needs a skill level, discovery needs a location.
       and (p.skill_level is null or p.home_court_id is null)
       and p.created_at < now() - make_interval(days => v_after)
       and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC')))::int >= v_hour
       and not exists (
         select 1 from public.notifications n
          where n.idempotency_key = 'profile-incomplete/' || p.id || '/' || to_char(now(), 'YYYY-MM')
       )
  loop
    if private.automation_push_blocked_reason(r.user_id, 'profile_incomplete')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('profile_incomplete', '{}'::jsonb);

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (r.user_id, 'profile_incomplete',
            coalesce(v_copy.title, 'Get better matches'),
            coalesce(v_copy.body, 'Add your skill level and home court.'),
            coalesce(v_copy.link, '/profile'),
            'profile-incomplete/' || r.user_id || '/' || to_char(now(), 'YYYY-MM'))
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_inactive_return() from public, anon, authenticated;
revoke all on function public.send_profile_incomplete() from public, anon, authenticated;

select cron.schedule('inactive-return', '0 * * * *', $$select public.send_inactive_return();$$);
select cron.schedule('profile-incomplete', '0 * * * *', $$select public.send_profile_incomplete();$$);
