-- DreamBreaker PB - Rate games containing unclaimed guests
--
-- Previously any game with a guest participant was parked at
-- 'pending_participant_claim', so a player who logs casual games with friends
-- who never join the app got zero PAR movement, permanently.
--
-- Guests have no player_par_profiles row, so the old team-average join simply
-- dropped them (NULL opponent average in singles, silently biased average in
-- doubles). This derives a provisional rating for the guest from the relative
-- estimate already captured at log time ("how does this player compare with
-- you today?": weaker/similar/stronger x slightly/much), anchored to the
-- recorder's own PAR, and rates the game at a lower verification tier.
--
-- Guests still never receive a rating event or a PAR profile — only registered
-- players' ratings move. Per PAR_RATING_SPEC "Temporary Players", a later claim
-- improves confidence going forward rather than rewriting processed history.

-- 1. Allow the new verification tier -------------------------------------------------

alter table public.par_game_processing drop constraint if exists par_game_processing_verification;
alter table public.par_game_processing add constraint par_game_processing_verification
  check (
    verification_level is null
    or verification_level = any (array['fully_verified','participant_verified','estimated','disputed','excluded'])
  );

alter table public.par_rating_events drop constraint if exists par_rating_events_verification;
alter table public.par_rating_events add constraint par_rating_events_verification
  check (verification_level = any (array['fully_verified','participant_verified','estimated','disputed','excluded']));

-- 2. Config: estimated tier weights + guest offset mapping ---------------------------

update public.par_algorithm_versions
   set configuration = configuration
     || jsonb_build_object(
          'verification_weight',
            coalesce(configuration->'verification_weight', '{}'::jsonb) || jsonb_build_object('estimated', 0.4),
          'confidence_gain',
            coalesce(configuration->'confidence_gain', '{}'::jsonb) || jsonb_build_object('estimated', 4.0),
          'guest_estimate_offsets', jsonb_build_object(
            'stronger', jsonb_build_object('slightly', 0.25, 'default', 0.5,  'much', 0.85),
            'weaker',   jsonb_build_object('slightly', -0.25, 'default', -0.5, 'much', -0.85)
          )
        )
 where is_active;

-- 3. Guest provisional rating --------------------------------------------------------
-- estimated_skill is stored as "[magnitude ]comparison" relative to the recorder,
-- e.g. "similar", "slightly stronger", "much weaker". Anything that isn't clearly
-- stronger/weaker (including a missing value) is treated as equal to the anchor.

create or replace function public.par_guest_estimated_rating(
  p_skill text,
  p_anchor numeric,
  p_config jsonb
)
returns numeric
language plpgsql
stable
as $$
declare
  v_skill text := lower(coalesce(btrim(p_skill), ''));
  v_offsets jsonb := coalesce(p_config->'guest_estimate_offsets', '{}'::jsonb);
  v_direction text;
  v_magnitude text;
  v_offset numeric;
  v_min numeric := coalesce((p_config->>'rating_min')::numeric, 1.0);
  v_max numeric := coalesce((p_config->>'rating_max')::numeric, 6.0);
  v_anchor numeric := coalesce(p_anchor, coalesce((p_config->>'default_initial_par')::numeric, 3.25));
begin
  if v_skill like '%stronger%' then
    v_direction := 'stronger';
  elsif v_skill like '%weaker%' then
    v_direction := 'weaker';
  else
    return round(public.par_clamp(v_anchor, v_min, v_max), 4);
  end if;

  if v_skill like 'much%' then
    v_magnitude := 'much';
  elsif v_skill like 'slightly%' then
    v_magnitude := 'slightly';
  else
    v_magnitude := 'default';
  end if;

  v_offset := coalesce((v_offsets->v_direction->>v_magnitude)::numeric, 0);
  return round(public.par_clamp(v_anchor + v_offset, v_min, v_max), 4);
end;
$$;

-- 4. Eligibility: guests no longer block ---------------------------------------------

create or replace function public.evaluate_personal_game_par_eligibility(p_game_id uuid)
returns par_game_processing
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_game public.personal_games;
  v_session public.personal_sessions;
  v_algo public.par_algorithm_versions;
  v_status text := 'eligible';
  v_reason text := null;
  v_verification text := 'participant_verified';
  v_expected_total integer;
  v_expected_team integer;
  v_total integer;
  v_team_one integer;
  v_team_two integer;
  v_unclaimed integer;
  v_duplicate_slots integer;
  v_out public.par_game_processing;
begin
  select * into v_algo from public.par_algorithm_versions algo where algo.is_active order by algo.activated_at desc nulls last limit 1;
  select * into v_game from public.personal_games game where game.id = p_game_id;
  if not found then raise exception 'game_not_found' using errcode = 'P0001'; end if;
  select * into v_session from public.personal_sessions session where session.id = v_game.session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;

  if auth.uid() is not null and not public.is_personal_session_visible(v_session.id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_session.status <> 'completed' then
    v_status := 'pending'; v_reason := 'session_not_completed'; v_verification := null;
  elsif v_game.status <> 'completed' then
    v_status := 'pending'; v_reason := 'game_not_completed'; v_verification := null;
  elsif v_game.team_one_score is null or v_game.team_two_score is null or v_game.team_one_score < 0 or v_game.team_two_score < 0 then
    v_status := 'excluded'; v_reason := 'invalid_score'; v_verification := 'excluded';
  elsif v_game.team_one_score = v_game.team_two_score then
    v_status := 'excluded'; v_reason := 'tied_score'; v_verification := 'excluded';
  elsif v_game.winning_team is null or v_game.winning_team not in (1, 2)
     or v_game.winning_team <> (case when v_game.team_one_score > v_game.team_two_score then 1 else 2 end) then
    v_status := 'excluded'; v_reason := 'winner_mismatch'; v_verification := 'excluded';
  end if;

  if v_status = 'eligible' then
    v_expected_total := public.personal_session_expected_players(v_session.format);
    v_expected_team := v_expected_total / 2;
    select count(*) into v_total from public.personal_game_participants gp where gp.game_id = p_game_id;
    select count(*) into v_team_one from public.personal_game_participants gp where gp.game_id = p_game_id and gp.team_number = 1;
    select count(*) into v_team_two from public.personal_game_participants gp where gp.game_id = p_game_id and gp.team_number = 2;
    select count(*) into v_duplicate_slots from (
      select gp.session_participant_id from public.personal_game_participants gp
      where gp.game_id = p_game_id group by gp.session_participant_id having count(*) > 1
    ) dup;
    select count(*) into v_unclaimed
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id and sp.profile_id is null;

    if v_total <> v_expected_total then
      v_status := 'excluded'; v_reason := 'invalid_participant_count'; v_verification := 'excluded';
    elsif v_team_one <> v_expected_team or v_team_two <> v_expected_team then
      v_status := 'excluded'; v_reason := 'invalid_team_count'; v_verification := 'excluded';
    elsif v_duplicate_slots > 0 then
      v_status := 'excluded'; v_reason := 'duplicate_participant_position'; v_verification := 'excluded';
    elsif exists (
      select 1
      from public.personal_game_participants gp
      join public.personal_games game on game.id = gp.game_id
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
      where gp.game_id = p_game_id and sp.session_id <> game.session_id
    ) then
      v_status := 'excluded'; v_reason := 'participant_session_mismatch'; v_verification := 'excluded';
    elsif not exists (
      select 1
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id and sp.profile_id is not null
    ) then
      -- Nobody in this game has an account, so there is no rating to move.
      v_status := 'excluded'; v_reason := 'no_registered_participants'; v_verification := 'excluded';
    elsif v_unclaimed > 0 then
      -- Rated from the recorder-relative estimate captured at log time, at a
      -- reduced weight until (or unless) the guests claim their spots.
      v_status := 'eligible'; v_reason := 'guest_estimated'; v_verification := 'estimated';
    end if;
  end if;

  insert into public.par_game_processing (
    game_id, session_id, status, eligibility_reason, verification_level, algorithm_version,
    processed_at, last_evaluated_at, error_message
  ) values (
    p_game_id, v_session.id, v_status, v_reason, v_verification, v_algo.version,
    null, now(), null
  )
  on conflict (game_id) do update set
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
$function$;

-- 5. Processing: fold guest estimates into team strength -----------------------------

create or replace function public.process_personal_game_par(p_game_id uuid)
returns setof par_rating_events
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_game public.personal_games;
  v_session public.personal_sessions;
  v_processing public.par_game_processing;
  v_locked public.par_game_processing;
  v_algo public.par_algorithm_versions;
  v_config jsonb;
  v_min numeric;
  v_max numeric;
  v_base_k numeric;
  v_elo_divisor numeric;
  v_verification_level text;
  v_verification_weight numeric;
  v_confidence_gain numeric;
  v_anchor numeric;
  v_margin integer;
  v_margin_category text;
  v_margin_multiplier numeric;
  v_team_one_avg numeric;
  v_team_two_avg numeric;
  v_participant record;
  v_profile public.player_par_profiles;
  v_team_avg numeric;
  v_opp_avg numeric;
  v_partner_avg numeric;
  v_actual numeric;
  v_expected numeric;
  v_band text;
  v_confidence_multiplier numeric;
  v_cap numeric;
  v_delta numeric;
  v_after numeric;
  v_conf_after numeric;
  v_explanation text;
begin
  select * into v_game from public.personal_games game where game.id = p_game_id;
  if not found then raise exception 'game_not_found' using errcode = 'P0001'; end if;
  select * into v_session from public.personal_sessions session where session.id = v_game.session_id;

  if auth.uid() is not null and not public.is_personal_session_visible(v_session.id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.par_game_processing processing where processing.game_id = p_game_id and processing.status = 'processed') then
    return query select * from public.par_rating_events event
      where event.game_id = p_game_id and event.event_type = 'game_processed' and event.reversed_at is null
      order by event.processed_at, event.profile_id;
    return;
  end if;

  v_processing := public.evaluate_personal_game_par_eligibility(p_game_id);
  if v_processing.status <> 'eligible' then return; end if;

  select * into v_locked from public.par_game_processing processing where processing.game_id = p_game_id for update;
  if v_locked.status = 'processed' then
    return query select * from public.par_rating_events event
      where event.game_id = p_game_id and event.event_type = 'game_processed' and event.reversed_at is null
      order by event.processed_at, event.profile_id;
    return;
  end if;

  update public.par_game_processing processing
     set status = 'processing', error_message = null, last_evaluated_at = now()
   where processing.game_id = p_game_id;

  select * into v_algo from public.par_algorithm_versions algo where algo.is_active order by algo.activated_at desc nulls last limit 1;
  v_config := v_algo.configuration;
  v_min := coalesce((v_config->>'rating_min')::numeric, 1.0);
  v_max := coalesce((v_config->>'rating_max')::numeric, 6.0);
  v_base_k := coalesce((v_config->>'base_k')::numeric, 0.12);
  v_elo_divisor := greatest(coalesce((v_config->>'elo_divisor')::numeric, 1.0), 0.01);

  -- Weight/confidence gain now follow the tier chosen during eligibility, so a
  -- guest-estimated game moves PAR less and earns less trust than a verified one.
  v_verification_level := coalesce(v_processing.verification_level, 'participant_verified');
  v_verification_weight := coalesce((v_config->'verification_weight'->>v_verification_level)::numeric, 0.75);
  v_confidence_gain := coalesce((v_config->'confidence_gain'->>v_verification_level)::numeric, 8.0);

  v_margin := abs(v_game.team_one_score - v_game.team_two_score);
  v_margin_category := public.par_score_margin_category(v_margin, v_config);
  v_margin_multiplier := public.par_score_margin_multiplier(v_margin_category, v_config);

  -- Guest estimates are relative to whoever recorded the session.
  perform public.initialize_player_par_profile(v_session.created_by, v_algo.version);
  select profile.current_par into v_anchor
    from public.player_par_profiles profile where profile.profile_id = v_session.created_by;

  for v_participant in
    select distinct sp.profile_id
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id and sp.profile_id is not null
  loop
    perform public.initialize_player_par_profile(v_participant.profile_id, v_algo.version);
  end loop;

  select avg(coalesce(profile.current_par, public.par_guest_estimated_rating(sp.estimated_skill, v_anchor, v_config)))
    into v_team_one_avg
    from public.personal_game_participants gp
    join public.personal_session_participants sp on sp.id = gp.session_participant_id
    left join public.player_par_profiles profile on profile.profile_id = sp.profile_id
   where gp.game_id = p_game_id and gp.team_number = 1;

  select avg(coalesce(profile.current_par, public.par_guest_estimated_rating(sp.estimated_skill, v_anchor, v_config)))
    into v_team_two_avg
    from public.personal_game_participants gp
    join public.personal_session_participants sp on sp.id = gp.session_participant_id
    left join public.player_par_profiles profile on profile.profile_id = sp.profile_id
   where gp.game_id = p_game_id and gp.team_number = 2;

  -- Only registered players receive rating events; guests have no profile to move.
  for v_participant in
    select gp.team_number, gp.position, sp.profile_id
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id and sp.profile_id is not null
     order by gp.team_number, gp.position
  loop
    select * into v_profile from public.player_par_profiles profile where profile.profile_id = v_participant.profile_id for update;

    v_team_avg := case when v_participant.team_number = 1 then v_team_one_avg else v_team_two_avg end;
    v_opp_avg := case when v_participant.team_number = 1 then v_team_two_avg else v_team_one_avg end;
    v_actual := case when v_game.winning_team = v_participant.team_number then 1 else 0 end;
    v_expected := round((1.0 / (1.0 + power(10.0, ((v_opp_avg - v_team_avg) / v_elo_divisor))))::numeric, 4);
    v_band := public.par_confidence_band(v_profile.confidence_score);
    v_confidence_multiplier := coalesce((v_config->'confidence_multipliers'->>v_band)::numeric, 1.0);
    v_cap := coalesce((v_config->'movement_caps'->>v_band)::numeric, 0.12);
    v_delta := round(public.par_clamp(v_base_k * (v_actual - v_expected) * v_margin_multiplier * v_verification_weight * v_confidence_multiplier, -v_cap, v_cap), 4);
    v_after := round(public.par_clamp(v_profile.current_par + v_delta, v_min, v_max), 4);
    v_conf_after := round(public.par_clamp(v_profile.confidence_score + v_confidence_gain, 0, 100), 2);
    v_explanation := public.par_explanation_code(v_actual, v_expected, v_margin_category);

    -- Partner may themselves be a guest, so fall back to the estimate here too.
    select avg(coalesce(profile.current_par, public.par_guest_estimated_rating(sp.estimated_skill, v_anchor, v_config)))
      into v_partner_avg
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
      left join public.player_par_profiles profile on profile.profile_id = sp.profile_id
     where gp.game_id = p_game_id
       and gp.team_number = v_participant.team_number
       and (sp.profile_id is null or sp.profile_id <> v_participant.profile_id);

    insert into public.par_rating_events (
      profile_id, session_id, game_id, event_type,
      par_before, par_after, par_change,
      confidence_before, confidence_after, confidence_change,
      expected_result, actual_result, score_margin,
      opponent_strength, partner_strength, verification_level, weight,
      explanation_code, explanation_data, algorithm_version
    ) values (
      v_participant.profile_id, v_session.id, p_game_id, 'game_processed',
      v_profile.current_par, v_after, v_after - v_profile.current_par,
      v_profile.confidence_score, v_conf_after, v_conf_after - v_profile.confidence_score,
      v_expected, v_actual, v_margin,
      round(v_opp_avg, 4), round(v_partner_avg, 4), v_verification_level, v_verification_weight,
      v_explanation,
      jsonb_build_object(
        'result', case when v_actual = 1 then 'win' else 'loss' end,
        'expectedResult', v_expected,
        'opponentRating', round(v_opp_avg, 4),
        'partnerRating', round(v_partner_avg, 4),
        'scoreMarginCategory', v_margin_category,
        'confidenceBand', v_band,
        'verificationLevel', v_verification_level,
        'verificationWeight', v_verification_weight,
        'movementCap', v_cap,
        'scoreMarginMultiplier', v_margin_multiplier,
        'primaryReason', v_explanation,
        'algorithmVersion', v_algo.version
      ),
      v_algo.version
    );

    update public.player_par_profiles profile
       set current_par = v_after,
           confidence_score = v_conf_after,
           confidence_band = public.par_confidence_band(v_conf_after),
           eligible_games_count = profile.eligible_games_count + 1,
           last_processed_game_id = p_game_id,
           last_rated_at = now(),
           algorithm_version = v_algo.version
     where profile.profile_id = v_participant.profile_id;
  end loop;

  update public.par_game_processing processing
     set status = 'processed', eligibility_reason = v_processing.eligibility_reason,
         verification_level = v_verification_level,
         algorithm_version = v_algo.version, processed_at = now(), last_evaluated_at = now(), error_message = null
   where processing.game_id = p_game_id;

  return query select * from public.par_rating_events event
    where event.game_id = p_game_id and event.event_type = 'game_processed' and event.reversed_at is null
    order by event.processed_at, event.profile_id;
exception when others then
  insert into public.par_game_processing (game_id, session_id, status, eligibility_reason, error_message, last_evaluated_at)
  values (p_game_id, coalesce(v_session.id, v_game.session_id), 'failed', 'processing_failed', sqlerrm, now())
  on conflict (game_id) do update set
    status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
  raise;
end;
$function$;
