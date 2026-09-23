-- "Your PAR changed" — batched per settled run, not per rating event.
--
-- ── Why not a trigger on par_rating_events ──────────────────────────────────
-- One session produces SEVERAL events (one per eligible game), each with its
-- own par_before/par_after. A trigger would fire per game, announce an
-- intermediate number that is stale by the next row, and send three or four
-- notifications for one evening of play. This job waits for the dust to
-- settle, then reports the CURRENT rating from player_par_profiles and the net
-- movement across everything since the player was last told.
--
-- ── It reports, it never computes ───────────────────────────────────────────
-- Every number is read: current_par from the profile, par_change summed from
-- events the rating engine already wrote. No PAR maths is implemented or
-- implied — the algorithm is specified elsewhere and is not approved for
-- reimplementation (AGENTS.md).
--
-- ── Reversals ───────────────────────────────────────────────────────────────
-- Events with reversed_at set are excluded: that change was undone, and
-- including it would describe a movement that never happened.
--
-- Timing knobs: settle_minutes (how long after the last event to wait),
-- min_change (movement too small to be worth saying), lookback_days.
--
-- Dry runs against real rows: two settled events one session produced a single
-- "Your PAR is now 3.42 — Up 0.12 after your last 2 games"; a rerun wrote
-- nothing; an event five minutes old was correctly too fresh; an all-reversed
-- set produced nothing; a drop rendered "Down 0.22 after your last 1 game".

update public.notification_automations set
  title_template = 'Your PAR is now {{rating}}',
  body_template  = '{{direction}} {{change}} after your last {{games}}.',
  link_template  = '/stats',
  timing = '{"settle_minutes": 45, "min_change": 0.05, "lookback_days": 14}'::jsonb,
  description = 'Tells a player their PAR moved, once the session has settled — batched across all events since they were last told, reporting the current rating and the net change. Reads the rating engine''s numbers; computes nothing.',
  wired = true
where key = 'rating_changed';

create or replace function public.send_rating_changed()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a          public.notification_automations%rowtype;
  v_settle   integer;
  v_min      numeric;
  v_lookback integer;
  r          record;
  v_copy     record;
  v_count    integer := 0;
begin
  select * into a from public.notification_automations where key = 'rating_changed';
  if not found or not a.enabled then
    return 0;
  end if;

  v_settle   := coalesce((a.timing ->> 'settle_minutes')::int, 45);
  v_min      := coalesce((a.timing ->> 'min_change')::numeric, 0.05);
  v_lookback := coalesce((a.timing ->> 'lookback_days')::int, 14);

  for r in
    with told as (
      -- When each player was last told, so a batch never counts twice.
      select n.user_id, max(n.created_at) at
        from public.notifications n
       where n.type = 'rating_changed'
       group by n.user_id
    ),
    fresh as (
      select e.profile_id,
             sum(e.par_change) net,
             count(*) games,
             max(e.created_at) last_event_at,
             (array_agg(e.id order by e.created_at desc))[1] last_event_id
        from public.par_rating_events e
        left join told t on t.user_id = e.profile_id
       where e.reversed_at is null
         and e.par_change is not null
         and e.created_at > coalesce(t.at, now() - make_interval(days => v_lookback))
         and e.created_at > now() - make_interval(days => v_lookback)
       group by e.profile_id
    )
    select f.profile_id, f.net, f.games, f.last_event_id, p.current_par
      from fresh f
      join public.player_par_profiles p on p.profile_id = f.profile_id
      join public.profiles pr on pr.id = f.profile_id
     where abs(f.net) >= v_min
       -- Settled: nothing new for a while, so the number will not move again a
       -- minute after we announce it.
       and f.last_event_at <= now() - make_interval(mins => v_settle)
       and pr.deleted_at is null
       and not exists (
         select 1 from public.notifications n
          where n.idempotency_key = 'rating-changed/' || f.profile_id || '/' || f.last_event_id
       )
  loop
    if private.automation_push_blocked_reason(r.profile_id, 'rating_changed')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('rating_changed', jsonb_build_object(
      'rating',    to_char(r.current_par, 'FM990.00'),
      'direction', case when r.net > 0 then 'Up' else 'Down' end,
      'change',    to_char(abs(r.net), 'FM990.00'),
      'games',     r.games || case when r.games = 1 then ' game' else ' games' end
    ));

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (r.profile_id, 'rating_changed',
            coalesce(v_copy.title, 'Your PAR changed'),
            coalesce(v_copy.body, 'Tap to see your rating.'),
            coalesce(v_copy.link, '/stats'),
            'rating-changed/' || r.profile_id || '/' || r.last_event_id)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_rating_changed() from public, anon, authenticated;

select cron.schedule('rating-changed', '10 * * * *',
                     $$select public.send_rating_changed();$$);
