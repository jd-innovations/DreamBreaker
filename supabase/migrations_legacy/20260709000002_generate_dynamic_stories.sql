-- =============================================================================
-- Dynamic Stories v0.1 — generator + cron schedule
--
-- Pure SQL, no edge function/pg_net needed (unlike push notifications) since
-- generation makes no third-party HTTP call. Scheduled via pg_cron (already
-- installed on this project) every 15 minutes, mirroring the existing
-- waitlist-sweeper cron-sweep pattern but entirely in-database.
-- =============================================================================

create or replace function public.generate_dynamic_stories()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Housekeeping: drop expired rows so dedupe/unique constraints don't block
  -- regeneration and the client never sees stale cards.
  delete from public.dynamic_stories where expires_at < now();

  -- ── Tournament stories ──────────────────────────────────────────────────
  insert into public.dynamic_stories (
    story_type, title, subtitle, slides, cta_label, cta_route,
    source_type, source_id, priority_score, expires_at
  )
  select
    'tournament',
    t.name,
    'Tournament registration',
    jsonb_build_array(
      jsonb_build_object(
        'headline', t.name || ' is filling up',
        'subheadline', to_char(t.event_date, 'FMMonth FMDD'),
        'body', coalesce(t.spots_filled, 0) || ' of ' || coalesce(t.draw_size, 0) || ' spots filled'
      ),
      jsonb_build_object(
        'headline', case
          when t.registration_closes_at is not null and t.registration_closes_at < now() + interval '48 hours'
            then 'Registration closes soon'
          else 'Registration is open'
        end,
        'metadata', case
          when t.registration_closes_at is not null
            then 'Closes ' || to_char(t.registration_closes_at, 'FMMonth FMDD, HH12:MI AM')
          else null
        end
      ),
      jsonb_build_object(
        'headline', greatest(coalesce(t.draw_size, 0) - coalesce(t.spots_filled, 0), 0) || ' spots remain',
        'body', 'Near your area'
      )
    ),
    'Register',
    '/tournament/' || t.id,
    'tournament',
    t.id,
    -- Priority: urgency (closing soon) + scarcity (few spots left), highest first.
    (case
      when t.registration_closes_at is not null and t.registration_closes_at < now() + interval '48 hours' then 50
      else 10
    end)
    + (case
      when t.draw_size > 0 and (t.draw_size - coalesce(t.spots_filled, 0)) <= 5 then 30
      else 0
    end),
    least(coalesce(t.registration_closes_at, now() + interval '24 hours'), now() + interval '24 hours')
  from public.tournaments t
  where t.status in ('open', 'filling_fast')
    and (t.registration_closes_at is null or t.registration_closes_at > now())
    and (t.draw_size is null or t.draw_size = 0 or coalesce(t.spots_filled, 0) < t.draw_size)
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do update set
    title = excluded.title,
    slides = excluded.slides,
    priority_score = excluded.priority_score,
    expires_at = excluded.expires_at;

  -- ── Game (play_events) stories ──────────────────────────────────────────
  insert into public.dynamic_stories (
    story_type, title, subtitle, slides, cta_label, cta_route,
    source_type, source_id, priority_score, expires_at
  )
  select
    'game',
    pe.name,
    'Community Play',
    jsonb_build_array(
      jsonb_build_object(
        'headline', pe.name || ' is starting nearby',
        'subheadline', 'Around your area'
      ),
      jsonb_build_object(
        'headline', 'Starts ' || to_char(pe.event_date, 'FMMonth FMDD') || ' at ' || to_char(pe.start_time, 'HH12:MI AM'),
        'metadata', v.spots_remaining || ' spot' || (case when v.spots_remaining = 1 then '' else 's' end) || ' left'
      )
    ),
    'Join Game',
    '/community/' || pe.id,
    'play_event',
    pe.id,
    -- Priority: starting soon ranks above merely having open spots.
    (case
      when (pe.event_date + pe.start_time) < now() + interval '3 hours' then 60
      when (pe.event_date + pe.start_time) < now() + interval '24 hours' then 30
      else 10
    end)
    + (case when v.spots_remaining <= 2 then 20 else 0 end),
    least((pe.event_date + pe.start_time)::timestamptz, now() + interval '6 hours')
  from public.play_events pe
  cross join lateral (
    select pe.max_players - count(pp.id) as spots_remaining
    from public.play_participants pp
    where pp.event_id = pe.id
  ) v
  where pe.status = 'open'
    and (pe.event_date + pe.start_time) between now() and now() + interval '48 hours'
    and v.spots_remaining > 0
    and v.spots_remaining <= 2
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do update set
    title = excluded.title,
    slides = excluded.slides,
    priority_score = excluded.priority_score,
    expires_at = excluded.expires_at;

  -- ── Partner stories ──────────────────────────────────────────────────────
  -- Shared skill-band rows, not per-user: one card per non-empty 0.5-DUPR
  -- band among actively-looking players. The client picks whichever band is
  -- closest to the viewer's own rating — no per-user generation.
  delete from public.dynamic_stories where story_type = 'partner';

  insert into public.dynamic_stories (
    story_type, title, subtitle, slides, cta_label, cta_route,
    source_type, source_id, priority_score, expires_at
  )
  select
    'partner',
    'Players near your level',
    'Partner Finder',
    jsonb_build_array(
      jsonb_build_object(
        'headline', 'We found players who match your game',
        'subheadline', band.player_count || ' player' || (case when band.player_count = 1 then '' else 's' end) || ' near ' || band.band_label
      ),
      jsonb_build_object(
        'headline', 'Actively looking for a partner right now',
        'body', 'Near your area'
      )
    ),
    'View Matches',
    '/finder',
    null,
    null,
    20,
    now() + interval '12 hours'
  from (
    select
      round(coalesce(p.dupr, nullif(p.self_rating, '')::numeric) * 2) / 2 as band_value,
      round(coalesce(p.dupr, nullif(p.self_rating, '')::numeric) * 2) / 2 || ' DUPR' as band_label,
      count(*) as player_count
    from public.profiles p
    join public.partner_preferences pp on pp.user_id = p.id
    where pp.actively_looking = true
      and (p.dupr is not null or p.self_rating ~ '^[0-9]+(\.[0-9]+)?$')
    group by 1, 2
    having count(*) >= 2
  ) band;
end;
$$;

revoke execute on function public.generate_dynamic_stories() from public, anon, authenticated;

select cron.schedule(
  'generate-dynamic-stories',
  '*/15 * * * *',
  $$select public.generate_dynamic_stories();$$
);
