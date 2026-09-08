-- Phase 4: PAR V1 foundation and explainable rating engine.
-- Source data: canonical completed personal-session games.

create table if not exists public.par_algorithm_versions (
  version text primary key,
  name text not null,
  description text,
  configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_par_algorithm_versions_active
  on public.par_algorithm_versions(is_active) where is_active;

drop trigger if exists trg_par_algorithm_versions_updated_at on public.par_algorithm_versions;
create trigger trg_par_algorithm_versions_updated_at
  before update on public.par_algorithm_versions
  for each row execute function public.fn_set_updated_at();

insert into public.par_algorithm_versions (version, name, description, configuration, is_active, activated_at)
values (
  'par_v1',
  'PAR V1',
  'Conservative Elo-style personal-match PAR engine using win/loss, team strength, score margin, confidence, and participant verification.',
  '{"rating_min":1.0,"rating_max":6.0,"default_initial_par":3.25,"display_initial_games_target":8,"elo_divisor":1.0,"base_k":0.12,"confidence_multipliers":{"low":1.0,"medium":0.75,"high":0.52},"movement_caps":{"low":0.12,"medium":0.08,"high":0.05},"confidence_gain":{"participant_verified":8.0,"fully_verified":12.0},"verification_weight":{"participant_verified":0.75,"fully_verified":1.0},"score_margin":{"close_threshold":2,"clear_threshold":6,"close_multiplier":0.85,"normal_multiplier":1.0,"clear_multiplier":1.12,"dominant_multiplier":1.2},"confidence_bands":{"low_max":39,"medium_max":74}}'::jsonb,
  true,
  now()
)
on conflict (version) do update set
  name = excluded.name,
  description = excluded.description,
  configuration = excluded.configuration,
  is_active = excluded.is_active,
  activated_at = coalesce(public.par_algorithm_versions.activated_at, excluded.activated_at),
  updated_at = now();

create table if not exists public.player_par_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  current_par numeric(6,4) not null,
  confidence_score numeric(5,2) not null default 0,
  confidence_band text not null default 'low',
  eligible_games_count integer not null default 0,
  initial_par numeric(6,4) not null,
  initialization_source text not null,
  initialized_at timestamptz not null default now(),
  last_processed_game_id uuid references public.personal_games(id) on delete set null,
  last_rated_at timestamptz,
  algorithm_version text not null references public.par_algorithm_versions(version),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_par_profiles_par_range check (current_par >= 1.0 and current_par <= 6.0),
  constraint player_par_profiles_initial_range check (initial_par >= 1.0 and initial_par <= 6.0),
  constraint player_par_profiles_confidence_range check (confidence_score >= 0 and confidence_score <= 100),
  constraint player_par_profiles_confidence_band check (confidence_band in ('low','medium','high')),
  constraint player_par_profiles_games_nonnegative check (eligible_games_count >= 0),
  constraint player_par_profiles_initialization_source check (initialization_source in ('self_rating','skill_level','default'))
);

create index if not exists idx_player_par_profiles_last_rated on public.player_par_profiles(last_rated_at desc);

drop trigger if exists trg_player_par_profiles_updated_at on public.player_par_profiles;
create trigger trg_player_par_profiles_updated_at
  before update on public.player_par_profiles
  for each row execute function public.fn_set_updated_at();

create table if not exists public.par_game_processing (
  game_id uuid primary key references public.personal_games(id) on delete cascade,
  session_id uuid not null references public.personal_sessions(id) on delete cascade,
  status text not null default 'pending',
  eligibility_reason text,
  verification_level text,
  algorithm_version text references public.par_algorithm_versions(version),
  processed_at timestamptz,
  last_evaluated_at timestamptz not null default now(),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint par_game_processing_status check (status in ('pending','pending_participant_claim','eligible','processing','processed','excluded','reversed','failed')),
  constraint par_game_processing_verification check (verification_level is null or verification_level in ('fully_verified','participant_verified','disputed','excluded'))
);

create index if not exists idx_par_game_processing_session on public.par_game_processing(session_id, status);
create index if not exists idx_par_game_processing_status on public.par_game_processing(status, last_evaluated_at desc);

drop trigger if exists trg_par_game_processing_updated_at on public.par_game_processing;
create trigger trg_par_game_processing_updated_at
  before update on public.par_game_processing
  for each row execute function public.fn_set_updated_at();

create table if not exists public.par_rating_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.personal_sessions(id) on delete cascade,
  game_id uuid not null references public.personal_games(id) on delete cascade,
  event_type text not null default 'game_processed',
  par_before numeric(6,4) not null,
  par_after numeric(6,4) not null,
  par_change numeric(7,4) not null,
  confidence_before numeric(5,2) not null,
  confidence_after numeric(5,2) not null,
  confidence_change numeric(6,2) not null,
  expected_result numeric(6,4) not null,
  actual_result numeric(4,2) not null,
  score_margin integer not null,
  opponent_strength numeric(6,4) not null,
  partner_strength numeric(6,4),
  verification_level text not null,
  weight numeric(6,4) not null,
  explanation_code text not null,
  explanation_data jsonb not null default '{}'::jsonb,
  algorithm_version text not null references public.par_algorithm_versions(version),
  processed_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_event_id uuid references public.par_rating_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint par_rating_events_event_type check (event_type in ('game_processed','reversal','recalculation')),
  constraint par_rating_events_rating_ranges check (par_before >= 1.0 and par_before <= 6.0 and par_after >= 1.0 and par_after <= 6.0),
  constraint par_rating_events_confidence_ranges check (confidence_before >= 0 and confidence_before <= 100 and confidence_after >= 0 and confidence_after <= 100),
  constraint par_rating_events_actual_result check (actual_result in (0,1)),
  constraint par_rating_events_verification check (verification_level in ('fully_verified','participant_verified','disputed','excluded'))
);

create unique index if not exists uq_par_rating_events_active_player_game
  on public.par_rating_events(profile_id, game_id)
  where event_type = 'game_processed' and reversed_at is null;
create index if not exists idx_par_rating_events_profile_processed on public.par_rating_events(profile_id, processed_at desc);
create index if not exists idx_par_rating_events_session_game on public.par_rating_events(session_id, game_id);

drop trigger if exists trg_par_rating_events_updated_at on public.par_rating_events;
create trigger trg_par_rating_events_updated_at
  before update on public.par_rating_events
  for each row execute function public.fn_set_updated_at();

create or replace function public.par_clamp(p_value numeric, p_min numeric, p_max numeric)
returns numeric language sql immutable as $$
  select least(greatest(p_value, p_min), p_max);
$$;

create or replace function public.par_confidence_band(p_score numeric)
returns text language sql immutable as $$
  select case when p_score >= 75 then 'high' when p_score >= 40 then 'medium' else 'low' end;
$$;

create or replace function public.par_skill_level_initial_value(p_skill_level text)
returns numeric language plpgsql immutable as $$
declare
  v text := lower(coalesce(p_skill_level, ''));
  v_first numeric;
  v_second numeric;
begin
  if btrim(v) = '' then return null; end if;
  if v like '%beginner%' then return 2.0000; end if;
  if v like '%2.5%' and (v like '%below%' or v like '%under%' or v like '%& below%') then return 2.4000; end if;
  if v like '%4.5+%' or v like '%4.5 plus%' or v like '%advanced%' then return 4.7500; end if;
  v := replace(v, '_', '-');
  if v ~ '([0-9]+(\.[0-9]+)?)[[:space:]]*-[[:space:]]*([0-9]+(\.[0-9]+)?)' then
    v_first := substring(v from '([0-9]+(\.[0-9]+)?)[[:space:]]*-')::numeric;
    v_second := substring(v from '-[[:space:]]*([0-9]+(\.[0-9]+)?)')::numeric;
    return round(((v_first + v_second) / 2.0)::numeric, 4);
  end if;
  if v ~ '^[0-9]+(\.[0-9]+)?$' then return v::numeric; end if;
  return null;
end;
$$;

create or replace function public.initialize_player_par_profile(
  p_profile_id uuid,
  p_algorithm_version text default null
)
returns public.player_par_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_algo public.par_algorithm_versions;
  v_config jsonb;
  v_initial numeric;
  v_source text;
  v_existing public.player_par_profiles;
  v_row public.player_par_profiles;
begin
  select * into v_existing from public.player_par_profiles profile where profile.profile_id = p_profile_id;
  if found then return v_existing; end if;

  select * into v_profile from public.profiles profile where profile.id = p_profile_id;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;

  if p_algorithm_version is not null then
    select * into v_algo from public.par_algorithm_versions algo where algo.version = p_algorithm_version;
  else
    select * into v_algo from public.par_algorithm_versions algo where algo.is_active order by algo.activated_at desc nulls last limit 1;
  end if;
  if not found then raise exception 'par_algorithm_not_found' using errcode = 'P0001'; end if;

  v_config := v_algo.configuration;
  v_initial := null;
  v_source := null;

  if v_profile.self_rating is not null and btrim(v_profile.self_rating) ~ '^[0-9]+(\.[0-9]+)?$' then
    v_initial := v_profile.self_rating::numeric;
    v_source := 'self_rating';
  end if;

  if v_initial is null then
    v_initial := public.par_skill_level_initial_value(v_profile.skill_level);
    if v_initial is not null then v_source := 'skill_level'; end if;
  end if;

  if v_initial is null then
    v_initial := coalesce((v_config->>'default_initial_par')::numeric, 3.25);
    v_source := 'default';
  end if;

  v_initial := round(public.par_clamp(v_initial, coalesce((v_config->>'rating_min')::numeric, 1.0), coalesce((v_config->>'rating_max')::numeric, 6.0)), 4);

  insert into public.player_par_profiles (
    profile_id, current_par, confidence_score, confidence_band, eligible_games_count,
    initial_par, initialization_source, algorithm_version
  ) values (
    p_profile_id, v_initial, 0, 'low', 0, v_initial, v_source, v_algo.version
  ) returning * into v_row;

  return v_row;
end;
$$;


create or replace function public.initialize_own_player_par_profile()
returns public.player_par_profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  return public.initialize_player_par_profile(auth.uid(), null);
end;
$$;

create or replace function public.evaluate_personal_game_par_eligibility(p_game_id uuid)
returns public.par_game_processing
language plpgsql
security definer
set search_path = public
as $$
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
    elsif v_unclaimed > 0 then
      v_status := 'pending_participant_claim'; v_reason := 'waiting_for_guest_claim'; v_verification := null;
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
$$;

create or replace function public.par_score_margin_category(p_margin integer, p_config jsonb)
returns text language plpgsql immutable as $$
declare
  v_close integer := coalesce(((p_config->'score_margin'->>'close_threshold')::integer), 2);
  v_clear integer := coalesce(((p_config->'score_margin'->>'clear_threshold')::integer), 6);
begin
  if p_margin <= v_close then return 'close'; end if;
  if p_margin >= 11 then return 'dominant'; end if;
  if p_margin >= v_clear then return 'clear'; end if;
  return 'normal';
end;
$$;

create or replace function public.par_score_margin_multiplier(p_category text, p_config jsonb)
returns numeric language sql immutable as $$
  select case p_category
    when 'close' then coalesce((p_config->'score_margin'->>'close_multiplier')::numeric, 0.85)
    when 'clear' then coalesce((p_config->'score_margin'->>'clear_multiplier')::numeric, 1.12)
    when 'dominant' then coalesce((p_config->'score_margin'->>'dominant_multiplier')::numeric, 1.20)
    else coalesce((p_config->'score_margin'->>'normal_multiplier')::numeric, 1.0)
  end;
$$;

create or replace function public.par_explanation_code(p_actual numeric, p_expected numeric, p_margin_category text)
returns text language sql immutable as $$
  select case
    when p_actual = 1 and p_expected < 0.45 then 'upset_win'
    when p_actual = 1 and p_expected > 0.60 and p_margin_category in ('clear','dominant') then 'expected_win_clear'
    when p_actual = 1 then 'expected_win'
    when p_actual = 0 and p_expected > 0.55 then 'upset_loss'
    when p_actual = 0 and p_expected < 0.40 and p_margin_category = 'close' then 'close_loss_stronger_team'
    else 'loss'
  end;
$$;

create or replace function public.process_personal_game_par(p_game_id uuid)
returns setof public.par_rating_events
language plpgsql
security definer
set search_path = public
as $$
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
  v_verification_weight numeric;
  v_confidence_gain numeric;
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
  v_verification_weight := coalesce((v_config->'verification_weight'->>'participant_verified')::numeric, 0.75);
  v_confidence_gain := coalesce((v_config->'confidence_gain'->>'participant_verified')::numeric, 8.0);
  v_margin := abs(v_game.team_one_score - v_game.team_two_score);
  v_margin_category := public.par_score_margin_category(v_margin, v_config);
  v_margin_multiplier := public.par_score_margin_multiplier(v_margin_category, v_config);

  for v_participant in
    select distinct sp.profile_id
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id
  loop
    perform public.initialize_player_par_profile(v_participant.profile_id, v_algo.version);
  end loop;

  select avg(profile.current_par) into v_team_one_avg
    from public.personal_game_participants gp
    join public.personal_session_participants sp on sp.id = gp.session_participant_id
    join public.player_par_profiles profile on profile.profile_id = sp.profile_id
   where gp.game_id = p_game_id and gp.team_number = 1;

  select avg(profile.current_par) into v_team_two_avg
    from public.personal_game_participants gp
    join public.personal_session_participants sp on sp.id = gp.session_participant_id
    join public.player_par_profiles profile on profile.profile_id = sp.profile_id
   where gp.game_id = p_game_id and gp.team_number = 2;

  for v_participant in
    select gp.team_number, gp.position, sp.profile_id
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id
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

    select avg(profile.current_par) into v_partner_avg
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
      join public.player_par_profiles profile on profile.profile_id = sp.profile_id
     where gp.game_id = p_game_id and gp.team_number = v_participant.team_number and sp.profile_id <> v_participant.profile_id;

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
      round(v_opp_avg, 4), round(v_partner_avg, 4), 'participant_verified', v_verification_weight,
      v_explanation,
      jsonb_build_object(
        'result', case when v_actual = 1 then 'win' else 'loss' end,
        'expectedResult', v_expected,
        'opponentRating', round(v_opp_avg, 4),
        'partnerRating', round(v_partner_avg, 4),
        'scoreMarginCategory', v_margin_category,
        'confidenceBand', v_band,
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
     set status = 'processed', eligibility_reason = null, verification_level = 'participant_verified',
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
$$;

create or replace function public.process_personal_session_par(p_session_id uuid)
returns setof public.par_game_processing
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.personal_sessions;
  v_game record;
begin
  select * into v_session from public.personal_sessions session where session.id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;

  if auth.uid() is not null and not public.is_personal_session_visible(p_session_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  for v_game in
    select game.id from public.personal_games game
    where game.session_id = p_session_id and game.status = 'completed'
    order by game.game_number, game.created_at
  loop
    begin
      perform public.process_personal_game_par(v_game.id);
    exception when others then
      insert into public.par_game_processing (game_id, session_id, status, eligibility_reason, last_evaluated_at, error_message)
      values (v_game.id, p_session_id, 'failed', 'processing_failed', now(), sqlerrm)
      on conflict (game_id) do update set
        status = 'failed', eligibility_reason = 'processing_failed', last_evaluated_at = now(), error_message = sqlerrm;
    end;
  end loop;

  return query select * from public.par_game_processing processing
    where processing.session_id = p_session_id
    order by processing.last_evaluated_at desc;
end;
$$;

create or replace function public.reverse_personal_game_par(p_game_id uuid, p_reason text default 'manual_reversal')
returns setof public.par_rating_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.personal_games;
  v_event public.par_rating_events;
  v_reversal public.par_rating_events;
begin
  select * into v_game from public.personal_games game where game.id = p_game_id;
  if not found then raise exception 'game_not_found' using errcode = 'P0001'; end if;

  if auth.uid() is not null and not public.is_personal_session_visible(v_game.session_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  for v_event in
    select * from public.par_rating_events event
    where event.game_id = p_game_id and event.event_type = 'game_processed' and event.reversed_at is null
    order by event.processed_at desc
  loop
    update public.player_par_profiles profile
       set current_par = v_event.par_before,
           confidence_score = greatest(0, profile.confidence_score - v_event.confidence_change),
           confidence_band = public.par_confidence_band(greatest(0, profile.confidence_score - v_event.confidence_change)),
           eligible_games_count = greatest(0, profile.eligible_games_count - 1),
           last_rated_at = now()
     where profile.profile_id = v_event.profile_id;

    insert into public.par_rating_events (
      profile_id, session_id, game_id, event_type,
      par_before, par_after, par_change,
      confidence_before, confidence_after, confidence_change,
      expected_result, actual_result, score_margin, opponent_strength, partner_strength,
      verification_level, weight, explanation_code, explanation_data, algorithm_version
    ) values (
      v_event.profile_id, v_event.session_id, v_event.game_id, 'reversal',
      v_event.par_after, v_event.par_before, v_event.par_before - v_event.par_after,
      v_event.confidence_after, v_event.confidence_before, v_event.confidence_before - v_event.confidence_after,
      v_event.expected_result, v_event.actual_result, v_event.score_margin, v_event.opponent_strength, v_event.partner_strength,
      v_event.verification_level, v_event.weight, 'reversal',
      jsonb_build_object('reason', coalesce(p_reason, 'manual_reversal'), 'reversedEventId', v_event.id),
      v_event.algorithm_version
    ) returning * into v_reversal;

    update public.par_rating_events event
       set reversed_at = now(), reversal_event_id = v_reversal.id
     where event.id = v_event.id;
  end loop;

  update public.par_game_processing processing
     set status = 'reversed', eligibility_reason = coalesce(p_reason, 'manual_reversal'), last_evaluated_at = now()
   where processing.game_id = p_game_id;

  return query select * from public.par_rating_events event
    where event.game_id = p_game_id and event.event_type = 'reversal'
    order by event.processed_at desc;
end;
$$;

create or replace function public.recalculate_personal_session_par(p_session_id uuid)
returns setof public.par_game_processing
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
begin
  if auth.uid() is not null and not public.is_personal_session_visible(p_session_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  for v_game in
    select game.id from public.personal_games game
    where game.session_id = p_session_id
      and exists (
        select 1 from public.par_rating_events event
        where event.game_id = game.id and event.event_type = 'game_processed' and event.reversed_at is null
      )
    order by game.game_number desc, game.created_at desc
  loop
    perform public.reverse_personal_game_par(v_game.id, 'session_recalculation');
  end loop;

  return query select * from public.process_personal_session_par(p_session_id);
end;
$$;

create or replace function public.retry_failed_personal_game_par(p_game_id uuid)
returns setof public.par_rating_events
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.par_game_processing processing where processing.game_id = p_game_id and processing.status = 'failed') then
    update public.par_game_processing processing
       set status = 'pending', error_message = null, eligibility_reason = null, last_evaluated_at = now()
     where processing.game_id = p_game_id;
  end if;
  return query select * from public.process_personal_game_par(p_game_id);
end;
$$;

create or replace function public.try_process_personal_session_par()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from new.status then
    begin
      perform public.process_personal_session_par(new.id);
    exception when others then
      insert into public.par_game_processing (game_id, session_id, status, eligibility_reason, error_message, last_evaluated_at)
      select game.id, new.id, 'failed', 'processing_failed', sqlerrm, now()
      from public.personal_games game
      where game.session_id = new.id and game.status = 'completed'
      on conflict (game_id) do update set
        status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_personal_sessions_process_par on public.personal_sessions;
create trigger trg_personal_sessions_process_par
  after update of status on public.personal_sessions
  for each row execute function public.try_process_personal_session_par();

create or replace function public.try_process_personal_claimed_participant_par()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_status text;
begin
  if tg_op = 'UPDATE'
     and old.profile_id is null
     and new.profile_id is not null
     and old.guest_player_id is not null
     and new.guest_player_id is null then
    select session.status into v_session_status from public.personal_sessions session where session.id = new.session_id;
    if v_session_status = 'completed' then
      begin
        perform public.process_personal_session_par(new.session_id);
      exception when others then
        insert into public.par_game_processing (game_id, session_id, status, eligibility_reason, error_message, last_evaluated_at)
        select game.id, new.session_id, 'failed', 'processing_failed', sqlerrm, now()
        from public.personal_games game
        where game.session_id = new.session_id and game.status = 'completed'
        on conflict (game_id) do update set
          status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_personal_session_participants_process_par_claim on public.personal_session_participants;
create trigger trg_personal_session_participants_process_par_claim
  after update of profile_id, guest_player_id on public.personal_session_participants
  for each row execute function public.try_process_personal_claimed_participant_par();

alter table public.par_algorithm_versions enable row level security;
alter table public.player_par_profiles enable row level security;
alter table public.par_game_processing enable row level security;
alter table public.par_rating_events enable row level security;

drop policy if exists "par_algorithm_versions: authenticated read" on public.par_algorithm_versions;
create policy "par_algorithm_versions: authenticated read"
  on public.par_algorithm_versions for select
  using ((select auth.uid()) is not null);

drop policy if exists "player_par_profiles: owner read" on public.player_par_profiles;
create policy "player_par_profiles: owner read"
  on public.player_par_profiles for select
  using (profile_id = (select auth.uid()));

drop policy if exists "par_game_processing: match participants read" on public.par_game_processing;
create policy "par_game_processing: match participants read"
  on public.par_game_processing for select
  using (public.is_personal_session_visible(session_id, (select auth.uid())));

drop policy if exists "par_rating_events: owner or match participant read" on public.par_rating_events;
create policy "par_rating_events: owner or match participant read"
  on public.par_rating_events for select
  using (profile_id = (select auth.uid()) or public.is_personal_session_visible(session_id, (select auth.uid())));

grant select on public.par_algorithm_versions to authenticated;
grant select on public.player_par_profiles to authenticated;
grant select on public.par_game_processing to authenticated;
grant select on public.par_rating_events to authenticated;

revoke all on function public.initialize_player_par_profile(uuid, text) from public, anon, authenticated;
grant execute on function public.initialize_own_player_par_profile() to authenticated;
grant execute on function public.evaluate_personal_game_par_eligibility(uuid) to authenticated;
grant execute on function public.process_personal_game_par(uuid) to authenticated;
grant execute on function public.process_personal_session_par(uuid) to authenticated;
grant execute on function public.retry_failed_personal_game_par(uuid) to authenticated;
revoke all on function public.recalculate_personal_session_par(uuid) from public, anon, authenticated;
revoke all on function public.reverse_personal_game_par(uuid, text) from public, anon, authenticated;

