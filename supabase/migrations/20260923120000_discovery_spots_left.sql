-- Two corrections to 20260923100000, both prompted by the owner asking a good
-- question ("every event asks for a limit when being created").
--
-- 1. CAPACITY EXISTS. I removed {{spots_left}} from both discovery templates
--    claiming nothing stored one. It is tournaments.draw_size (and
--    divisions.draw_size): NOT NULL, set on all 16 tournaments in production,
--    and the app already computes remaining places as draw_size - spots_filled
--    in web's tournament detail, web admin, and mobile's "Most spots left"
--    sort. My schema search looked for capacity/max/spots/player, and
--    draw_size matches none of those words, so I concluded wrongly.
--
-- 2. 'filling_fast' IS A REGISTRATION STATE. fn_auto_tournament_status flips a
--    tournament from 'open' to 'filling_fast' at 80% full, and back if it
--    empties. Both jobs filtered status = 'open', so they skipped exactly the
--    tournaments nearest to selling out — the ones where a nudge is worth most
--    and where "5 spots left" earns its place in the copy.
--
-- A FULL tournament is now skipped entirely: telling someone about an event
-- they cannot enter is worse than silence, and it would spend their daily cap
-- to do it. draw_size = 0 means "no limit set", which is not the same as full.
--
-- Verified by dry run against real rows: 40/60 sent "20 spots left" to 27
-- players while 'open'; 55/60 sent "5 spots left" to 27 while 'filling_fast';
-- 60/60 sent nothing at all.

update public.notification_automations set
  body_template = '{{distance}} away · {{event_date}} · {{spots_left}} spots left.'
where key = 'tournament_near_you';

update public.notification_automations set
  body_template = 'Registration closes {{closes_at}} · {{spots_left}} spots left.'
where key = 'tournament_closing_soon';

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
           greatest(t.draw_size - coalesce(t.spots_filled, 0), 0) spots_left,
           pl.user_id,
           public.st_distance(
             public.st_setsrid(public.st_makepoint(f.longitude, f.latitude), 4326)::public.geography,
             public.st_setsrid(public.st_makepoint(pl.lng, pl.lat), 4326)::public.geography
           ) metres
      from public.tournaments t
      join public.facilities f on f.id = t.facility_id
      join private.player_locations() pl on true
     where t.status in ('open', 'filling_fast')
       and t.approved_at is not null
       and t.approved_at > now() - interval '48 hours'
       and t.event_date >= current_date
       and (t.draw_size = 0 or t.spots_filled < t.draw_size)
       and f.latitude is not null and f.longitude is not null
       and public.st_dwithin(
             public.st_setsrid(public.st_makepoint(f.longitude, f.latitude), 4326)::public.geography,
             public.st_setsrid(public.st_makepoint(pl.lng, pl.lat), 4326)::public.geography,
             v_radius)
       and not exists (
         select 1 from public.registrations reg
          where reg.tournament_id = t.id and reg.player_id = pl.user_id
            and reg.status not in ('withdrawn', 'expired_hold')
       )
       and t.director_id is distinct from pl.user_id
       and not exists (
         select 1 from public.notifications n
          where n.idempotency_key = 'tournament-near/' || t.id || '/' || pl.user_id
       )
  loop
    if private.automation_push_blocked_reason(r.user_id, 'tournament_near_you')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('tournament_near_you', jsonb_build_object(
      'tournament_name', r.name,
      'tournament_id',   r.tournament_id::text,
      'distance',        private.distance_label(r.metres),
      'event_date',      to_char(r.event_date, 'FMDay, FMMonth FMDD'),
      'spots_left',      r.spots_left::text
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
    select t.id tournament_id, t.name, t.registration_closes_at, b.player_id,
           greatest(t.draw_size - coalesce(t.spots_filled, 0), 0) spots_left
      from public.tournament_bookmarks b
      join public.tournaments t on t.id = b.tournament_id
      join public.profiles p on p.id = b.player_id
     where t.status in ('open', 'filling_fast')
       and t.registration_closes_at is not null
       and t.registration_closes_at > now()
       and t.registration_closes_at <= now() + make_interval(days => v_days)
       and (t.draw_size = 0 or t.spots_filled < t.draw_size)
       and p.deleted_at is null
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
      'closes_at',       to_char(r.registration_closes_at, 'FMDay FMHH12:MI AM'),
      'spots_left',      r.spots_left::text
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
