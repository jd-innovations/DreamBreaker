-- Phase C, third automation: "games near you this weekend".
--
-- A weekly digest rather than one push per game. Community games are created
-- in bunches, and a notification per game would burn the frequency cap in an
-- afternoon and teach people to turn notifications off. One message a week
-- with a count is the version that survives contact with a real user.
--
-- ── Timing ──────────────────────────────────────────────────────────────────
--   {"weekday": 4, "send_local_hour": 18, "radius_miles": 25, "days_ahead": 4}
-- ISO weekday (1 = Monday), so 4 is Thursday evening — when someone actually
-- decides about their weekend. All four are admin-editable.
--
-- ── Geography ───────────────────────────────────────────────────────────────
-- play_events.location is a TEXT address, not a point, so only games attached
-- to a facility can be measured (35 of 49 today). Games with a free-text venue
-- are invisible to this automation. Geocoding them is a separate job; counting
-- what we can measure is honest, counting the rest by guesswork is not.
--
-- ── Dedup ───────────────────────────────────────────────────────────────────
-- One per player per ISO week, in the key. The catalog's 168h throttle says
-- the same thing, but the key is what makes it true across a restart or a
-- changed throttle.

-- The seeded link was /games, which is not a route. /community is, though a
-- digest has no single id to open — DEEP_LINK_ROOTS resolves a root only WITH
-- an id, so a tap opens the app rather than a screen. The in-app notification
-- list navigates by its own routing and does reach the community list.
update public.notification_automations set
  link_template = '/community',
  timing = '{"weekday": 4, "send_local_hour": 18, "radius_miles": 25, "days_ahead": 4}'::jsonb,
  body_template = '{{count}} open {{games_word}} near you in the next few days. Tap to grab a spot.',
  description = 'Weekly digest of open community games near a player''s home court. Only games attached to a facility can be counted — play_events.location is a text address, not a point.',
  wired = true
where key = 'games_near_you';

create or replace function public.send_games_near_you()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a        public.notification_automations%rowtype;
  v_radius double precision;
  v_dow    integer;
  v_hour   integer;
  v_ahead  integer;
  r        record;
  v_copy   record;
  v_count  integer := 0;
begin
  select * into a from public.notification_automations where key = 'games_near_you';
  if not found or not a.enabled then
    return 0;
  end if;

  v_radius := coalesce((a.timing ->> 'radius_miles')::double precision, 25) * 1609.344;
  v_dow    := coalesce((a.timing ->> 'weekday')::int, 4);
  v_hour   := coalesce((a.timing ->> 'send_local_hour')::int, 18);
  v_ahead  := coalesce((a.timing ->> 'days_ahead')::int, 4);

  for r in
    with player as (
      select pl.user_id, pl.lat, pl.lng, coalesce(p.timezone, 'UTC') tz
        from private.player_locations() pl
        join public.profiles p on p.id = pl.user_id
       where p.deleted_at is null
         -- The player's own local day and hour decide when this lands.
         and extract(isodow from (now() at time zone coalesce(p.timezone, 'UTC')))::int = v_dow
         and extract(hour   from (now() at time zone coalesce(p.timezone, 'UTC')))::int >= v_hour
    )
    select pw.user_id,
           pw.tz,
           count(*)::integer games,
           to_char(now() at time zone pw.tz, 'IYYY-IW') week_key
      from player pw
      join public.play_events e on e.status = 'open'
      join public.facilities f  on f.id = e.facility_id
     where e.event_date >= (now() at time zone pw.tz)::date
       and e.event_date <= (now() at time zone pw.tz)::date + v_ahead
       and f.latitude is not null and f.longitude is not null
       and public.st_dwithin(
             public.st_setsrid(public.st_makepoint(f.longitude, f.latitude), 4326)::public.geography,
             public.st_setsrid(public.st_makepoint(pw.lng, pw.lat), 4326)::public.geography,
             v_radius)
       -- Nothing they are already part of, and nothing they are running.
       and e.organizer_id is distinct from pw.user_id
       and not exists (
         select 1 from public.play_participants pp
          where pp.event_id = e.id and pp.claimed_by = pw.user_id
       )
     group by pw.user_id, pw.tz
  loop
    -- Never send "0 games near you".
    if r.games < 1 then
      continue;
    end if;

    -- Already had this week's digest?
    if exists (
      select 1 from public.notifications n
       where n.idempotency_key = 'games-near/' || r.user_id || '/' || r.week_key
    ) then
      continue;
    end if;

    -- Timing blocks defer to the next hourly run, which is still inside the
    -- same evening for most people; the week key stops it becoming a second
    -- digest if it slips past midnight.
    if private.automation_push_blocked_reason(r.user_id, 'games_near_you')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('games_near_you', jsonb_build_object(
      'count',      r.games::text,
      'games_word', case when r.games = 1 then 'game' else 'games' end
    ));

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (
      r.user_id,
      'games_near_you',
      coalesce(v_copy.title, 'Games near you'),
      coalesce(v_copy.body, r.games || ' open games near you.'),
      coalesce(v_copy.link, '/community'),
      'games-near/' || r.user_id || '/' || r.week_key
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.send_games_near_you() is
  'Weekly digest of open community games near a player, on the catalog''s '
  'weekday at their own local hour. Facility-based games only. No-op while '
  'games_near_you is disabled.';

revoke all on function public.send_games_near_you() from public, anon, authenticated;

-- Hourly: the weekday and hour are decided per player inside the function,
-- because "Thursday 6pm" is a different instant in every timezone.
select cron.schedule('games-near-you', '0 * * * *',
                     $$select public.send_games_near_you();$$);
