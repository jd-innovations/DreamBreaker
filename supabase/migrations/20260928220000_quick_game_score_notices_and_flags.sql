-- Quick Game scores: tell the players, let them flag a wrong one, and don't
-- rate games nobody else could check. Owner decisions, 2026-09-28:
--
-- 1. "Scores are in": when a Quick Game is finished, each registered player
--    who played (except the organizer) gets one notification with their record.
--    Finishing again after a reopen says "Scores were updated", so an edit after
--    the fact is never silent.
-- 2. Flags: a registered player in a finished game can flag it. The game's PAR
--    changes are reversed for everyone and it stays out of PAR while any flag
--    is open. The organizer cannot overrule a flag: it clears only when the
--    flagger withdraws it or the organizer changes that game's score (reopen,
--    edit, finish). The organizer is notified of each flag.
-- 3. A game counts toward PAR only if at least one registered player other than
--    the organizer played in it. An organizer beating invented guests is still
--    recorded and shown, but no one could dispute it, so it isn't rated.
--
-- Builds on 20260928210000_par_quick_games. Notifications go through the
-- existing catalog: inserting a notifications row whose type is an enabled
-- automation key is what dispatches the push (fn_dispatch_automation_push),
-- honouring prefs, quiet hours and caps. Links use /community/{id}, which the
-- deep-link resolver in the installed binary already accepts.

-- =============================================================================
-- 1. Catalog entries.
-- =============================================================================

insert into public.notification_automations
  (key, name, description, category, pref_column, channels, title_template, body_template, link_template, timing, throttle_hours, sort_order, enabled, wired)
values
  ('quick_game_scores', 'Quick Game scores are in',
   'Sent once to each registered player who played when a Quick Game is finished (by the organizer or the auto-finish). A repeat finish after a reopen says the scores were updated.',
   'social', null, array['push', 'in_app'],
   '{{headline}}', '{{event_name}}: you went {{record}} across {{games}}.', '/community/{{event_id}}',
   '{}'::jsonb, null, 154, true, true),
  ('quick_game_score_flagged', 'A Quick Game score was flagged',
   'Tells the organizer that a player flagged one of the games they recorded. The game is out of PAR until the score is corrected or the flag is withdrawn.',
   'social', null, array['push', 'in_app'],
   'A score was flagged', '{{flagger_name}} flagged Game {{game_number}} in {{event_name}}. Reopen it to correct the score.', '/community/{{event_id}}',
   '{}'::jsonb, null, 155, true, true)
on conflict (key) do nothing;

-- =============================================================================
-- 2. Flags.
-- =============================================================================

create table if not exists public.play_match_score_flags (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.play_matches(id) on delete cascade,
  event_id    uuid not null references public.play_events(id) on delete cascade,
  flagged_by  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'open',
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  constraint play_match_score_flags_status check (status in ('open', 'withdrawn', 'resolved'))
);

comment on table public.play_match_score_flags is
  'A player''s dispute of one recorded Quick Game score. open = the game is out of PAR. withdrawn = the flagger took it back. resolved = the organizer changed that game''s score. Written only by flag_quick_game_score / withdraw_quick_game_flag / the resolve trigger.';

create unique index if not exists uq_play_match_score_flags_open
  on public.play_match_score_flags (match_id, flagged_by) where status = 'open';
create index if not exists idx_play_match_score_flags_event
  on public.play_match_score_flags (event_id);

-- Organizer, admin, or any registered player on the event's roster.
create or replace function public.is_play_event_member(p_event_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user_id is not null and (
    exists (select 1 from public.play_events e where e.id = p_event_id and e.organizer_id = p_user_id)
    or exists (select 1 from public.play_participants p where p.event_id = p_event_id and p.claimed_by = p_user_id)
  );
$$;

alter table public.play_match_score_flags enable row level security;

drop policy if exists "play_match_score_flags: event members read" on public.play_match_score_flags;
create policy "play_match_score_flags: event members read"
  on public.play_match_score_flags for select to authenticated
  using (public.is_play_event_member(event_id, (select auth.uid())) or public.is_admin());

revoke all on public.play_match_score_flags from anon;
revoke insert, update, delete, truncate on public.play_match_score_flags from authenticated;
grant select on public.play_match_score_flags to authenticated;

-- =============================================================================
-- 3. Eligibility: disputed games and organizer-only games are not rated.
--    Same function as 20260928210000 with two new exclusions.
-- =============================================================================

create or replace function public.evaluate_play_match_par_eligibility(p_match_id uuid)
returns public.par_game_processing
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.play_matches;
  v_event public.play_events;
  v_algo public.par_algorithm_versions;
  v_status text := 'eligible';
  v_reason text := null;
  v_verification text := 'participant_verified';
  v_t1 integer; v_t2 integer; v_claimed integer; v_present integer; v_distinct integer; v_others integer;
  v_out public.par_game_processing;
begin
  select * into v_algo from public.par_algorithm_versions a where a.is_active order by a.activated_at desc nulls last limit 1;
  select * into v_match from public.play_matches m where m.id = p_match_id;
  if not found then raise exception 'match_not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.play_events e where e.id = v_match.event_id;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;

  with slots as (
    select 1 as team, v_match.player_a_id as pp union all
    select 1, v_match.player_a2_id union all
    select 2, v_match.player_b_id union all
    select 2, v_match.player_b2_id
  )
  select count(*) filter (where s.team = 1),
         count(*) filter (where s.team = 2),
         count(p.claimed_by),
         count(*),
         count(distinct p.claimed_by),
         count(*) filter (where p.claimed_by is not null and p.claimed_by <> v_event.organizer_id)
    into v_t1, v_t2, v_claimed, v_present, v_distinct, v_others
    from slots s join public.play_participants p on p.id = s.pp
   where s.pp is not null;

  if v_event.event_type <> 'open_play' then
    v_status := 'excluded'; v_reason := 'source_not_enabled'; v_verification := 'excluded';
  elsif v_event.status <> 'completed' then
    v_status := 'pending'; v_reason := 'event_not_completed'; v_verification := null;
  elsif v_match.score_a is null or v_match.score_b is null or v_match.score_a < 0 or v_match.score_b < 0 then
    v_status := 'excluded'; v_reason := 'invalid_score'; v_verification := 'excluded';
  elsif v_match.score_a = v_match.score_b then
    v_status := 'excluded'; v_reason := 'tied_score'; v_verification := 'excluded';
  elsif v_match.winner is null
     or v_match.winner <> (case when v_match.score_a > v_match.score_b then 1 else 2 end) then
    v_status := 'excluded'; v_reason := 'winner_mismatch'; v_verification := 'excluded';
  elsif v_t1 = 0 or v_t2 = 0 or v_t1 <> v_t2 then
    v_status := 'excluded'; v_reason := 'invalid_team_count'; v_verification := 'excluded';
  elsif v_claimed = 0 then
    v_status := 'excluded'; v_reason := 'no_registered_participants'; v_verification := 'excluded';
  elsif v_distinct < v_claimed then
    v_status := 'excluded'; v_reason := 'duplicate_participant'; v_verification := 'excluded';
  elsif v_others = 0 then
    v_status := 'excluded'; v_reason := 'no_other_registered_player'; v_verification := 'excluded';
  elsif exists (select 1 from public.play_match_score_flags f where f.match_id = p_match_id and f.status = 'open') then
    v_status := 'excluded'; v_reason := 'disputed'; v_verification := 'disputed';
  elsif v_claimed < v_present then
    v_status := 'eligible'; v_reason := 'guest_estimated'; v_verification := 'estimated';
  end if;

  insert into public.par_game_processing (
    game_id, source_type, session_id, status, eligibility_reason, verification_level,
    algorithm_version, processed_at, last_evaluated_at, error_message
  ) values (
    p_match_id, 'play_match', v_match.event_id, v_status, v_reason, v_verification,
    v_algo.version, null, now(), null
  )
  on conflict (game_id) do update set
    source_type = 'play_match',
    session_id = excluded.session_id,
    status = case when public.par_game_processing.status = 'processed' then public.par_game_processing.status else excluded.status end,
    eligibility_reason = excluded.eligibility_reason,
    verification_level = excluded.verification_level,
    algorithm_version = excluded.algorithm_version,
    processed_at = case when public.par_game_processing.status = 'processed' then public.par_game_processing.processed_at else null end,
    last_evaluated_at = now(),
    error_message = null
  returning * into v_out;

  return v_out;
end;
$$;

-- =============================================================================
-- 4. On finish: rate (unchanged), then tell the players.
-- =============================================================================

create or replace function public.notify_quick_game_scores(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.play_events;
  v_repeat boolean;
  v_r record;
  v_copy record;
  v_count integer := 0;
  v_stamp text := to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSUS');
begin
  if not exists (select 1 from public.notification_automations a where a.key = 'quick_game_scores' and a.enabled) then
    return 0;
  end if;
  select * into v_event from public.play_events e where e.id = p_event_id;
  if not found then return 0; end if;

  v_repeat := exists (select 1 from public.notifications n
                       where n.type = 'quick_game_scores'
                         and n.idempotency_key like 'qg-scores/' || p_event_id || '/%');

  for v_r in
    with slots as (
      select m.id, m.winner, 1 as side, m.player_a_id as pp from public.play_matches m where m.event_id = p_event_id and m.winner is not null
      union all select m.id, m.winner, 1, m.player_a2_id from public.play_matches m where m.event_id = p_event_id and m.winner is not null
      union all select m.id, m.winner, 2, m.player_b_id from public.play_matches m where m.event_id = p_event_id and m.winner is not null
      union all select m.id, m.winner, 2, m.player_b2_id from public.play_matches m where m.event_id = p_event_id and m.winner is not null
    )
    select p.claimed_by as user_id,
           count(distinct s.id) as games,
           count(distinct s.id) filter (where s.winner = s.side) as wins
      from slots s
      join public.play_participants p on p.id = s.pp
      join public.profiles pr on pr.id = p.claimed_by
     where p.claimed_by is not null
       and p.claimed_by <> v_event.organizer_id
       and pr.deleted_at is null
     group by p.claimed_by
  loop
    select * into v_copy from private.render_automation('quick_game_scores', jsonb_build_object(
      'headline',   case when v_repeat then 'Scores were updated' else 'Scores are in' end,
      'event_name', v_event.name,
      'record',     v_r.wins || '-' || (v_r.games - v_r.wins),
      'games',      v_r.games || case when v_r.games = 1 then ' game' else ' games' end,
      'event_id',   p_event_id
    ));

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (
      v_r.user_id, 'quick_game_scores',
      coalesce(v_copy.title, 'Scores are in'),
      coalesce(v_copy.body, v_event.name || ': you went ' || v_r.wins || '-' || (v_r.games - v_r.wins) || '.'),
      coalesce(v_copy.link, '/community/' || p_event_id),
      'qg-scores/' || p_event_id || '/' || v_stamp || '/' || v_r.user_id
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.fn_play_events_rate_on_finish()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_m record;
begin
  if new.event_type = 'open_play' and new.status = 'completed' and old.status is distinct from 'completed' then
    for v_m in
      select id from public.play_matches where event_id = new.id and winner is not null
       order by round, match_number nulls last, created_at
    loop
      begin
        perform public.process_play_match_par(v_m.id);
      exception when others then
        insert into public.par_game_processing (game_id, source_type, session_id, status, eligibility_reason, error_message, last_evaluated_at)
        values (v_m.id, 'play_match', new.id, 'failed', 'processing_failed', sqlerrm, now())
        on conflict (game_id) do update set
          status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
      end;
    end loop;

    -- A notification failure must never undo the finish or the ratings.
    begin
      perform public.notify_quick_game_scores(new.id);
    exception when others then
      raise warning 'notify_quick_game_scores(%) failed: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 5. Flag / withdraw, and resolving a flag by correcting the score.
-- =============================================================================

create or replace function public.flag_quick_game_score(p_match_id uuid)
returns public.play_match_score_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.play_matches;
  v_event public.play_events;
  v_flag public.play_match_score_flags;
  v_game_number integer;
  v_flagger text;
  v_copy record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_match from public.play_matches m where m.id = p_match_id;
  if not found then raise exception 'match_not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.play_events e where e.id = v_match.event_id for update;
  if v_event.event_type <> 'open_play' then raise exception 'not_quick_game' using errcode = 'P0001'; end if;
  if v_event.status <> 'completed' then raise exception 'not_finished' using errcode = 'P0001'; end if;
  if v_event.organizer_id = v_uid then raise exception 'organizer_should_reopen' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.play_participants p
     where p.claimed_by = v_uid
       and p.id in (v_match.player_a_id, v_match.player_a2_id, v_match.player_b_id, v_match.player_b2_id)
  ) then
    raise exception 'not_in_game' using errcode = 'P0001';
  end if;

  select * into v_flag from public.play_match_score_flags f
   where f.match_id = p_match_id and f.flagged_by = v_uid and f.status = 'open';
  if found then return v_flag; end if;

  insert into public.play_match_score_flags (match_id, event_id, flagged_by)
  values (p_match_id, v_match.event_id, v_uid)
  returning * into v_flag;

  -- Out of PAR for everyone while the flag is open.
  perform public.reverse_play_match_par(p_match_id, 'disputed');
  perform public.evaluate_play_match_par_eligibility(p_match_id);

  begin
    if exists (select 1 from public.notification_automations a where a.key = 'quick_game_score_flagged' and a.enabled) then
      select count(*) into v_game_number from public.play_matches m
       where m.event_id = v_match.event_id
         and (m.round, m.created_at) <= (v_match.round, v_match.created_at);
      select coalesce(nullif(btrim(pr.full_name), ''), 'A player') into v_flagger from public.profiles pr where pr.id = v_uid;
      select * into v_copy from private.render_automation('quick_game_score_flagged', jsonb_build_object(
        'flagger_name', coalesce(v_flagger, 'A player'),
        'game_number',  v_game_number,
        'event_name',   v_event.name,
        'event_id',     v_event.id
      ));
      insert into public.notifications (user_id, type, title, body, link, idempotency_key)
      values (
        v_event.organizer_id, 'quick_game_score_flagged',
        coalesce(v_copy.title, 'A score was flagged'),
        coalesce(v_copy.body, coalesce(v_flagger, 'A player') || ' flagged a game in ' || v_event.name || '.'),
        coalesce(v_copy.link, '/community/' || v_event.id),
        'qg-flag/' || v_flag.id
      )
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
  exception when others then
    raise warning 'quick_game_score_flagged notify failed for %: %', v_flag.id, sqlerrm;
  end;

  return v_flag;
end;
$$;

create or replace function public.withdraw_quick_game_flag(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.play_events;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select e.* into v_event from public.play_events e
    join public.play_matches m on m.event_id = e.id
   where m.id = p_match_id
   for update of e;
  if not found then raise exception 'match_not_found' using errcode = 'P0001'; end if;

  update public.play_match_score_flags
     set status = 'withdrawn', closed_at = now()
   where match_id = p_match_id and flagged_by = v_uid and status = 'open';
  if not found then raise exception 'no_open_flag' using errcode = 'P0001'; end if;

  -- Last open flag gone on a finished game: rate it again.
  if v_event.status = 'completed'
     and not exists (select 1 from public.play_match_score_flags f where f.match_id = p_match_id and f.status = 'open') then
    perform public.process_play_match_par(p_match_id);
  end if;
end;
$$;

-- Changing a game's score or players settles every open flag on it. The lock
-- trigger means this only happens while the Quick Game is reopened.
create or replace function public.fn_play_matches_resolve_flags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.score_a is distinct from new.score_a or old.score_b is distinct from new.score_b
     or old.winner is distinct from new.winner
     or old.player_a_id is distinct from new.player_a_id or old.player_a2_id is distinct from new.player_a2_id
     or old.player_b_id is distinct from new.player_b_id or old.player_b2_id is distinct from new.player_b2_id then
    update public.play_match_score_flags
       set status = 'resolved', closed_at = now()
     where match_id = new.id and status = 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_play_matches_resolve_flags on public.play_matches;
create trigger trg_play_matches_resolve_flags
  after update of score_a, score_b, winner, player_a_id, player_a2_id, player_b_id, player_b2_id
  on public.play_matches
  for each row execute function public.fn_play_matches_resolve_flags();

-- =============================================================================
-- 6. Grants.
-- =============================================================================

revoke all on function public.flag_quick_game_score(uuid) from public, anon;
grant execute on function public.flag_quick_game_score(uuid) to authenticated;
revoke all on function public.withdraw_quick_game_flag(uuid) from public, anon;
grant execute on function public.withdraw_quick_game_flag(uuid) to authenticated;
revoke all on function public.notify_quick_game_scores(uuid) from public, anon, authenticated;
revoke all on function public.fn_play_matches_resolve_flags() from public, anon, authenticated;
revoke all on function public.is_play_event_member(uuid, uuid) from public, anon;
grant execute on function public.is_play_event_member(uuid, uuid) to authenticated;
