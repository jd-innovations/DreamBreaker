-- PAR for Quick Games (play_events.event_type = 'open_play').
--
-- Owner decisions, 2026-09-28:
--   * Organized games may use the same PAR formula as Log a Session.
--   * Roll out to Quick Games first; round robins, mini tournaments and
--     tournaments come later.
--   * A Quick Game is rated when it is finished: the organizer's "Finish & rate"
--     (the existing completePlayEvent status update), or automatically 24 hours
--     after it ends if it has scores.
--   * Guests (roster entries with no account) are rated as an estimate from
--     their self-rating, like Log a Session guests. Only registered players'
--     PAR moves.
--   * Finishing locks the scores. Reopen reverses that Quick Game's PAR changes;
--     finishing again re-rates it. Later games are not recalculated.
--
-- Deliberately NOT applied: supabase/migrations_pending/20260725010000 and
-- 20260725011000. Their replay engine re-rates all history synchronously on
-- every score write, and their bracket triggers would fire on court automation.
-- This migration reuses their rating core in a narrower form.
--
-- The PAR formula is unchanged: same Elo expectation, margin multiplier,
-- confidence bands and caps as process_personal_game_par, and the same
-- verification levels (participant_verified, or estimated with guests).

-- =============================================================================
-- 1. Let PAR rows reference a source other than personal_games.
-- =============================================================================

alter table public.par_game_processing
  drop constraint if exists par_game_processing_game_id_fkey,
  drop constraint if exists par_game_processing_session_id_fkey;
alter table public.par_rating_events
  drop constraint if exists par_rating_events_game_id_fkey,
  drop constraint if exists par_rating_events_session_id_fkey;
alter table public.player_par_profiles
  drop constraint if exists player_par_profiles_last_processed_game_id_fkey;

alter table public.par_game_processing
  add column if not exists source_type text not null default 'personal';
alter table public.par_rating_events
  add column if not exists source_type text not null default 'personal';

alter table public.par_game_processing
  drop constraint if exists par_game_processing_source_type,
  add constraint par_game_processing_source_type check (source_type in ('personal', 'play_match'));
alter table public.par_rating_events
  drop constraint if exists par_rating_events_source_type,
  add constraint par_rating_events_source_type check (source_type in ('personal', 'play_match'));

comment on column public.par_rating_events.source_type is
  'personal: game_id -> personal_games, session_id -> personal_sessions. play_match: game_id -> play_matches, session_id -> play_events.';

drop index if exists public.uq_par_rating_events_active_player_game;
create unique index uq_par_rating_events_active_player_game
  on public.par_rating_events (profile_id, source_type, game_id)
  where event_type = 'game_processed' and reversed_at is null;
create index if not exists idx_par_rating_events_source
  on public.par_rating_events (source_type, game_id);

-- The dropped FKs cascaded personal_games deletes into the PAR tables. Keep that
-- behaviour for personal rows. (The app never deletes personal games today.)
create or replace function public.fn_personal_games_par_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.par_rating_events set reversal_event_id = null
   where source_type = 'personal' and game_id = old.id;
  delete from public.par_rating_events where source_type = 'personal' and game_id = old.id;
  delete from public.par_game_processing where source_type = 'personal' and game_id = old.id;
  update public.player_par_profiles set last_processed_game_id = null where last_processed_game_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_personal_games_par_cleanup on public.personal_games;
create trigger trg_personal_games_par_cleanup
  after delete on public.personal_games
  for each row execute function public.fn_personal_games_par_cleanup();

-- =============================================================================
-- 2. Rate one Quick Game game.
-- =============================================================================

-- A guest's estimated PAR: their self-rating when it is a number (clamped to the
-- PAR range), otherwise the Log a Session guest estimate anchored on the organizer.
create or replace function public.par_play_guest_estimate(p_self_rating text, p_anchor numeric, p_config jsonb)
returns numeric language plpgsql stable set search_path = public as $$
declare
  v_min numeric := coalesce((p_config->>'rating_min')::numeric, 1.0);
  v_max numeric := coalesce((p_config->>'rating_max')::numeric, 6.0);
begin
  if btrim(coalesce(p_self_rating, '')) ~ '^[0-9]+(\.[0-9]+)?$' then
    return round(public.par_clamp(btrim(p_self_rating)::numeric, v_min, v_max), 4);
  end if;
  return public.par_guest_estimated_rating(p_self_rating, p_anchor, p_config);
end;
$$;

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
  v_t1 integer; v_t2 integer; v_claimed integer; v_present integer; v_distinct integer;
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
         count(distinct p.claimed_by)
    into v_t1, v_t2, v_claimed, v_present, v_distinct
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

create or replace function public.process_play_match_par(p_match_id uuid)
returns setof public.par_rating_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.play_matches;
  v_event public.play_events;
  v_proc public.par_game_processing;
  v_algo public.par_algorithm_versions;
  v_config jsonb;
  v_min numeric; v_max numeric; v_base_k numeric; v_elo_divisor numeric;
  v_verification text; v_verification_weight numeric; v_confidence_gain numeric;
  v_margin integer; v_margin_category text; v_margin_multiplier numeric;
  v_anchor numeric;
  v_strength numeric;
  v_roster jsonb := '[]'::jsonb;
  v_team1_avg numeric; v_team2_avg numeric; v_team_avg numeric; v_opp_avg numeric; v_partner_avg numeric;
  v_p record;
  v_profile public.player_par_profiles;
  v_actual numeric; v_expected numeric; v_band text;
  v_conf_mult numeric; v_cap numeric; v_delta numeric; v_after numeric; v_conf_after numeric;
  v_explanation text;
begin
  if exists (select 1 from public.par_game_processing p where p.game_id = p_match_id and p.status = 'processed') then
    return query select * from public.par_rating_events e
      where e.source_type = 'play_match' and e.game_id = p_match_id
        and e.event_type = 'game_processed' and e.reversed_at is null
      order by e.processed_at, e.profile_id;
    return;
  end if;

  v_proc := public.evaluate_play_match_par_eligibility(p_match_id);
  if v_proc.status <> 'eligible' then return; end if;

  perform 1 from public.par_game_processing p where p.game_id = p_match_id for update;
  update public.par_game_processing p
     set status = 'processing', error_message = null, last_evaluated_at = now()
   where p.game_id = p_match_id;

  select * into v_match from public.play_matches m where m.id = p_match_id;
  select * into v_event from public.play_events e where e.id = v_match.event_id;
  select * into v_algo from public.par_algorithm_versions a where a.is_active order by a.activated_at desc nulls last limit 1;
  v_config := v_algo.configuration;
  v_min := coalesce((v_config->>'rating_min')::numeric, 1.0);
  v_max := coalesce((v_config->>'rating_max')::numeric, 6.0);
  v_base_k := coalesce((v_config->>'base_k')::numeric, 0.12);
  v_elo_divisor := greatest(coalesce((v_config->>'elo_divisor')::numeric, 1.0), 0.01);
  v_verification := v_proc.verification_level;
  v_verification_weight := coalesce((v_config->'verification_weight'->>v_verification)::numeric, 0.75);
  v_confidence_gain := coalesce((v_config->'confidence_gain'->>v_verification)::numeric, 8.0);
  v_margin := abs(v_match.score_a - v_match.score_b);
  v_margin_category := public.par_score_margin_category(v_margin, v_config);
  v_margin_multiplier := public.par_score_margin_multiplier(v_margin_category, v_config);

  perform public.initialize_player_par_profile(v_event.organizer_id, v_algo.version);
  select prof.current_par into v_anchor from public.player_par_profiles prof where prof.profile_id = v_event.organizer_id;

  -- Roster: one entry per filled slot, with the strength used for team averages
  -- (a registered player's current PAR, or a guest's estimate).
  for v_p in
    select s.team, p.claimed_by as profile_id, p.self_rating
      from (select 1 as team, v_match.player_a_id as pp union all
            select 1, v_match.player_a2_id union all
            select 2, v_match.player_b_id union all
            select 2, v_match.player_b2_id) s
      join public.play_participants p on p.id = s.pp
     where s.pp is not null
  loop
    if v_p.profile_id is not null then
      perform public.initialize_player_par_profile(v_p.profile_id, v_algo.version);
      select prof.current_par into v_strength from public.player_par_profiles prof where prof.profile_id = v_p.profile_id;
    else
      v_strength := public.par_play_guest_estimate(v_p.self_rating, v_anchor, v_config);
    end if;
    v_roster := v_roster || jsonb_build_array(jsonb_build_object(
      'team', v_p.team, 'profile_id', v_p.profile_id, 'strength', v_strength));
  end loop;

  select avg((r->>'strength')::numeric) into v_team1_avg from jsonb_array_elements(v_roster) r where (r->>'team')::integer = 1;
  select avg((r->>'strength')::numeric) into v_team2_avg from jsonb_array_elements(v_roster) r where (r->>'team')::integer = 2;

  for v_p in
    select (r->>'team')::integer as team, (r->>'profile_id')::uuid as profile_id
      from jsonb_array_elements(v_roster) r
     where r->>'profile_id' is not null
     order by 1, 2
  loop
    select * into v_profile from public.player_par_profiles prof where prof.profile_id = v_p.profile_id for update;

    v_team_avg := case when v_p.team = 1 then v_team1_avg else v_team2_avg end;
    v_opp_avg  := case when v_p.team = 1 then v_team2_avg else v_team1_avg end;
    v_actual   := case when v_match.winner = v_p.team then 1 else 0 end;
    v_expected := round((1.0 / (1.0 + power(10.0, ((v_opp_avg - v_team_avg) / v_elo_divisor))))::numeric, 4);
    v_band := public.par_confidence_band(v_profile.confidence_score);
    v_conf_mult := coalesce((v_config->'confidence_multipliers'->>v_band)::numeric, 1.0);
    v_cap := coalesce((v_config->'movement_caps'->>v_band)::numeric, 0.12);
    v_delta := round(public.par_clamp(v_base_k * (v_actual - v_expected) * v_margin_multiplier * v_verification_weight * v_conf_mult, -v_cap, v_cap), 4);
    v_after := round(public.par_clamp(v_profile.current_par + v_delta, v_min, v_max), 4);
    v_conf_after := round(public.par_clamp(v_profile.confidence_score + v_confidence_gain, 0, 100), 2);
    v_explanation := public.par_explanation_code(v_actual, v_expected, v_margin_category);

    select avg((r->>'strength')::numeric) into v_partner_avg
      from jsonb_array_elements(v_roster) r
     where (r->>'team')::integer = v_p.team
       and (r->>'profile_id') is distinct from v_p.profile_id::text;

    insert into public.par_rating_events (
      profile_id, source_type, session_id, game_id, event_type,
      par_before, par_after, par_change,
      confidence_before, confidence_after, confidence_change,
      expected_result, actual_result, score_margin,
      opponent_strength, partner_strength, verification_level, weight,
      explanation_code, explanation_data, algorithm_version
    ) values (
      v_p.profile_id, 'play_match', v_event.id, p_match_id, 'game_processed',
      v_profile.current_par, v_after, v_after - v_profile.current_par,
      v_profile.confidence_score, v_conf_after, v_conf_after - v_profile.confidence_score,
      v_expected, v_actual, v_margin,
      round(v_opp_avg, 4), round(v_partner_avg, 4), v_verification, v_verification_weight,
      v_explanation,
      jsonb_build_object(
        'result', case when v_actual = 1 then 'win' else 'loss' end,
        'sourceType', 'play_match',
        'expectedResult', v_expected,
        'opponentRating', round(v_opp_avg, 4),
        'partnerRating', round(v_partner_avg, 4),
        'scoreMarginCategory', v_margin_category,
        'confidenceBand', v_band,
        'verificationLevel', v_verification,
        'verificationWeight', v_verification_weight,
        'movementCap', v_cap,
        'scoreMarginMultiplier', v_margin_multiplier,
        'primaryReason', v_explanation,
        'algorithmVersion', v_algo.version
      ),
      v_algo.version
    );

    update public.player_par_profiles prof
       set current_par = v_after,
           confidence_score = v_conf_after,
           confidence_band = public.par_confidence_band(v_conf_after),
           eligible_games_count = prof.eligible_games_count + 1,
           last_processed_game_id = p_match_id,
           last_rated_at = now(),
           algorithm_version = v_algo.version
     where prof.profile_id = v_p.profile_id;
  end loop;

  update public.par_game_processing p
     set status = 'processed', verification_level = v_verification, algorithm_version = v_algo.version,
         processed_at = now(), last_evaluated_at = now(), error_message = null
   where p.game_id = p_match_id;

  return query select * from public.par_rating_events e
    where e.source_type = 'play_match' and e.game_id = p_match_id
      and e.event_type = 'game_processed' and e.reversed_at is null
    order by e.processed_at, e.profile_id;
end;
$$;

-- Undo one game's PAR changes. Subtracts this game's change rather than
-- restoring par_before, so games rated after it keep their effect.
create or replace function public.reverse_play_match_par(p_match_id uuid, p_reason text default 'reopened')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.par_rating_events;
  v_reversal_id uuid;
  v_count integer := 0;
  v_min numeric := 1.0; v_max numeric := 6.0;
  v_before numeric; v_after numeric; v_conf_before numeric; v_conf_after numeric;
begin
  for v_event in
    select * from public.par_rating_events e
     where e.source_type = 'play_match' and e.game_id = p_match_id
       and e.event_type = 'game_processed' and e.reversed_at is null
     order by e.processed_at desc
     for update
  loop
    select prof.current_par, prof.confidence_score into v_before, v_conf_before
      from public.player_par_profiles prof where prof.profile_id = v_event.profile_id for update;
    v_after := round(public.par_clamp(v_before - v_event.par_change, v_min, v_max), 4);
    v_conf_after := round(public.par_clamp(v_conf_before - v_event.confidence_change, 0, 100), 2);

    update public.player_par_profiles prof
       set current_par = v_after,
           confidence_score = v_conf_after,
           confidence_band = public.par_confidence_band(v_conf_after),
           eligible_games_count = greatest(0, prof.eligible_games_count - 1),
           last_rated_at = now()
     where prof.profile_id = v_event.profile_id;

    insert into public.par_rating_events (
      profile_id, source_type, session_id, game_id, event_type,
      par_before, par_after, par_change,
      confidence_before, confidence_after, confidence_change,
      expected_result, actual_result, score_margin, opponent_strength, partner_strength,
      verification_level, weight, explanation_code, explanation_data, algorithm_version
    ) values (
      v_event.profile_id, 'play_match', v_event.session_id, v_event.game_id, 'reversal',
      v_before, v_after, v_after - v_before,
      v_conf_before, v_conf_after, v_conf_after - v_conf_before,
      v_event.expected_result, v_event.actual_result, v_event.score_margin, v_event.opponent_strength, v_event.partner_strength,
      v_event.verification_level, v_event.weight, 'reversal',
      jsonb_build_object('reason', coalesce(p_reason, 'reopened'), 'reversedEventId', v_event.id),
      v_event.algorithm_version
    ) returning id into v_reversal_id;

    update public.par_rating_events set reversed_at = now(), reversal_event_id = v_reversal_id where id = v_event.id;
    v_count := v_count + 1;
  end loop;

  update public.par_game_processing p
     set status = 'reversed', eligibility_reason = coalesce(p_reason, 'reopened'), last_evaluated_at = now()
   where p.game_id = p_match_id and p.source_type = 'play_match';

  return v_count;
end;
$$;

-- =============================================================================
-- 3. Finishing, locking and reopening a Quick Game.
-- =============================================================================

-- Rate every game when a Quick Game becomes completed, by any path (the app's
-- completePlayEvent, web's manage page, or the nightly auto-finish). A game that
-- fails is recorded as failed and does not stop the others or the finish.
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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_play_events_rate_on_finish on public.play_events;
create trigger trg_play_events_rate_on_finish
  after update of status on public.play_events
  for each row execute function public.fn_play_events_rate_on_finish();

-- A finished Quick Game can only leave 'completed' through reopen_quick_game(),
-- which reverses its PAR first.
create or replace function public.fn_play_events_guard_finished()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.event_type = 'open_play' and old.status = 'completed' and new.status is distinct from 'completed'
     and coalesce(current_setting('app.quick_game_reopen', true), '') <> 'on' then
    raise exception 'quick_game_finished'
      using errcode = 'P0001', hint = 'Reopen the Quick Game to change it.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_play_events_guard_finished on public.play_events;
create trigger trg_play_events_guard_finished
  before update of status on public.play_events
  for each row execute function public.fn_play_events_guard_finished();

-- Scores of a finished Quick Game are locked.
create or replace function public.fn_play_matches_lock_finished()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
begin
  if exists (select 1 from public.play_events e
              where e.id = v_event_id and e.event_type = 'open_play' and e.status = 'completed') then
    raise exception 'quick_game_finished'
      using errcode = 'P0001', hint = 'Reopen the Quick Game to change its scores.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_play_matches_lock_finished on public.play_matches;
create trigger trg_play_matches_lock_finished
  before insert or update or delete on public.play_matches
  for each row execute function public.fn_play_matches_lock_finished();

-- Deleting a whole event cascades past the lock (the event row is gone). Undo
-- any PAR its games had moved.
create or replace function public.fn_play_matches_reverse_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.par_rating_events e
              where e.source_type = 'play_match' and e.game_id = old.id
                and e.event_type = 'game_processed' and e.reversed_at is null) then
    perform public.reverse_play_match_par(old.id, 'game_deleted');
  end if;
  return old;
end;
$$;

drop trigger if exists trg_play_matches_reverse_on_delete on public.play_matches;
create trigger trg_play_matches_reverse_on_delete
  after delete on public.play_matches
  for each row execute function public.fn_play_matches_reverse_on_delete();

create or replace function public.reopen_quick_game(p_event_id uuid)
returns public.play_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.play_events;
  v_m record;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_event from public.play_events e where e.id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if v_event.organizer_id <> auth.uid() and not public.is_admin() then
    raise exception 'not_organizer' using errcode = 'P0001';
  end if;
  if v_event.event_type <> 'open_play' then raise exception 'not_quick_game' using errcode = 'P0001'; end if;
  if v_event.status <> 'completed' then raise exception 'not_finished' using errcode = 'P0001'; end if;

  for v_m in select id from public.play_matches where event_id = p_event_id loop
    perform public.reverse_play_match_par(v_m.id, 'reopened');
  end loop;

  select count(*) into v_count from public.play_participants where event_id = p_event_id;
  perform set_config('app.quick_game_reopen', 'on', true);
  update public.play_events
     set status = case when v_count >= max_players then 'full'::public.play_event_status else 'open'::public.play_event_status end
   where id = p_event_id
   returning * into v_event;
  perform set_config('app.quick_game_reopen', '', true);

  return v_event;
end;
$$;

comment on function public.reopen_quick_game(uuid) is
  'Organizer or admin: reverse a finished Quick Game''s PAR changes and return it to open (or full), unlocking its scores.';

revoke all on function public.reopen_quick_game(uuid) from public, anon;
grant execute on function public.reopen_quick_game(uuid) to authenticated;

-- =============================================================================
-- 4. Nightly auto-finish: Quick Games with scores, 24 hours after they end.
-- =============================================================================

create or replace function public.auto_finish_quick_games()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e record;
  v_done integer := 0;
begin
  for v_e in
    select e.id from public.play_events e
     where e.event_type = 'open_play'
       and e.status in ('open', 'full', 'in_progress')
       and (e.event_date + coalesce(e.start_time, time '00:00'))
           + make_interval(mins => coalesce(e.duration_minutes, 120)) + interval '24 hours' < now() at time zone 'utc'
       and exists (select 1 from public.play_matches m where m.event_id = e.id and m.winner is not null)
  loop
    begin
      update public.play_events set status = 'completed' where id = v_e.id;
      v_done := v_done + 1;
    exception when others then
      raise warning 'auto_finish_quick_games: % failed: %', v_e.id, sqlerrm;
    end;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.auto_finish_quick_games() from public, anon, authenticated;

select cron.schedule('auto-finish-quick-games', '40 * * * *',
                     $$select public.auto_finish_quick_games();$$);

-- =============================================================================
-- 5. Housekeeping.
-- =============================================================================

revoke all on function public.evaluate_play_match_par_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.process_play_match_par(uuid) from public, anon, authenticated;
revoke all on function public.reverse_play_match_par(uuid, text) from public, anon, authenticated;
revoke all on function public.par_play_guest_estimate(text, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.fn_personal_games_par_cleanup() from public, anon, authenticated;
revoke all on function public.fn_play_events_rate_on_finish() from public, anon, authenticated;
revoke all on function public.fn_play_events_guard_finished() from public, anon, authenticated;
revoke all on function public.fn_play_matches_lock_finished() from public, anon, authenticated;
revoke all on function public.fn_play_matches_reverse_on_delete() from public, anon, authenticated;
