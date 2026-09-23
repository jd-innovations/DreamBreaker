-- Phase C: discovery. "A tournament near you was published" and "registration
-- closes soon on one you bookmarked".
--
-- ── Where a player is ───────────────────────────────────────────────────────
-- The same rule the directory map uses (20260922170000), and the same one the
-- owner approved: a player's HOME COURT, falling back to the centroid of their
-- city's courts. Precise device location is never read, and no notification
-- reveals anyone's position — the distance shown is from the player's own home
-- court to a public venue.
--
-- ── Why a scheduled job and not a trigger ───────────────────────────────────
-- A trigger on publish would fan out inside the director's own transaction,
-- and — worse — it would fire once, at whatever hour the director happened to
-- publish. Discovery is not critical, so it obeys quiet hours and the
-- frequency caps: a player who is asleep or has had their one push today must
-- be picked up LATER, not dropped. A job over a 48-hour window does that
-- naturally; each run skips whoever is currently blocked for a timing reason
-- and catches them on the next pass.
--
-- ── What "spots left" would have been ───────────────────────────────────────
-- Nothing. Neither tournaments nor divisions stores a capacity — only
-- spots_filled — so remaining places cannot be computed. The seeded copy
-- promised {{spots_left}}, which would have reached a phone as that literal
-- text. Both templates lose it here.

update public.notification_automations set
  body_template = '{{distance}} away · {{event_date}}. Tap to see the details.',
  wired = true
where key = 'tournament_near_you';

update public.notification_automations set
  body_template = 'Registration closes {{closes_at}}. Tap to enter.',
  wired = true
where key = 'tournament_closing_soon';

-- ── Where each player is, as one place to change it ─────────────────────────

create or replace function private.player_locations()
returns table (user_id uuid, lat double precision, lng double precision, source text)
language sql stable security definer set search_path = '' as $$
  -- Home court first: a real venue the player chose.
  select p.id, f.latitude::double precision, f.longitude::double precision, 'court'
    from public.profiles p
    join public.facilities f on f.id = p.home_court_id
   where p.deleted_at is null
     and f.latitude is not null and f.longitude is not null
  union all
  -- Otherwise the centroid of their city's courts. Coarser on purpose.
  select p.id, c.lat, c.lng, 'city'
    from public.profiles p
    left join public.facilities hc on hc.id = p.home_court_id
    join private.directory_city_centroids() c
      on c.key = lower(btrim(p.location_city)) || '|' || lower(btrim(coalesce(p.location_state, '')))
   where p.deleted_at is null
     and (p.home_court_id is null or hc.latitude is null or hc.longitude is null)
     and nullif(btrim(p.location_city), '') is not null;
$$;

-- Miles, rounded the way a person would say it: "2 miles", "12 miles".
create or replace function private.distance_label(p_metres double precision)
returns text language sql immutable as $$
  select case
    when p_metres is null then 'Nearby'
    when p_metres < 1609 then 'Less than a mile'
    else round(p_metres / 1609.344)::text || ' miles'
  end;
$$;

-- ── A newly published tournament near a player ──────────────────────────────

create or replace function public.send_tournament_discovery()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a       public.notification_automations%rowtype;
  v_radius double precision;
  r       record;
  v_copy  record;
  v_count integer := 0;
begin
  select * into a from public.notification_automations where key = 'tournament_near_you';
  if not found or not a.enabled then
    return 0;
  end if;

  v_radius := coalesce((a.timing ->> 'radius_miles')::double precision, 25) * 1609.344;

  for r in
    select t.id tournament_id, t.name, t.event_date,
           pl.user_id,
           public.st_distance(
             public.st_setsrid(public.st_makepoint(f.longitude, f.latitude), 4326)::public.geography,
             public.st_setsrid(public.st_makepoint(pl.lng, pl.lat), 4326)::public.geography
           ) metres
      from public.tournaments t
      join public.facilities f on f.id = t.facility_id
      join private.player_locations() pl on true
     where t.status = 'open'
       -- Published recently. The window is what lets a blocked player be
       -- caught on a later run instead of missing out entirely.
       and t.approved_at is not null
       and t.approved_at > now() - interval '48 hours'
       and t.event_date >= current_date
       and f.latitude is not null and f.longitude is not null
       and public.st_dwithin(
             public.st_setsrid(public.st_makepoint(f.longitude, f.latitude), 4326)::public.geography,
             public.st_setsrid(public.st_makepoint(pl.lng, pl.lat), 4326)::public.geography,
             v_radius)
       -- Not to someone already in it, and not to the director who made it.
       and not exists (
         select 1 from public.registrations reg
          where reg.tournament_id = t.id and reg.player_id = pl.user_id
            and reg.status not in ('withdrawn', 'expired_hold')
       )
       and t.director_id is distinct from pl.user_id
       -- Said once per player per tournament, ever.
       and not exists (
         select 1 from public.notifications n
          where n.idempotency_key = 'tournament-near/' || t.id || '/' || pl.user_id
       )
  loop
    -- Timing blocks DEFER rather than drop: quiet hours, the daily/weekly cap
    -- and the throttle all mean "not now", and the 48-hour window gives the
    -- next run a chance. Anything else (preference off, no device) is a
    -- settled answer, and the in-app row is still worth writing for it.
    if private.automation_push_blocked_reason(r.user_id, 'tournament_near_you')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('tournament_near_you', jsonb_build_object(
      'tournament_name', r.name,
      'tournament_id',   r.tournament_id::text,
      'distance',        private.distance_label(r.metres),
      'event_date',      to_char(r.event_date, 'FMDay, FMMonth FMDD')
    ));

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (
      r.user_id,
      'tournament_near_you',
      coalesce(v_copy.title, 'New tournament near you'),
      coalesce(v_copy.body, r.name || ' is open for registration.'),
      coalesce(v_copy.link, '/tournament/' || r.tournament_id),
      'tournament-near/' || r.tournament_id || '/' || r.user_id
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.send_tournament_discovery() is
  'Tells players about a tournament published in the last 48h within the '
  'catalog radius of their home court (or city centroid). Never reads precise '
  'location. No-op while tournament_near_you is disabled.';

-- ── Registration closing on something they bookmarked ───────────────────────
-- The audience is people who showed intent and did not finish: a bookmark with
-- no registration. That is a far better signal than proximity, which is why
-- this one is worth having even though the tournament may be far away.

create or replace function public.send_tournament_closing_soon()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a       public.notification_automations%rowtype;
  v_days  integer;
  v_hour  integer;
  r       record;
  v_copy  record;
  v_count integer := 0;
begin
  select * into a from public.notification_automations where key = 'tournament_closing_soon';
  if not found or not a.enabled then
    return 0;
  end if;

  v_days := coalesce((a.timing ->> 'days_before')::int, 2);
  v_hour := coalesce((a.timing ->> 'send_local_hour')::int, 18);

  for r in
    select t.id tournament_id, t.name, t.registration_closes_at, b.player_id
      from public.tournament_bookmarks b
      join public.tournaments t on t.id = b.tournament_id
      join public.profiles p on p.id = b.player_id
     where t.status = 'open'
       and t.registration_closes_at is not null
       and t.registration_closes_at > now()
       and t.registration_closes_at <= now() + make_interval(days => v_days)
       and p.deleted_at is null
       -- Their own local evening, like the other day-before rules: events carry
       -- no timezone, and a "last call" at 3am helps nobody.
       and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC'))) >= v_hour
       and not exists (
         select 1 from public.registrations reg
          where reg.tournament_id = t.id and reg.player_id = b.player_id
            and reg.status not in ('withdrawn', 'expired_hold')
       )
       and not exists (
         select 1 from public.notifications n
          where n.idempotency_key = 'tournament-closing/' || t.id || '/' || b.player_id
       )
  loop
    if private.automation_push_blocked_reason(r.player_id, 'tournament_closing_soon')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('tournament_closing_soon', jsonb_build_object(
      'tournament_name', r.name,
      'tournament_id',   r.tournament_id::text,
      'closes_at',       to_char(r.registration_closes_at, 'FMDay FMHH12:MI AM')
    ));

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (
      r.player_id,
      'tournament_closing_soon',
      coalesce(v_copy.title, 'Last call: ' || r.name),
      coalesce(v_copy.body, 'Registration closes soon.'),
      coalesce(v_copy.link, '/tournament/' || r.tournament_id),
      'tournament-closing/' || r.tournament_id || '/' || r.player_id
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.send_tournament_closing_soon() is
  'Last call to players who bookmarked a tournament and never entered. '
  'No-op while tournament_closing_soon is disabled.';

revoke all on function public.send_tournament_discovery() from public, anon, authenticated;
revoke all on function public.send_tournament_closing_soon() from public, anon, authenticated;
revoke all on function private.player_locations() from public, anon, authenticated;

-- Every half hour: often enough that a quiet-hours deferral lands soon after
-- 8am, rare enough that the 48-hour window is not scanned pointlessly.
select cron.schedule('tournament-discovery', '*/30 * * * *',
                     $$select public.send_tournament_discovery();$$);
select cron.schedule('tournament-closing-soon', '0 * * * *',
                     $$select public.send_tournament_closing_soon();$$);
