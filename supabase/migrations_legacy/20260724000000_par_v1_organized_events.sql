-- PAR V1: organized-event scores must count toward PAR.
-- Extends the personal-game PAR engine (20260721070000_par_v1_foundation.sql) to
-- ingest organizer-submitted scores from:
--   * Community Play / round robins / mini tournaments -> public.play_matches
--   * Tournaments                                      -> public.bracket_matches
-- The proven personal engine is left untouched; this migration reuses its pure
-- helpers (par_clamp, par_confidence_band, par_score_margin_*, par_explanation_code,
-- initialize_player_par_profile) and adds a generalized organized-match path.
--
-- See docs/PAR_RATING_SPEC.md -> "Supported Rating Sources (V1)".

-- =============================================================================
-- 1. Generalize the ingestion tables so a rating references (source_type, game_id)
--    instead of being hard-bound to the personal tables.
-- =============================================================================

-- Drop the personal-only foreign keys that block organized rows. Columns remain
-- as plain uuids; the source_type column disambiguates which table game_id/session_id
-- point at. (Personal rows keep source_type='personal' and behave exactly as before.)
alter table public.par_game_processing
  drop constraint if exists par_game_processing_game_id_fkey,
  drop constraint if exists par_game_processing_session_id_fkey;

alter table public.par_rating_events
  drop constraint if exists par_rating_events_game_id_fkey,
  drop constraint if exists par_rating_events_session_id_fkey;

alter table public.player_par_profiles
  drop constraint if exists player_par_profiles_last_processed_game_id_fkey;

-- Source discriminator. Defaults to 'personal' so existing rows and the personal
-- engine's inserts (which omit the column) are unchanged.
alter table public.par_game_processing
  add column if not exists source_type text not null default 'personal';
alter table public.par_rating_events
  add column if not exists source_type text not null default 'personal';

alter table public.par_game_processing
  drop constraint if exists par_game_processing_source_type,
  add constraint par_game_processing_source_type
    check (source_type in ('personal','play_match','bracket_match'));
alter table public.par_rating_events
  drop constraint if exists par_rating_events_source_type,
  add constraint par_rating_events_source_type
    check (source_type in ('personal','play_match','bracket_match'));

-- Allow the 'organizer_verified' verification level for organizer-submitted organized scores.
alter table public.par_game_processing
  drop constraint if exists par_game_processing_verification,
  add constraint par_game_processing_verification
    check (verification_level is null or verification_level in ('organizer_verified','fully_verified','participant_verified','disputed','excluded'));
alter table public.par_rating_events
  drop constraint if exists par_rating_events_verification,
  add constraint par_rating_events_verification
    check (verification_level in ('organizer_verified','fully_verified','participant_verified','disputed','excluded'));

-- Make the active-rating uniqueness source-aware (defensive; uuids don't collide).
drop index if exists uq_par_rating_events_active_player_game;
create unique index if not exists uq_par_rating_events_active_player_game
  on public.par_rating_events(profile_id, source_type, game_id)
  where event_type = 'game_processed' and reversed_at is null;

create index if not exists idx_par_game_processing_source on public.par_game_processing(source_type, status);
create index if not exists idx_par_rating_events_source on public.par_rating_events(source_type, game_id);

-- Add 'organizer_verified' weighting to the active algorithm config (non-destructive merge).
-- Organizer-submitted scores are authoritative, so 'organizer_verified' mirrors 'fully_verified'.
update public.par_algorithm_versions
   set configuration = configuration
        || jsonb_build_object(
             'verification_weight',
             coalesce(configuration->'verification_weight','{}'::jsonb)
               || jsonb_build_object('organizer_verified', 1.0),
             'confidence_gain',
             coalesce(configuration->'confidence_gain','{}'::jsonb)
               || jsonb_build_object('organizer_verified', 12.0)
           ),
       updated_at = now()
 where is_active;

-- Is an arbitrary profile a platform admin? (is_admin() only checks the caller.)
create or replace function public.par_profile_is_admin(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'admin');
$$;

-- =============================================================================
-- 2. Shared core: rate one organized match from a normalized roster.
--    Roster is a jsonb array of {"profile_id": uuid, "team_number": 1|2}.
--    Mirrors the personal engine's math exactly (Elo expected, margin multiplier,
--    confidence band caps) but reads teams from the roster rather than personal
--    participant tables. Handles the processed-guard, locking, rating-event
--    inserts, profile updates, and processing-row finalization.
-- =============================================================================

create or replace function public.par_process_match_roster(
  p_source_type text,
  p_match_id uuid,
  p_event_id uuid,
  p_winner integer,
  p_margin integer,
  p_verification text,
  p_roster jsonb
)
returns setof public.par_rating_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_algo public.par_algorithm_versions;
  v_config jsonb;
  v_min numeric; v_max numeric; v_base_k numeric; v_elo_divisor numeric;
  v_verification_weight numeric; v_confidence_gain numeric;
  v_margin_category text; v_margin_multiplier numeric;
  v_team_one_avg numeric; v_team_two_avg numeric;
  v_participant record;
  v_profile public.player_par_profiles;
  v_team_avg numeric; v_opp_avg numeric; v_partner_avg numeric;
  v_actual numeric; v_expected numeric; v_band text;
  v_confidence_multiplier numeric; v_cap numeric; v_delta numeric;
  v_after numeric; v_conf_after numeric; v_explanation text;
begin
  -- Idempotent: if already processed, return the existing active events.
  if exists (select 1 from public.par_game_processing p
             where p.game_id = p_match_id and p.status = 'processed') then
    return query select * from public.par_rating_events e
      where e.game_id = p_match_id and e.event_type = 'game_processed' and e.reversed_at is null
      order by e.processed_at, e.profile_id;
    return;
  end if;

  select * into v_algo from public.par_algorithm_versions algo
    where algo.is_active order by algo.activated_at desc nulls last limit 1;
  if not found then raise exception 'par_algorithm_not_found' using errcode = 'P0001'; end if;
  v_config := v_algo.configuration;
  v_min := coalesce((v_config->>'rating_min')::numeric, 1.0);
  v_max := coalesce((v_config->>'rating_max')::numeric, 6.0);
  v_base_k := coalesce((v_config->>'base_k')::numeric, 0.12);
  v_elo_divisor := greatest(coalesce((v_config->>'elo_divisor')::numeric, 1.0), 0.01);
  v_verification_weight := coalesce((v_config->'verification_weight'->>p_verification)::numeric, 1.0);
  v_confidence_gain := coalesce((v_config->'confidence_gain'->>p_verification)::numeric, 12.0);
  v_margin_category := public.par_score_margin_category(greatest(p_margin, 0), v_config);
  v_margin_multiplier := public.par_score_margin_multiplier(v_margin_category, v_config);

  -- Lock the processing row (created by the eligibility evaluator).
  perform 1 from public.par_game_processing p where p.game_id = p_match_id for update;
  update public.par_game_processing p
     set status = 'processing', error_message = null, last_evaluated_at = now()
   where p.game_id = p_match_id;

  -- Ensure every rated player has a PAR profile.
  for v_participant in
    select distinct (r->>'profile_id')::uuid as profile_id
      from jsonb_array_elements(p_roster) r
  loop
    perform public.initialize_player_par_profile(v_participant.profile_id, v_algo.version);
  end loop;

  -- Team average PARs.
  select avg(prof.current_par) into v_team_one_avg
    from jsonb_array_elements(p_roster) r
    join public.player_par_profiles prof on prof.profile_id = (r->>'profile_id')::uuid
   where (r->>'team_number')::integer = 1;
  select avg(prof.current_par) into v_team_two_avg
    from jsonb_array_elements(p_roster) r
    join public.player_par_profiles prof on prof.profile_id = (r->>'profile_id')::uuid
   where (r->>'team_number')::integer = 2;

  if v_team_one_avg is null or v_team_two_avg is null then
    raise exception 'empty_team_roster' using errcode = 'P0001';
  end if;

  for v_participant in
    select (r->>'profile_id')::uuid as profile_id, (r->>'team_number')::integer as team_number
      from jsonb_array_elements(p_roster) r
     order by (r->>'team_number')::integer, (r->>'profile_id')
  loop
    select * into v_profile from public.player_par_profiles prof
      where prof.profile_id = v_participant.profile_id for update;

    v_team_avg := case when v_participant.team_number = 1 then v_team_one_avg else v_team_two_avg end;
    v_opp_avg  := case when v_participant.team_number = 1 then v_team_two_avg else v_team_one_avg end;
    v_actual   := case when p_winner = v_participant.team_number then 1 else 0 end;
    v_expected := round((1.0 / (1.0 + power(10.0, ((v_opp_avg - v_team_avg) / v_elo_divisor))))::numeric, 4);
    v_band := public.par_confidence_band(v_profile.confidence_score);
    v_confidence_multiplier := coalesce((v_config->'confidence_multipliers'->>v_band)::numeric, 1.0);
    v_cap := coalesce((v_config->'movement_caps'->>v_band)::numeric, 0.12);
    v_delta := round(public.par_clamp(v_base_k * (v_actual - v_expected) * v_margin_multiplier * v_verification_weight * v_confidence_multiplier, -v_cap, v_cap), 4);
    v_after := round(public.par_clamp(v_profile.current_par + v_delta, v_min, v_max), 4);
    v_conf_after := round(public.par_clamp(v_profile.confidence_score + v_confidence_gain, 0, 100), 2);
    v_explanation := public.par_explanation_code(v_actual, v_expected, v_margin_category);

    select avg(prof.current_par) into v_partner_avg
      from jsonb_array_elements(p_roster) r
      join public.player_par_profiles prof on prof.profile_id = (r->>'profile_id')::uuid
     where (r->>'team_number')::integer = v_participant.team_number
       and (r->>'profile_id')::uuid <> v_participant.profile_id;

    insert into public.par_rating_events (
      profile_id, source_type, session_id, game_id, event_type,
      par_before, par_after, par_change,
      confidence_before, confidence_after, confidence_change,
      expected_result, actual_result, score_margin,
      opponent_strength, partner_strength, verification_level, weight,
      explanation_code, explanation_data, algorithm_version
    ) values (
      v_participant.profile_id, p_source_type, p_event_id, p_match_id, 'game_processed',
      v_profile.current_par, v_after, v_after - v_profile.current_par,
      v_profile.confidence_score, v_conf_after, v_conf_after - v_profile.confidence_score,
      v_expected, v_actual, greatest(p_margin, 0),
      round(v_opp_avg, 4), round(v_partner_avg, 4), p_verification, v_verification_weight,
      v_explanation,
      jsonb_build_object(
        'result', case when v_actual = 1 then 'win' else 'loss' end,
        'sourceType', p_source_type,
        'expectedResult', v_expected,
        'opponentRating', round(v_opp_avg, 4),
        'partnerRating', round(v_partner_avg, 4),
        'scoreMarginCategory', v_margin_category,
        'confidenceBand', v_band,
        'verificationLevel', p_verification,
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
     where prof.profile_id = v_participant.profile_id;
  end loop;

  update public.par_game_processing p
     set status = 'processed', eligibility_reason = null, verification_level = p_verification,
         algorithm_version = v_algo.version, processed_at = now(), last_evaluated_at = now(), error_message = null
   where p.game_id = p_match_id;

  return query select * from public.par_rating_events e
    where e.game_id = p_match_id and e.event_type = 'game_processed' and e.reversed_at is null
    order by e.processed_at, e.profile_id;
exception when others then
  insert into public.par_game_processing (game_id, source_type, session_id, status, eligibility_reason, error_message, last_evaluated_at)
  values (p_match_id, p_source_type, p_event_id, 'failed', 'processing_failed', sqlerrm, now())
  on conflict (game_id) do update set
    status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
  raise;
end;
$$;

-- =============================================================================
-- 3. Community Play / round robin / mini tournament -> play_matches
--    Players reference play_participants; only claimed (registered) participants
--    qualify. Any present-but-unclaimed slot holds the match as pending_participant_claim.
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
  v_verification text := 'organizer_verified';
  v_present integer; v_claimed integer;
  v_team1_present integer; v_team2_present integer;
  v_team1_claimed integer; v_team2_claimed integer;
  v_distinct_profiles integer;
  v_out public.par_game_processing;
begin
  select * into v_algo from public.par_algorithm_versions algo
    where algo.is_active order by algo.activated_at desc nulls last limit 1;
  select * into v_match from public.play_matches m where m.id = p_match_id;
  if not found then raise exception 'match_not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.play_events e where e.id = v_match.event_id;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;

  if v_event.status <> 'completed' then
    v_status := 'pending'; v_reason := 'event_not_completed'; v_verification := null;
  elsif v_match.score_a is null or v_match.score_b is null or v_match.score_a < 0 or v_match.score_b < 0 then
    v_status := 'excluded'; v_reason := 'invalid_score'; v_verification := 'excluded';
  elsif v_match.score_a = v_match.score_b then
    v_status := 'excluded'; v_reason := 'tied_score'; v_verification := 'excluded';
  elsif v_match.winner is null or v_match.winner not in (1,2)
     or v_match.winner <> (case when v_match.score_a > v_match.score_b then 1 else 2 end) then
    v_status := 'excluded'; v_reason := 'winner_mismatch'; v_verification := 'excluded';
  else
    -- Resolve claimed profiles per team from the four participant slots.
    with slots as (
      select 1 as team, v_match.player_a_id  as pp union all
      select 1,          v_match.player_a2_id        union all
      select 2,          v_match.player_b_id         union all
      select 2,          v_match.player_b2_id
    ),
    resolved as (
      select s.team, pp.claimed_by as profile_id
        from slots s join public.play_participants pp on pp.id = s.pp
       where s.pp is not null
    )
    select
      count(*) filter (where team = 1),
      count(*) filter (where team = 2),
      count(*) filter (where team = 1 and profile_id is not null),
      count(*) filter (where team = 2 and profile_id is not null),
      count(*),
      count(*) filter (where profile_id is not null)
    into v_team1_present, v_team2_present, v_team1_claimed, v_team2_claimed, v_present, v_claimed
    from resolved;

    if v_team1_present = 0 or v_team2_present = 0 then
      v_status := 'excluded'; v_reason := 'invalid_team_count'; v_verification := 'excluded';
    elsif v_claimed < v_present then
      -- At least one participant hasn't claimed a DreamBreaker account yet.
      v_status := 'pending_participant_claim'; v_reason := 'waiting_for_participant_claim'; v_verification := null;
    else
      select count(distinct profile_id) into v_distinct_profiles
        from (
          select pp.claimed_by as profile_id
            from (select v_match.player_a_id as pp union all
                  select v_match.player_a2_id union all
                  select v_match.player_b_id union all
                  select v_match.player_b2_id) s
            join public.play_participants pp on pp.id = s.pp
           where s.pp is not null
        ) q;
      if v_distinct_profiles < (v_present) then
        v_status := 'excluded'; v_reason := 'duplicate_participant'; v_verification := 'excluded';
      end if;
    end if;
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
    status = case when public.par_game_processing.status = 'processed' and excluded.status = 'eligible' then public.par_game_processing.status else excluded.status end,
    eligibility_reason = excluded.eligibility_reason,
    verification_level = excluded.verification_level,
    algorithm_version = excluded.algorithm_version,
    processed_at = case when public.par_game_processing.status = 'processed' and excluded.status = 'eligible' then public.par_game_processing.processed_at else null end,
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
  v_proc public.par_game_processing;
  v_winner integer;
  v_margin integer;
  v_roster jsonb;
begin
  select * into v_match from public.play_matches m where m.id = p_match_id;
  if not found then raise exception 'match_not_found' using errcode = 'P0001'; end if;

  if exists (select 1 from public.par_game_processing p where p.game_id = p_match_id and p.status = 'processed') then
    return query select * from public.par_rating_events e
      where e.game_id = p_match_id and e.event_type = 'game_processed' and e.reversed_at is null
      order by e.processed_at, e.profile_id;
    return;
  end if;

  v_proc := public.evaluate_play_match_par_eligibility(p_match_id);
  if v_proc.status <> 'eligible' then return; end if;

  v_winner := v_match.winner;
  v_margin := abs(coalesce(v_match.score_a,0) - coalesce(v_match.score_b,0));

  select jsonb_agg(jsonb_build_object('profile_id', profile_id, 'team_number', team))
    into v_roster
  from (
    select s.team, pp.claimed_by as profile_id
      from (select 1 as team, v_match.player_a_id as pp union all
            select 1, v_match.player_a2_id union all
            select 2, v_match.player_b_id union all
            select 2, v_match.player_b2_id) s
      join public.play_participants pp on pp.id = s.pp
     where s.pp is not null and pp.claimed_by is not null
  ) r;

  return query select * from public.par_process_match_roster(
    'play_match', p_match_id, v_match.event_id, v_winner, v_margin, 'organizer_verified', v_roster
  );
end;
$$;

-- =============================================================================
-- 4. Tournaments -> bracket_matches. Players reference profiles directly.
--    A bracket match may span multiple games (score arrays); rated as one result
--    (the match winner) with total point differential as the margin.
-- =============================================================================

create or replace function public.evaluate_bracket_match_par_eligibility(p_match_id uuid)
returns public.par_game_processing
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.bracket_matches;
  v_algo public.par_algorithm_versions;
  v_status text := 'eligible';
  v_reason text := null;
  v_verification text := 'organizer_verified';
  v_t1_doubles boolean; v_t2_doubles boolean;
  v_sum1 integer; v_sum2 integer;
  v_profiles uuid[];
  v_out public.par_game_processing;
begin
  select * into v_algo from public.par_algorithm_versions algo
    where algo.is_active order by algo.activated_at desc nulls last limit 1;
  select * into v_match from public.bracket_matches m where m.id = p_match_id;
  if not found then raise exception 'match_not_found' using errcode = 'P0001'; end if;

  v_sum1 := coalesce((select sum(x) from unnest(coalesce(v_match.score_team1, array[]::integer[])) x), 0);
  v_sum2 := coalesce((select sum(x) from unnest(coalesce(v_match.score_team2, array[]::integer[])) x), 0);
  v_t1_doubles := v_match.team1_player_b is not null;
  v_t2_doubles := v_match.team2_player_b is not null;

  if v_match.completed_at is null then
    v_status := 'pending'; v_reason := 'match_not_completed'; v_verification := null;
  elsif v_match.winner is null or v_match.winner not in (1,2) then
    v_status := 'excluded'; v_reason := 'winner_missing'; v_verification := 'excluded';
  elsif coalesce(array_length(v_match.score_team1,1),0) = 0 and coalesce(array_length(v_match.score_team2,1),0) = 0 then
    v_status := 'excluded'; v_reason := 'invalid_score'; v_verification := 'excluded';
  elsif v_sum1 = v_sum2 then
    v_status := 'excluded'; v_reason := 'tied_score'; v_verification := 'excluded';
  elsif v_match.team1_player_a is null or v_match.team2_player_a is null then
    v_status := 'excluded'; v_reason := 'missing_players'; v_verification := 'excluded';
  elsif v_t1_doubles <> v_t2_doubles then
    v_status := 'excluded'; v_reason := 'invalid_team_count'; v_verification := 'excluded';
  else
    v_profiles := array_remove(array[
      v_match.team1_player_a, v_match.team1_player_b,
      v_match.team2_player_a, v_match.team2_player_b
    ], null);
    if (select count(distinct p) from unnest(v_profiles) p) < array_length(v_profiles,1) then
      v_status := 'excluded'; v_reason := 'duplicate_participant'; v_verification := 'excluded';
    end if;

    -- Defensive authorization: when a submitter is recorded, it must be the
    -- tournament director or a platform admin. When score_entered_by is null we
    -- fall back to the restrictive base-table RLS + finalized match state (only a
    -- director/admin can write bracket_matches) as authorization proof.
    if v_status = 'eligible' and v_match.score_entered_by is not null then
      if not exists (
            select 1 from public.tournaments t
             where t.id = v_match.tournament_id and t.director_id = v_match.score_entered_by
          )
         and not public.par_profile_is_admin(v_match.score_entered_by) then
        v_status := 'excluded'; v_reason := 'unauthorized_submitter'; v_verification := 'excluded';
      end if;
    end if;
  end if;

  insert into public.par_game_processing (
    game_id, source_type, session_id, status, eligibility_reason, verification_level,
    algorithm_version, processed_at, last_evaluated_at, error_message
  ) values (
    p_match_id, 'bracket_match', v_match.tournament_id, v_status, v_reason, v_verification,
    v_algo.version, null, now(), null
  )
  on conflict (game_id) do update set
    source_type = 'bracket_match',
    session_id = excluded.session_id,
    status = case when public.par_game_processing.status = 'processed' and excluded.status = 'eligible' then public.par_game_processing.status else excluded.status end,
    eligibility_reason = excluded.eligibility_reason,
    verification_level = excluded.verification_level,
    algorithm_version = excluded.algorithm_version,
    processed_at = case when public.par_game_processing.status = 'processed' and excluded.status = 'eligible' then public.par_game_processing.processed_at else null end,
    last_evaluated_at = now(),
    error_message = null
  returning * into v_out;

  return v_out;
end;
$$;

create or replace function public.process_bracket_match_par(p_match_id uuid)
returns setof public.par_rating_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.bracket_matches;
  v_proc public.par_game_processing;
  v_winner integer;
  v_margin integer;
  v_roster jsonb;
begin
  select * into v_match from public.bracket_matches m where m.id = p_match_id;
  if not found then raise exception 'match_not_found' using errcode = 'P0001'; end if;

  if exists (select 1 from public.par_game_processing p where p.game_id = p_match_id and p.status = 'processed') then
    return query select * from public.par_rating_events e
      where e.game_id = p_match_id and e.event_type = 'game_processed' and e.reversed_at is null
      order by e.processed_at, e.profile_id;
    return;
  end if;

  v_proc := public.evaluate_bracket_match_par_eligibility(p_match_id);
  if v_proc.status <> 'eligible' then return; end if;

  v_winner := v_match.winner;
  v_margin := abs(
    coalesce((select sum(x) from unnest(coalesce(v_match.score_team1, array[]::integer[])) x), 0)
    - coalesce((select sum(x) from unnest(coalesce(v_match.score_team2, array[]::integer[])) x), 0)
  );

  select jsonb_agg(jsonb_build_object('profile_id', profile_id, 'team_number', team))
    into v_roster
  from (
    select 1 as team, v_match.team1_player_a as profile_id where v_match.team1_player_a is not null
    union all select 1, v_match.team1_player_b where v_match.team1_player_b is not null
    union all select 2, v_match.team2_player_a where v_match.team2_player_a is not null
    union all select 2, v_match.team2_player_b where v_match.team2_player_b is not null
  ) r;

  return query select * from public.par_process_match_roster(
    'bracket_match', p_match_id, v_match.tournament_id, v_winner, v_margin, 'organizer_verified', v_roster
  );
end;
$$;

-- =============================================================================
-- 5. Event-level batch processors + auto-processing triggers.
-- =============================================================================

create or replace function public.process_play_event_par(p_event_id uuid)
returns setof public.par_game_processing
language plpgsql
security definer
set search_path = public
as $$
declare v_match record;
begin
  for v_match in select m.id from public.play_matches m where m.event_id = p_event_id loop
    begin
      perform public.process_play_match_par(v_match.id);
    exception when others then
      insert into public.par_game_processing (game_id, source_type, session_id, status, eligibility_reason, error_message, last_evaluated_at)
      values (v_match.id, 'play_match', p_event_id, 'failed', 'processing_failed', sqlerrm, now())
      on conflict (game_id) do update set
        status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
    end;
  end loop;
  return query select p.* from public.par_game_processing p
    where p.session_id = p_event_id and p.source_type = 'play_match'
    order by p.last_evaluated_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Corrections. reverse_organized_match_par restores each rated player to their
-- pre-match PAR and appends an audit 'reversal' row (originals kept, marked
-- reversed) — mirrors reverse_personal_game_par. Used on score corrections.
-- ---------------------------------------------------------------------------
create or replace function public.reverse_organized_match_par(p_match_id uuid, p_reason text default 'score_corrected')
returns setof public.par_rating_events
language plpgsql security definer set search_path = public as $$
declare v_event public.par_rating_events; v_reversal public.par_rating_events;
begin
  for v_event in
    select * from public.par_rating_events e
     where e.game_id = p_match_id and e.source_type <> 'personal'
       and e.event_type = 'game_processed' and e.reversed_at is null
     order by e.processed_at desc
  loop
    update public.player_par_profiles prof
       set current_par = v_event.par_before,
           confidence_score = greatest(0, prof.confidence_score - v_event.confidence_change),
           confidence_band = public.par_confidence_band(greatest(0, prof.confidence_score - v_event.confidence_change)),
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
      v_event.profile_id, v_event.source_type, v_event.session_id, v_event.game_id, 'reversal',
      v_event.par_after, v_event.par_before, v_event.par_before - v_event.par_after,
      v_event.confidence_after, v_event.confidence_before, v_event.confidence_before - v_event.confidence_after,
      v_event.expected_result, v_event.actual_result, v_event.score_margin, v_event.opponent_strength, v_event.partner_strength,
      v_event.verification_level, v_event.weight, 'reversal',
      jsonb_build_object('reason', coalesce(p_reason,'score_corrected'), 'reversedEventId', v_event.id),
      v_event.algorithm_version
    ) returning * into v_reversal;

    update public.par_rating_events e set reversed_at = now(), reversal_event_id = v_reversal.id where e.id = v_event.id;
  end loop;

  update public.par_game_processing p
     set status = 'reversed', eligibility_reason = coalesce(p_reason,'score_corrected'), last_evaluated_at = now()
   where p.game_id = p_match_id;

  return query select * from public.par_rating_events e
    where e.game_id = p_match_id and e.event_type = 'reversal' order by e.processed_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Global deterministic rebuild across ALL sources in true chronological order.
-- Used when a correction must be propagated through downstream matches. Prior
-- active events are marked reversed (audit preserved), profiles reset to initial,
-- then every completed match is replayed by match date. Admin/service only.
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_all_par()
returns void language plpgsql security definer set search_path = public as $$
declare v_row record;
begin
  update public.par_rating_events set reversed_at = now()
   where event_type = 'game_processed' and reversed_at is null;

  update public.player_par_profiles
     set current_par = initial_par, confidence_score = 0, confidence_band = 'low',
         eligible_games_count = 0, last_processed_game_id = null, last_rated_at = null;

  update public.par_game_processing set status = 'eligible', processed_at = null where status = 'processed';

  for v_row in
    select source_type, match_id from (
      select 'personal'::text as source_type, g.id as match_id, s.played_at as ts, g.game_number as seq
        from public.personal_games g
        join public.personal_sessions s on s.id = g.session_id
       where g.status = 'completed' and s.status = 'completed'
      union all
      select 'play_match', m.id,
             (e.event_date + coalesce(m.round, 0) * interval '1 minute')::timestamptz, coalesce(m.match_number, m.round)
        from public.play_matches m
        join public.play_events e on e.id = m.event_id
       where e.status = 'completed' and m.winner is not null
      union all
      select 'bracket_match', m.id, m.completed_at, m.match_number
        from public.bracket_matches m
       where m.completed_at is not null and m.winner is not null
    ) unified
    order by ts nulls last, seq nulls last
  loop
    begin
      if v_row.source_type = 'personal'     then perform public.process_personal_game_par(v_row.match_id);
      elsif v_row.source_type = 'play_match' then perform public.process_play_match_par(v_row.match_id);
      else                                        perform public.process_bracket_match_par(v_row.match_id);
      end if;
    exception when others then null;
    end;
  end loop;
end;
$$;

-- play_events completion -> process all its matches. PAR failures never block the
-- underlying status change (they are captured in par_game_processing instead).
create or replace function public.try_process_play_event_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from new.status then
    begin perform public.process_play_event_par(new.id); exception when others then null; end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_play_events_process_par on public.play_events;
create trigger trg_play_events_process_par
  after update of status on public.play_events
  for each row execute function public.try_process_play_event_par();

-- Late score edits on an already-completed event -> reverse the prior rating and
-- reprocess with the corrected result. Errors are captured, never block the save.
create or replace function public.try_process_play_match_par()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status public.play_event_status;
begin
  if new.winner is not null then
    select status into v_status from public.play_events where id = new.event_id;
    if v_status = 'completed' then
      begin
        if exists (select 1 from public.par_game_processing p where p.game_id = new.id and p.status = 'processed')
           and (new.winner is distinct from old.winner
             or new.score_a is distinct from old.score_a
             or new.score_b is distinct from old.score_b) then
          perform public.reverse_organized_match_par(new.id, 'score_corrected');
        end if;
        perform public.process_play_match_par(new.id);
      exception when others then
        insert into public.par_game_processing (game_id, source_type, session_id, status, eligibility_reason, error_message, last_evaluated_at)
        values (new.id, 'play_match', new.event_id, 'failed', 'processing_failed', sqlerrm, now())
        on conflict (game_id) do update set
          status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_play_matches_process_par on public.play_matches;
create trigger trg_play_matches_process_par
  after update of winner, score_a, score_b on public.play_matches
  for each row execute function public.try_process_play_match_par();

-- bracket_matches complete individually; late score edits reverse + reprocess.
create or replace function public.try_process_bracket_match_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.winner is not null and new.completed_at is not null then
    begin
      if exists (select 1 from public.par_game_processing p where p.game_id = new.id and p.status = 'processed')
         and (new.winner is distinct from old.winner
           or new.score_team1 is distinct from old.score_team1
           or new.score_team2 is distinct from old.score_team2) then
        perform public.reverse_organized_match_par(new.id, 'score_corrected');
      end if;
      perform public.process_bracket_match_par(new.id);
    exception when others then
      insert into public.par_game_processing (game_id, source_type, session_id, status, eligibility_reason, error_message, last_evaluated_at)
      values (new.id, 'bracket_match', new.tournament_id, 'failed', 'processing_failed', sqlerrm, now())
      on conflict (game_id) do update set
        status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bracket_matches_process_par on public.bracket_matches;
create trigger trg_bracket_matches_process_par
  after update of winner, completed_at, score_entered_at, score_team1, score_team2 on public.bracket_matches
  for each row execute function public.try_process_bracket_match_par();

-- When a guest claims their account, reprocess their completed play-event matches.
create or replace function public.try_process_play_participant_claim_par()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_match record; v_status public.play_event_status;
begin
  if tg_op = 'UPDATE' and old.claimed_by is null and new.claimed_by is not null then
    select status into v_status from public.play_events where id = new.event_id;
    if v_status = 'completed' then
      for v_match in
        select m.id from public.play_matches m
         where m.event_id = new.event_id
           and new.id in (m.player_a_id, m.player_a2_id, m.player_b_id, m.player_b2_id)
      loop
        begin perform public.process_play_match_par(v_match.id); exception when others then null; end;
      end loop;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_play_participants_process_par_claim on public.play_participants;
create trigger trg_play_participants_process_par_claim
  after update of claimed_by on public.play_participants
  for each row execute function public.try_process_play_participant_claim_par();

-- =============================================================================
-- 6. Backfill already-completed organized matches.
-- =============================================================================

do $$
declare v_row record;
begin
  for v_row in
    select m.id from public.play_matches m
    join public.play_events e on e.id = m.event_id
    where e.status = 'completed' and m.winner is not null
  loop
    begin perform public.process_play_match_par(v_row.id); exception when others then null; end;
  end loop;

  for v_row in
    select m.id from public.bracket_matches m
    where m.completed_at is not null and m.winner is not null
  loop
    begin perform public.process_bracket_match_par(v_row.id); exception when others then null; end;
  end loop;
end;
$$;

-- =============================================================================
-- 7. RLS + grants. Organized rating events are already readable by the rated
--    player via the existing "profile_id = auth.uid()" branch on par_rating_events.
--    Expose organized processing rows to the players involved in the match.
-- =============================================================================

drop policy if exists "par_game_processing: organized participant read" on public.par_game_processing;
create policy "par_game_processing: organized participant read"
  on public.par_game_processing for select
  using (
    source_type <> 'personal'
    and exists (
      select 1 from public.par_rating_events e
      where e.game_id = par_game_processing.game_id
        and e.source_type = par_game_processing.source_type
        and e.profile_id = (select auth.uid())
    )
  );

-- Eligibility evaluators are safe to expose (deterministic, read authoritative data).
grant execute on function public.evaluate_play_match_par_eligibility(uuid) to authenticated;
grant execute on function public.evaluate_bracket_match_par_eligibility(uuid) to authenticated;

-- Processing/rating mutation stays internal: invoked by triggers (definer) + backfill.
-- Clients cannot pass or override verification levels; it is derived server-side.
revoke all on function public.par_process_match_roster(text, uuid, uuid, integer, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.process_play_match_par(uuid) from public, anon, authenticated;
revoke all on function public.process_bracket_match_par(uuid) from public, anon, authenticated;
revoke all on function public.process_play_event_par(uuid) from public, anon, authenticated;
revoke all on function public.reverse_organized_match_par(uuid, text) from public, anon, authenticated;
revoke all on function public.recalculate_all_par() from public, anon, authenticated;
revoke all on function public.par_profile_is_admin(uuid) from public, anon, authenticated;
