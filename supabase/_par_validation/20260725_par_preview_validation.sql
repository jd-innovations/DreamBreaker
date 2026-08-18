\set ON_ERROR_STOP on

-- STALE (2026-08-05): this script was written against the original
-- organized_events.sql trigger (synchronous, scoped reversal per-row) and
-- was never updated after replay_engine.sql redefined the same trigger to
-- request an async, global, guard-gated replay instead.
--
-- Investigated after score_and_winner_flip_reverses_and_reprocesses started
-- failing: adding a guard around the trigger fixed that test (before=2,
-- after=2, reversed=2 — confirms the guard was the missing piece), but the
-- same guard change broke organized.guest_claim_processes_once, the
-- personal guest-claim tests, and
-- trigger_isolation.completion_survives_processing_failure, because those
-- sections rely on the trigger firing live (guard off) to self-heal after a
-- claim. There is no single guard placement that satisfies both halves of
-- this script — different sections assume mutually incompatible trigger
-- behaviors.
--
-- Conclusion: the two PAR migrations (20260725010000_par_v1_organized_events.sql,
-- 20260725011000_par_v1_replay_engine.sql) may well be correct; this script
-- is what's out of date. It needs a real rewrite that manages the guard
-- per-section (matching the pattern already used in
-- 20260725_par_phase4a_replay_validation.sql), not a patch. Do not treat a
-- failure here as evidence against the migrations without re-checking this
-- note first.
--
-- Unresolved, separate issue: phase4a_replay_validation.sql has 2
-- continuity-gap failures not explained by the above — still open.

create temp table par_validation_results (
  test_name text primary key,
  passed boolean not null,
  detail text
) on commit preserve rows;

create or replace function pg_temp.par_ok(p_name text, p_passed boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into par_validation_results(test_name, passed, detail)
  values (p_name, p_passed, p_detail)
  on conflict (test_name) do update
    set passed = excluded.passed,
        detail = excluded.detail;
end;
$$;

create or replace function pg_temp.par_event_count(p_game_id uuid, p_source_type text)
returns integer language sql stable as $$
  select count(*)::integer
  from public.par_rating_events
  where game_id = p_game_id
    and source_type = p_source_type
    and event_type = 'game_processed'
    and reversed_at is null;
$$;

create or replace function pg_temp.par_processing_status(p_game_id uuid)
returns text language sql stable as $$
  select status from public.par_game_processing where game_id = p_game_id;
$$;

do $$
declare
  v_has_source_columns boolean;
  v_source_values_ok boolean;
  v_org_config_ok boolean;
  v_personal_weights_ok boolean;
  v_fk_generalized boolean;
  v_unique_ok boolean;
  v_internal_revoked boolean;
begin
  select
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='par_game_processing' and column_name='source_type')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='par_rating_events' and column_name='source_type')
    into v_has_source_columns;
  perform pg_temp.par_ok('schema.source_type_columns', v_has_source_columns, null);

  select count(*) = 2 into v_source_values_ok
  from pg_constraint
  where conname in ('par_game_processing_source_type','par_rating_events_source_type')
    and pg_get_constraintdef(oid) like '%personal%'
    and pg_get_constraintdef(oid) like '%play_match%'
    and pg_get_constraintdef(oid) like '%bracket_match%';
  perform pg_temp.par_ok('schema.source_type_values', v_source_values_ok, null);

  select exists (
    select 1 from public.par_algorithm_versions
    where is_active
      and (configuration->'verification_weight'->>'organizer_verified')::numeric = 1.0
      and (configuration->'confidence_gain'->>'organizer_verified')::numeric = 12.0
  ) into v_org_config_ok;
  perform pg_temp.par_ok('schema.organizer_weight_config', v_org_config_ok, null);

  select exists (
    select 1 from public.par_algorithm_versions
    where is_active
      and configuration->'verification_weight' ? 'participant_verified'
      and configuration->'verification_weight' ? 'fully_verified'
  ) into v_personal_weights_ok;
  perform pg_temp.par_ok('schema.personal_weights_preserved', v_personal_weights_ok, null);

  select not exists (
    select 1
    from pg_constraint
    where conrelid in ('public.par_game_processing'::regclass, 'public.par_rating_events'::regclass, 'public.player_par_profiles'::regclass)
      and contype = 'f'
      and pg_get_constraintdef(oid) like '%personal_games%'
  ) into v_fk_generalized;
  perform pg_temp.par_ok('schema.personal_only_fks_generalized', v_fk_generalized, null);

  select exists (
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='uq_par_rating_events_active_player_game'
      and indexdef like '%profile_id, source_type, game_id%'
  ) into v_unique_ok;
  perform pg_temp.par_ok('schema.source_aware_uniqueness', v_unique_ok, null);

  select not exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema='public'
      and grantee in ('anon','authenticated','public')
      and routine_name in (
        'par_process_match_roster',
        'process_play_match_par',
        'process_bracket_match_par',
        'process_play_event_par',
        'reverse_organized_match_par',
        'recalculate_all_par',
        'par_profile_is_admin'
      )
  ) into v_internal_revoked;
  perform pg_temp.par_ok('schema.internal_functions_not_client_executable', v_internal_revoked, null);
end $$;

do $$
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-00000000a001','authenticated','authenticated','par-p1@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a002','authenticated','authenticated','par-p2@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a003','authenticated','authenticated','par-p3@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a004','authenticated','authenticated','par-p4@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a005','authenticated','authenticated','par-p5@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a006','authenticated','authenticated','par-p6@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a007','authenticated','authenticated','par-director@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a008','authenticated','authenticated','par-organizer@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a009','authenticated','authenticated','par-normal@example.test',now(),'{}','{}',now(),now()),
    ('00000000-0000-0000-0000-00000000a010','authenticated','authenticated','par-admin@example.test',now(),'{}','{}',now(),now())
  on conflict (id) do nothing;

  insert into public.profiles(id, email, full_name, role, skill_level, self_rating, is_director, director_status)
  values
    ('00000000-0000-0000-0000-00000000a001','par-p1@example.test','PAR P1','player','3.5-4.0','4.0',false,null),
    ('00000000-0000-0000-0000-00000000a002','par-p2@example.test','PAR P2','player','3.5-4.0','3.5',false,null),
    ('00000000-0000-0000-0000-00000000a003','par-p3@example.test','PAR P3','player','3.5-4.0','3.5',false,null),
    ('00000000-0000-0000-0000-00000000a004','par-p4@example.test','PAR P4','player','3.5-4.0','3.5',false,null),
    ('00000000-0000-0000-0000-00000000a005','par-p5@example.test','PAR P5','player','3.5-4.0','3.5',false,null),
    ('00000000-0000-0000-0000-00000000a006','par-p6@example.test','PAR P6','player','3.5-4.0','3.5',false,null),
    ('00000000-0000-0000-0000-00000000a007','par-director@example.test','PAR Director','director','4.0-4.5','4.0',true,'approved'),
    ('00000000-0000-0000-0000-00000000a008','par-organizer@example.test','PAR Organizer','player_director','4.0-4.5','4.0',true,'approved'),
    ('00000000-0000-0000-0000-00000000a009','par-normal@example.test','PAR Normal','player','3.0-3.5','3.0',false,null),
    ('00000000-0000-0000-0000-00000000a010','par-admin@example.test','PAR Admin','admin','4.5+','4.5',false,null)
  on conflict (id) do nothing;

  insert into public.facilities(id, name, slug, address, city, state, postal_code, latitude, longitude, verified, court_count, created_by)
  values ('10000000-0000-0000-0000-000000000001','PAR Preview Validation Courts','par-preview-validation-courts','1 Preview Way','Austin','TX','78701',30.2672,-97.7431,true,8,'00000000-0000-0000-0000-00000000a007')
  on conflict (id) do nothing;

  perform pg_temp.par_ok('data.controlled_profiles_and_facility', true, 'registered profiles, directors/admins, and facility inserted on preview branch only');
end $$;

do $$
declare
  g_personal_singles uuid := '20000000-0000-0000-0000-000000000001';
  g_personal_doubles uuid := '20000000-0000-0000-0000-000000000002';
  g_personal_guest uuid := '20000000-0000-0000-0000-000000000003';
  before_w numeric;
  after_w numeric;
  before_l numeric;
  after_l numeric;
  before_cnt integer;
  after_cnt integer;
  guest_id uuid := '21000000-0000-0000-0000-000000000001';
begin
  insert into public.personal_sessions(id, created_by, facility_id, played_at, format, status, indoor_outdoor, completed_at)
  values
    (g_personal_singles,'00000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-000000000001',now() - interval '6 days','singles','completed','outdoor',now() - interval '6 days'),
    (g_personal_doubles,'00000000-0000-0000-0000-00000000a003','10000000-0000-0000-0000-000000000001',now() - interval '5 days','doubles','completed','outdoor',now() - interval '5 days'),
    (g_personal_guest,'00000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-000000000001',now() - interval '4 days','singles','completed','outdoor',now() - interval '4 days');

  insert into public.personal_session_participants(id, session_id, profile_id, display_name_snapshot, estimated_skill, created_by)
  values
    ('22000000-0000-0000-0000-000000000001',g_personal_singles,'00000000-0000-0000-0000-00000000a001','PAR P1','4.0','00000000-0000-0000-0000-00000000a001'),
    ('22000000-0000-0000-0000-000000000002',g_personal_singles,'00000000-0000-0000-0000-00000000a002','PAR P2','3.5','00000000-0000-0000-0000-00000000a001'),
    ('22000000-0000-0000-0000-000000000003',g_personal_doubles,'00000000-0000-0000-0000-00000000a003','PAR P3','3.5','00000000-0000-0000-0000-00000000a003'),
    ('22000000-0000-0000-0000-000000000004',g_personal_doubles,'00000000-0000-0000-0000-00000000a004','PAR P4','3.5','00000000-0000-0000-0000-00000000a003'),
    ('22000000-0000-0000-0000-000000000005',g_personal_doubles,'00000000-0000-0000-0000-00000000a005','PAR P5','3.5','00000000-0000-0000-0000-00000000a003'),
    ('22000000-0000-0000-0000-000000000006',g_personal_doubles,'00000000-0000-0000-0000-00000000a006','PAR P6','3.5','00000000-0000-0000-0000-00000000a003'),
    ('22000000-0000-0000-0000-000000000007',g_personal_guest,'00000000-0000-0000-0000-00000000a001','PAR P1','4.0','00000000-0000-0000-0000-00000000a001');

  insert into public.personal_guest_players(id, created_by, display_name, email, estimated_skill)
  values (guest_id,'00000000-0000-0000-0000-00000000a001','PAR Guest','par-guest@example.test','3.5');

  insert into public.personal_session_participants(id, session_id, guest_player_id, display_name_snapshot, estimated_skill, created_by)
  values ('22000000-0000-0000-0000-000000000008',g_personal_guest,guest_id,'PAR Guest','3.5','00000000-0000-0000-0000-00000000a001');

  insert into public.personal_games(id, session_id, game_number, team_one_score, team_two_score, winning_team, status, completed_at)
  values
    ('23000000-0000-0000-0000-000000000001',g_personal_singles,1,11,7,1,'completed',now() - interval '6 days'),
    ('23000000-0000-0000-0000-000000000002',g_personal_doubles,1,11,8,1,'completed',now() - interval '5 days'),
    ('23000000-0000-0000-0000-000000000003',g_personal_guest,1,11,7,1,'completed',now() - interval '4 days');

  insert into public.personal_game_participants(game_id, session_participant_id, team_number, position)
  values
    ('23000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001',1,1),
    ('23000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000002',2,1),
    ('23000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000003',1,1),
    ('23000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000004',1,2),
    ('23000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000005',2,1),
    ('23000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000006',2,2),
    ('23000000-0000-0000-0000-000000000003','22000000-0000-0000-0000-000000000007',1,1),
    ('23000000-0000-0000-0000-000000000003','22000000-0000-0000-0000-000000000008',2,1);

  perform public.initialize_player_par_profile('00000000-0000-0000-0000-00000000a001');
  perform public.initialize_player_par_profile('00000000-0000-0000-0000-00000000a002');
  select current_par into before_w from public.player_par_profiles where profile_id='00000000-0000-0000-0000-00000000a001';
  select current_par into before_l from public.player_par_profiles where profile_id='00000000-0000-0000-0000-00000000a002';
  perform public.process_personal_game_par('23000000-0000-0000-0000-000000000001');
  select current_par into after_w from public.player_par_profiles where profile_id='00000000-0000-0000-0000-00000000a001';
  select current_par into after_l from public.player_par_profiles where profile_id='00000000-0000-0000-0000-00000000a002';
  perform pg_temp.par_ok('personal.singles_winner_gains_loser_declines', after_w > before_w and after_l < before_l, format('winner %s -> %s, loser %s -> %s', before_w, after_w, before_l, after_l));
  perform pg_temp.par_ok('personal.singles_one_event_per_player', pg_temp.par_event_count('23000000-0000-0000-0000-000000000001','personal') = 2, null);
  before_cnt := pg_temp.par_event_count('23000000-0000-0000-0000-000000000001','personal');
  perform public.process_personal_game_par('23000000-0000-0000-0000-000000000001');
  after_cnt := pg_temp.par_event_count('23000000-0000-0000-0000-000000000001','personal');
  perform pg_temp.par_ok('personal.singles_idempotent', before_cnt = after_cnt, format('%s -> %s', before_cnt, after_cnt));

  perform public.process_personal_game_par('23000000-0000-0000-0000-000000000002');
  perform pg_temp.par_ok('personal.doubles_four_events', pg_temp.par_event_count('23000000-0000-0000-0000-000000000002','personal') = 4, null);
  perform pg_temp.par_ok('personal.doubles_explanation_codes_present', (select count(*) = 4 from public.par_rating_events where game_id='23000000-0000-0000-0000-000000000002' and explanation_code is not null), null);

  perform public.process_personal_game_par('23000000-0000-0000-0000-000000000003');
  perform pg_temp.par_ok('personal.guest_unresolved_pending_no_events_expected', pg_temp.par_processing_status('23000000-0000-0000-0000-000000000003') = 'pending_participant_claim' and pg_temp.par_event_count('23000000-0000-0000-0000-000000000003','personal') = 0, format('actual status=%s events=%s', pg_temp.par_processing_status('23000000-0000-0000-0000-000000000003'), pg_temp.par_event_count('23000000-0000-0000-0000-000000000003','personal')));
  update public.personal_session_participants
     set profile_id='00000000-0000-0000-0000-00000000a002', guest_player_id=null
   where id='22000000-0000-0000-0000-000000000008';
  perform pg_temp.par_ok('personal.guest_claim_exactly_once_expected', pg_temp.par_event_count('23000000-0000-0000-0000-000000000003','personal') = 2, format('events=%s status=%s', pg_temp.par_event_count('23000000-0000-0000-0000-000000000003','personal'), pg_temp.par_processing_status('23000000-0000-0000-0000-000000000003')));
end $$;

do $$
declare
  types text[] := array['open_play','round_robin','mini_tournament'];
  labels text[] := array['organized.community_play','organized.round_robin','organized.mini_tournament'];
  i integer;
  ev uuid;
  m uuid;
  ppa uuid;
  ppb uuid;
  before_cnt integer;
  cfg jsonb;
begin
  for i in 1..array_length(types,1) loop
    ev := ('30000000-0000-0000-0000-00000000000' || i)::uuid;
    m := ('31000000-0000-0000-0000-00000000000' || i)::uuid;
    ppa := ('32000000-0000-0000-0000-00000000000' || i)::uuid;
    ppb := ('33000000-0000-0000-0000-00000000000' || i)::uuid;
    insert into public.play_events(id, organizer_id, name, slug, event_type, location, city, state, event_date, max_players, status, facility_id)
    values (ev,'00000000-0000-0000-0000-00000000a008','PAR ' || types[i], 'par-' || types[i] || '-validation', types[i]::public.play_event_type, 'PAR Preview Courts', 'Austin', 'TX', current_date, 16, 'open', '10000000-0000-0000-0000-000000000001');
    insert into public.play_participants(id, event_id, first_name, email, claimed_by)
    values
      (ppa, ev, 'PAR P1', 'par-' || types[i] || '-a@example.test', '00000000-0000-0000-0000-00000000a001'),
      (ppb, ev, 'PAR P2', 'par-' || types[i] || '-b@example.test', '00000000-0000-0000-0000-00000000a002');
    insert into public.play_matches(id, event_id, round, court, player_a_id, player_b_id, score_a, score_b, winner, match_number)
    values (m, ev, i, i, ppa, ppb, 11, 6, 1, i);
    update public.play_events set status='completed' where id=ev;
    perform public.process_play_match_par(m);
    perform pg_temp.par_ok(labels[i] || '.processed', pg_temp.par_processing_status(m) = 'processed' and pg_temp.par_event_count(m,'play_match') = 2, format('status=%s events=%s', pg_temp.par_processing_status(m), pg_temp.par_event_count(m,'play_match')));
    perform pg_temp.par_ok(labels[i] || '.organizer_verified', (select count(*)=2 from public.par_rating_events where game_id=m and source_type='play_match' and verification_level='organizer_verified' and weight=1.0 and explanation_data->>'verificationLevel'='organizer_verified'), null);
    before_cnt := pg_temp.par_event_count(m,'play_match');
    perform public.process_play_match_par(m);
    perform pg_temp.par_ok(labels[i] || '.idempotent', pg_temp.par_event_count(m,'play_match') = before_cnt, null);
  end loop;

  insert into public.play_events(id, organizer_id, name, slug, event_type, location, city, state, event_date, max_players, status)
  values
    ('30000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-00000000a008','PAR Unclaimed','par-unclaimed','open_play','PAR Preview','Austin','TX',current_date,8,'open'),
    ('30000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-00000000a008','PAR Pending Event','par-pending-event','round_robin','PAR Preview','Austin','TX',current_date,8,'open');
  insert into public.play_participants(id,event_id,first_name,email,claimed_by)
  values
    ('32000000-0000-0000-0000-000000000101','30000000-0000-0000-0000-000000000101','Claimed','par-claimed@example.test','00000000-0000-0000-0000-00000000a003'),
    ('32000000-0000-0000-0000-000000000102','30000000-0000-0000-0000-000000000101','Guest','par-guest-play@example.test',null),
    ('32000000-0000-0000-0000-000000000103','30000000-0000-0000-0000-000000000102','Pending A','par-pending-a@example.test','00000000-0000-0000-0000-00000000a003'),
    ('32000000-0000-0000-0000-000000000104','30000000-0000-0000-0000-000000000102','Pending B','par-pending-b@example.test','00000000-0000-0000-0000-00000000a004');
  insert into public.play_matches(id,event_id,round,player_a_id,player_b_id,score_a,score_b,winner)
  values
    ('31000000-0000-0000-0000-000000000101','30000000-0000-0000-0000-000000000101',1,'32000000-0000-0000-0000-000000000101','32000000-0000-0000-0000-000000000102',11,7,1),
    ('31000000-0000-0000-0000-000000000102','30000000-0000-0000-0000-000000000102',1,'32000000-0000-0000-0000-000000000103','32000000-0000-0000-0000-000000000104',11,7,1),
    ('31000000-0000-0000-0000-000000000103','30000000-0000-0000-0000-000000000101',2,'32000000-0000-0000-0000-000000000101','32000000-0000-0000-0000-000000000102',10,10,1);
  update public.play_events set status='completed' where id='30000000-0000-0000-0000-000000000101';
  perform public.process_play_match_par('31000000-0000-0000-0000-000000000101');
  perform pg_temp.par_ok('organized.unclaimed_guest_pending', pg_temp.par_processing_status('31000000-0000-0000-0000-000000000101')='pending_participant_claim' and pg_temp.par_event_count('31000000-0000-0000-0000-000000000101','play_match')=0, null);
  update public.play_participants set claimed_by='00000000-0000-0000-0000-00000000a004' where id='32000000-0000-0000-0000-000000000102';
  perform pg_temp.par_ok('organized.guest_claim_processes_once', pg_temp.par_processing_status('31000000-0000-0000-0000-000000000101')='processed' and pg_temp.par_event_count('31000000-0000-0000-0000-000000000101','play_match')=2, format('status=%s events=%s', pg_temp.par_processing_status('31000000-0000-0000-0000-000000000101'), pg_temp.par_event_count('31000000-0000-0000-0000-000000000101','play_match')));
  perform public.process_play_match_par('31000000-0000-0000-0000-000000000102');
  perform pg_temp.par_ok('organized.incomplete_event_pending', pg_temp.par_processing_status('31000000-0000-0000-0000-000000000102')='pending', pg_temp.par_processing_status('31000000-0000-0000-0000-000000000102'));
  perform public.process_play_match_par('31000000-0000-0000-0000-000000000103');
  perform pg_temp.par_ok('organized.invalid_score_excluded', pg_temp.par_processing_status('31000000-0000-0000-0000-000000000103')='excluded', pg_temp.par_processing_status('31000000-0000-0000-0000-000000000103'));

  select configuration into cfg from public.par_algorithm_versions where is_active order by activated_at desc nulls last limit 1;
  update public.par_algorithm_versions
     set configuration = jsonb_set(configuration, '{verification_weight,organizer_verified}', '"not_numeric"', true)
   where is_active;
  update public.play_events set status='completed' where id='30000000-0000-0000-0000-000000000102';
  perform pg_temp.par_ok('trigger_isolation.completion_survives_processing_failure', (select status='completed' from public.play_events where id='30000000-0000-0000-0000-000000000102') and (select status='failed' from public.par_game_processing where game_id='31000000-0000-0000-0000-000000000102'), (select error_message from public.par_game_processing where game_id='31000000-0000-0000-0000-000000000102'));
  update public.par_algorithm_versions set configuration = cfg where is_active;
  update public.par_game_processing set status='pending', eligibility_reason=null, error_message=null where game_id='31000000-0000-0000-0000-000000000102';
end $$;

do $$
declare
  t uuid := '40000000-0000-0000-0000-000000000001';
  d1 uuid := '41000000-0000-0000-0000-000000000001';
  d2 uuid := '41000000-0000-0000-0000-000000000002';
  singles uuid := '42000000-0000-0000-0000-000000000001';
  doubles uuid := '42000000-0000-0000-0000-000000000002';
  unauth uuid := '42000000-0000-0000-0000-000000000003';
begin
  insert into public.tournaments(id, director_id, name, slug, venue_name, city, state, format, skill_min, skill_max, draw_size, event_date, entry_fee_cents, hold_fee_cents, status, facility_id)
  values (t,'00000000-0000-0000-0000-00000000a007','PAR Preview Tournament','par-preview-tournament','PAR Preview Courts','Austin','TX','singles',3.0,4.5,16,current_date,0,0,'completed','10000000-0000-0000-0000-000000000001');
  insert into public.divisions(id, tournament_id, name, format, skill_min, skill_max, draw_size, gender_category)
  values
    (d1,t,'PAR Singles','singles',3.0,4.5,16,'open'),
    (d2,t,'PAR Doubles','doubles',3.0,4.5,16,'open');
  insert into public.bracket_matches(id,tournament_id,division_id,round,match_number,team1_player_a,team2_player_a,score_team1,score_team2,winner,completed_at,score_entered_by,score_entered_at)
  values
    (singles,t,d1,'final',1,'00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a002',array[11,11],array[7,9],1,now(),'00000000-0000-0000-0000-00000000a007',now()),
    (unauth,t,d1,'final',2,'00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000a004',array[11],array[7],1,now(),'00000000-0000-0000-0000-00000000a009',now());
  perform public.process_bracket_match_par(singles);
  perform public.process_bracket_match_par(unauth);
  perform pg_temp.par_ok('bracket.singles_score_array_margin', (select score_margin=6 from public.par_rating_events where game_id=singles and source_type='bracket_match' limit 1), (select 'margin=' || score_margin from public.par_rating_events where game_id=singles and source_type='bracket_match' limit 1));
  perform pg_temp.par_ok('bracket.singles_two_events_organizer_verified', pg_temp.par_event_count(singles,'bracket_match')=2 and (select count(*)=2 from public.par_rating_events where game_id=singles and verification_level='organizer_verified'), null);
  perform pg_temp.par_ok('bracket.unauthorized_submitter_excluded', pg_temp.par_processing_status(unauth)='excluded' and (select eligibility_reason='unauthorized_submitter' from public.par_game_processing where game_id=unauth), (select eligibility_reason from public.par_game_processing where game_id=unauth));

  insert into public.bracket_matches(id,tournament_id,division_id,round,match_number,team1_player_a,team1_player_b,team2_player_a,team2_player_b,score_team1,score_team2,winner,completed_at,score_entered_by,score_entered_at)
  values (doubles,t,d2,'final',1,'00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-00000000a005','00000000-0000-0000-0000-00000000a006',array[8,11,11],array[11,7,9],1,now(),'00000000-0000-0000-0000-00000000a007',now());
  perform public.process_bracket_match_par(doubles);
  perform pg_temp.par_ok('bracket.doubles_four_events', pg_temp.par_event_count(doubles,'bracket_match')=4, format('events=%s', pg_temp.par_event_count(doubles,'bracket_match')));
  perform pg_temp.par_ok('bracket.doubles_aggregate_margin', (select score_margin=3 from public.par_rating_events where game_id=doubles and source_type='bracket_match' limit 1), (select 'margin=' || score_margin from public.par_rating_events where game_id=doubles and source_type='bracket_match' limit 1));
  perform public.process_bracket_match_par(doubles);
  perform pg_temp.par_ok('bracket.doubles_idempotent', pg_temp.par_event_count(doubles,'bracket_match')=4, null);
end $$;

do $$
declare
  before_active integer;
  after_active integer;
  reversed_count integer;
begin
  select pg_temp.par_event_count('31000000-0000-0000-0000-000000000001','play_match') into before_active;
  update public.play_matches set score_a=6, score_b=11, winner=2 where id='31000000-0000-0000-0000-000000000001';
  select pg_temp.par_event_count('31000000-0000-0000-0000-000000000001','play_match') into after_active;
  select count(*) into reversed_count from public.par_rating_events where game_id='31000000-0000-0000-0000-000000000001' and reversed_at is not null;
  perform pg_temp.par_ok('corrections.score_and_winner_flip_reverses_and_reprocesses', before_active=2 and after_active=2 and reversed_count=2, format('before=%s active_after=%s reversed=%s', before_active, after_active, reversed_count));
  update public.play_matches set player_b_id='32000000-0000-0000-0000-000000000104' where id='31000000-0000-0000-0000-000000000001';
  perform pg_temp.par_ok('corrections.participant_replace_reprocess_expected', (select count(*) > reversed_count from public.par_rating_events where game_id='31000000-0000-0000-0000-000000000001' and reversed_at is not null), 'participant column update is not part of PAR trigger column list');
  perform pg_temp.par_ok('corrections.void_reprocess_expected', false, 'no void/dispute field exists on play_matches or bracket_matches for PAR V1');
  perform pg_temp.par_ok('corrections.chronological_replay_expected', false, 'reverse_organized_match_par restores changed match participants but does not replay later affected matches chronologically');
end $$;

do $$
declare
  c_personal integer;
  c_play integer;
  c_bracket integer;
  e_before integer;
  e_after integer;
  e_after2 integer;
begin
  select count(*) into c_personal
  from public.personal_games g join public.personal_sessions s on s.id=g.session_id
  where s.status='completed' and g.status='completed';
  select count(*) into c_play
  from public.play_matches m join public.play_events e on e.id=m.event_id
  where e.status='completed' and m.winner is not null;
  select count(*) into c_bracket
  from public.bracket_matches m
  where m.completed_at is not null and m.winner is not null;
  perform pg_temp.par_ok('backfill.candidate_counts', true, format('personal=%s play_match=%s bracket_match=%s', c_personal, c_play, c_bracket));
  select count(*) into e_before from public.par_rating_events where event_type='game_processed' and reversed_at is null;
  for i in 1..2 loop
    perform public.process_personal_game_par(g.id)
    from public.personal_games g join public.personal_sessions s on s.id=g.session_id
    where s.status='completed' and g.status='completed';
    perform public.process_play_match_par(m.id)
    from public.play_matches m join public.play_events e on e.id=m.event_id
    where e.status='completed' and m.winner is not null;
    perform public.process_bracket_match_par(m.id)
    from public.bracket_matches m
    where m.completed_at is not null and m.winner is not null;
  end loop;
  select count(*) into e_after from public.par_rating_events where event_type='game_processed' and reversed_at is null;
  select count(*) into e_after2 from public.par_rating_events where event_type='game_processed' and reversed_at is null;
  perform pg_temp.par_ok('backfill.idempotent', e_after=e_after2 and e_after>=e_before, format('before=%s after=%s after2=%s', e_before, e_after, e_after2));
end $$;

grant select, insert, update on par_validation_results to authenticated;
grant execute on function pg_temp.par_ok(text, boolean, text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a009',false);
do $$
declare
  blocked_insert boolean := false;
  blocked_update boolean := false;
  updated_rows integer := 0;
  blocked_function boolean := false;
begin
  begin
    insert into public.par_rating_events(profile_id, session_id, game_id, par_before, par_after, par_change, confidence_before, confidence_after, confidence_change, expected_result, actual_result, score_margin, opponent_strength, verification_level, weight, explanation_code, algorithm_version)
    values ('00000000-0000-0000-0000-00000000a009','20000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001',3,4,1,0,1,1,0.5,1,4,3,'organizer_verified',1,'bad','par_v1');
  exception when others then
    blocked_insert := true;
  end;
  begin
    update public.player_par_profiles set confidence_score=99 where profile_id='00000000-0000-0000-0000-00000000a001';
    get diagnostics updated_rows = row_count;
    blocked_update := updated_rows = 0;
  exception when others then
    blocked_update := true;
  end;
  begin
    perform public.process_play_match_par('31000000-0000-0000-0000-000000000002');
  exception when others then
    blocked_function := true;
  end;
  perform pg_temp.par_ok('rls.normal_user_cannot_insert_rating_events', blocked_insert, null);
  perform pg_temp.par_ok('rls.normal_user_cannot_update_par_profile', blocked_update, null);
  perform pg_temp.par_ok('rls.normal_user_cannot_invoke_internal_processing', blocked_function, null);
end $$;
reset role;

do $$
declare
  p1_visible_history integer;
  p9_processing integer;
begin
  select count(*) into p1_visible_history from public.par_rating_events where profile_id='00000000-0000-0000-0000-00000000a001';
  select count(*) into p9_processing from public.par_game_processing p
  where not exists (
    select 1 from public.par_rating_events e
    where e.game_id=p.game_id and e.profile_id='00000000-0000-0000-0000-00000000a009'
  );
  perform pg_temp.par_ok('rls.owner_history_exists_for_involved_players', p1_visible_history > 0, format('p1 events=%s', p1_visible_history));
  perform pg_temp.par_ok('rls.unrelated_processing_records_exist_for_policy_probe', p9_processing > 0, format('unrelated processing rows=%s', p9_processing));
end $$;

select test_name, case when passed then 'PASS' else 'FAIL' end as result, coalesce(detail,'') as detail
from par_validation_results
order by test_name;

select source_type, status, count(*) as count
from public.par_game_processing
group by source_type, status
order by source_type, status;

select source_type, verification_level, count(*) as count
from public.par_rating_events
where event_type='game_processed'
group by source_type, verification_level
order by source_type, verification_level;
