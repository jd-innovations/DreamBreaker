\set ON_ERROR_STOP on

create temp table par_phase4a_results (
  test_name text primary key,
  passed boolean not null,
  detail text
) on commit preserve rows;

create or replace function pg_temp.ok(p_name text, p_passed boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into par_phase4a_results(test_name, passed, detail)
  values (p_name, p_passed, p_detail)
  on conflict (test_name) do update set passed = excluded.passed, detail = excluded.detail;
end;
$$;

select set_config('app.par_replay_active', 'true', false);

do $$
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('10000000-0000-0000-0000-00000000a001','authenticated','authenticated','phase4a-p1@example.test',now(),'{}','{}',now(),now()),
    ('10000000-0000-0000-0000-00000000a002','authenticated','authenticated','phase4a-p2@example.test',now(),'{}','{}',now(),now()),
    ('10000000-0000-0000-0000-00000000a003','authenticated','authenticated','phase4a-p3@example.test',now(),'{}','{}',now(),now()),
    ('10000000-0000-0000-0000-00000000a004','authenticated','authenticated','phase4a-p4@example.test',now(),'{}','{}',now(),now()),
    ('10000000-0000-0000-0000-00000000a005','authenticated','authenticated','phase4a-p5@example.test',now(),'{}','{}',now(),now()),
    ('10000000-0000-0000-0000-00000000a006','authenticated','authenticated','phase4a-p6@example.test',now(),'{}','{}',now(),now()),
    ('10000000-0000-0000-0000-00000000a007','authenticated','authenticated','phase4a-director@example.test',now(),'{}','{}',now(),now()),
    ('10000000-0000-0000-0000-00000000a008','authenticated','authenticated','phase4a-organizer@example.test',now(),'{}','{}',now(),now())
  on conflict (id) do nothing;

  insert into public.profiles(id, email, full_name, role, skill_level, self_rating, is_director, director_status)
  values
    ('10000000-0000-0000-0000-00000000a001','phase4a-p1@example.test','Phase4A P1','player','3.5-4.0','4.0',false,null),
    ('10000000-0000-0000-0000-00000000a002','phase4a-p2@example.test','Phase4A P2','player','3.5-4.0','3.5',false,null),
    ('10000000-0000-0000-0000-00000000a003','phase4a-p3@example.test','Phase4A P3','player','3.5-4.0','3.5',false,null),
    ('10000000-0000-0000-0000-00000000a004','phase4a-p4@example.test','Phase4A P4','player','3.5-4.0','3.5',false,null),
    ('10000000-0000-0000-0000-00000000a005','phase4a-p5@example.test','Phase4A P5','player','3.5-4.0','3.5',false,null),
    ('10000000-0000-0000-0000-00000000a006','phase4a-p6@example.test','Phase4A P6','player','3.5-4.0','3.5',false,null),
    ('10000000-0000-0000-0000-00000000a007','phase4a-director@example.test','Phase4A Director','director','4.0-4.5','4.0',true,'approved'),
    ('10000000-0000-0000-0000-00000000a008','phase4a-organizer@example.test','Phase4A Organizer','player_director','4.0-4.5','4.0',true,'approved')
  on conflict (id) do nothing;

  insert into public.facilities(id, name, slug, address, city, state, postal_code, latitude, longitude, verified, court_count, created_by)
  values ('11000000-0000-0000-0000-000000000001','Phase4A Replay Courts','phase4a-replay-courts','4 Replay Way','Austin','TX','78701',30.2672,-97.7431,true,8,'10000000-0000-0000-0000-00000000a007')
  on conflict (id) do nothing;
end $$;

do $$
begin
  insert into public.personal_sessions(id, created_by, facility_id, played_at, format, status, indoor_outdoor, completed_at)
  values
    ('12000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000a001','11000000-0000-0000-0000-000000000001','2026-07-01 09:00+00','singles','completed','outdoor','2026-07-01 10:00+00'),
    ('12000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-00000000a001','11000000-0000-0000-0000-000000000001','2026-07-05 09:00+00','singles','completed','outdoor','2026-07-05 10:00+00');
  insert into public.personal_guest_players(id, created_by, display_name, email, estimated_skill)
  values ('12100000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000a001','Phase4A Guest','phase4a-guest@example.test','3.5');
  insert into public.personal_session_participants(id, session_id, profile_id, display_name_snapshot, estimated_skill, created_by)
  values
    ('12200000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000a001','Phase4A P1','4.0','10000000-0000-0000-0000-00000000a001'),
    ('12200000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000a002','Phase4A P2','3.5','10000000-0000-0000-0000-00000000a001'),
    ('12200000-0000-0000-0000-000000000003','12000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-00000000a001','Phase4A P1','4.0','10000000-0000-0000-0000-00000000a001');
  insert into public.personal_session_participants(id, session_id, guest_player_id, display_name_snapshot, estimated_skill, created_by)
  values ('12200000-0000-0000-0000-000000000004','12000000-0000-0000-0000-000000000002','12100000-0000-0000-0000-000000000001','Phase4A Guest','3.5','10000000-0000-0000-0000-00000000a001');
  insert into public.personal_games(id, session_id, game_number, team_one_score, team_two_score, winning_team, status, completed_at)
  values
    ('12300000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001',1,11,7,1,'completed','2026-07-01 10:00+00'),
    ('12300000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000002',1,11,9,1,'completed','2026-07-05 10:00+00');
  insert into public.personal_game_participants(game_id, session_participant_id, team_number, position)
  values
    ('12300000-0000-0000-0000-000000000001','12200000-0000-0000-0000-000000000001',1,1),
    ('12300000-0000-0000-0000-000000000001','12200000-0000-0000-0000-000000000002',2,1),
    ('12300000-0000-0000-0000-000000000002','12200000-0000-0000-0000-000000000003',1,1),
    ('12300000-0000-0000-0000-000000000002','12200000-0000-0000-0000-000000000004',2,1);
end $$;

do $$
begin
  insert into public.play_events(id, organizer_id, name, slug, event_type, location, city, state, event_date, start_time, max_players, status, facility_id)
  values
    ('13000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000a008','Phase4A Community','phase4a-community','open_play','Phase4A Courts','Austin','TX','2026-07-02','09:00',16,'open','11000000-0000-0000-0000-000000000001'),
    ('13000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-00000000a008','Phase4A Round Robin','phase4a-round-robin','round_robin','Phase4A Courts','Austin','TX','2026-07-03','09:00',16,'open','11000000-0000-0000-0000-000000000001'),
    ('13000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-00000000a008','Phase4A Mini','phase4a-mini','mini_tournament','Phase4A Courts','Austin','TX','2026-07-04','09:00',16,'open','11000000-0000-0000-0000-000000000001');
  insert into public.play_participants(id,event_id,first_name,email,claimed_by)
  values
    ('13100000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','P1','phase4a-c1@example.test','10000000-0000-0000-0000-00000000a001'),
    ('13100000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000001','P2','phase4a-c2@example.test','10000000-0000-0000-0000-00000000a002'),
    ('13100000-0000-0000-0000-000000000003','13000000-0000-0000-0000-000000000001','P3','phase4a-c3@example.test','10000000-0000-0000-0000-00000000a003'),
    ('13100000-0000-0000-0000-000000000004','13000000-0000-0000-0000-000000000002','P1','phase4a-r1@example.test','10000000-0000-0000-0000-00000000a001'),
    ('13100000-0000-0000-0000-000000000005','13000000-0000-0000-0000-000000000002','P3','phase4a-r3@example.test','10000000-0000-0000-0000-00000000a003'),
    ('13100000-0000-0000-0000-000000000006','13000000-0000-0000-0000-000000000003','P1','phase4a-m1@example.test','10000000-0000-0000-0000-00000000a001'),
    ('13100000-0000-0000-0000-000000000007','13000000-0000-0000-0000-000000000003','P4','phase4a-m4@example.test','10000000-0000-0000-0000-00000000a004');
  insert into public.play_matches(id,event_id,round,match_number,player_a_id,player_b_id,score_a,score_b,winner)
  values
    ('13200000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001',1,1,'13100000-0000-0000-0000-000000000001','13100000-0000-0000-0000-000000000002',11,6,1),
    ('13200000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000002',1,1,'13100000-0000-0000-0000-000000000004','13100000-0000-0000-0000-000000000005',8,11,2),
    ('13200000-0000-0000-0000-000000000003','13000000-0000-0000-0000-000000000003',1,1,'13100000-0000-0000-0000-000000000006','13100000-0000-0000-0000-000000000007',11,9,1);
  update public.play_events set status='completed' where id in ('13000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000003');
end $$;

do $$
begin
  insert into public.tournaments(id, director_id, name, slug, venue_name, city, state, format, skill_min, skill_max, draw_size, event_date, entry_fee_cents, hold_fee_cents, status, facility_id)
  values ('14000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000a007','Phase4A Tournament','phase4a-tournament','Phase4A Courts','Austin','TX','singles',3.0,4.5,16,'2026-07-06',0,0,'completed','11000000-0000-0000-0000-000000000001');
  insert into public.divisions(id,tournament_id,name,format,skill_min,skill_max,draw_size,gender_category)
  values ('14100000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','Phase4A Singles','singles',3.0,4.5,16,'open');
  insert into public.bracket_matches(id,tournament_id,division_id,round,match_number,team1_player_a,team2_player_a,score_team1,score_team2,winner,completed_at,score_entered_by,score_entered_at)
  values ('14200000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','14100000-0000-0000-0000-000000000001','final',1,'10000000-0000-0000-0000-00000000a001','10000000-0000-0000-0000-00000000a005',array[11,11],array[7,9],1,'2026-07-06 10:00+00','10000000-0000-0000-0000-00000000a007','2026-07-06 10:00+00');
end $$;

select set_config('app.par_replay_active', 'false', false);

do $$
declare
  job1 public.par_replay_jobs;
  job2 public.par_replay_jobs;
  p1_before numeric;
  p1_after numeric;
  p2_events integer;
  p3_events integer;
  gap_count integer;
  final_mismatch integer;
  active_before integer;
  active_after integer;
  excluded_status text;
begin
  job1 := public.par_replay_all('phase4a_initial_replay');
  perform pg_temp.ok('replay.job_completed', job1.status='completed' and job1.generation > 0, format('generation=%s status=%s', job1.generation, job1.status));

  select count(*) into gap_count
  from (
    select profile_id, par_before, lag(par_after) over (partition by profile_id order by event_occurred_at, processed_at, id) as prev_after
    from public.par_rating_events
    where generation=job1.generation and event_type='game_processed' and reversed_at is null
  ) q
  where prev_after is not null and par_before <> prev_after;
  perform pg_temp.ok('replay.timeline_continuity_initial', gap_count=0, format('gaps=%s', gap_count));

  select count(*) into final_mismatch
  from public.player_par_profiles p
  left join lateral (
    select e.par_after from public.par_rating_events e
    where e.profile_id=p.profile_id and e.generation=job1.generation and e.event_type='game_processed' and e.reversed_at is null
    order by e.event_occurred_at desc, e.processed_at desc, e.id desc limit 1
  ) last_event on true
  where coalesce(last_event.par_after, p.initial_par) <> p.current_par;
  perform pg_temp.ok('replay.current_profile_equals_timeline_initial', final_mismatch=0, format('mismatches=%s', final_mismatch));

  select current_par into p1_before from public.player_par_profiles where profile_id='10000000-0000-0000-0000-00000000a001';
  update public.play_matches
     set player_b_id='13100000-0000-0000-0000-000000000003'
   where id='13200000-0000-0000-0000-000000000001';
  select current_par into p1_after from public.player_par_profiles where profile_id='10000000-0000-0000-0000-00000000a001';
  select count(*) into p2_events from public.par_rating_events where game_id='13200000-0000-0000-0000-000000000001' and profile_id='10000000-0000-0000-0000-00000000a002' and event_type='game_processed' and reversed_at is null;
  select count(*) into p3_events from public.par_rating_events where game_id='13200000-0000-0000-0000-000000000001' and profile_id='10000000-0000-0000-0000-00000000a003' and event_type='game_processed' and reversed_at is null;
  perform pg_temp.ok('correction.participant_replacement_replayed', p2_events=0 and p3_events=1 and p1_after is not null, format('p2_active=%s p3_active=%s p1 %s -> %s', p2_events, p3_events, p1_before, p1_after));

  update public.play_matches
     set par_review_status='voided', par_review_reason='phase4a void test', par_review_updated_at=now()
   where id='13200000-0000-0000-0000-000000000002';
  select status into excluded_status from public.par_game_processing where game_id='13200000-0000-0000-0000-000000000002';
  perform pg_temp.ok('correction.void_excludes_and_replays', excluded_status='excluded' and not exists (
    select 1 from public.par_rating_events where game_id='13200000-0000-0000-0000-000000000002' and reversed_at is null and event_type='game_processed'
  ), format('status=%s', excluded_status));

  update public.bracket_matches
     set par_review_status='disputed_pending', par_review_reason='phase4a dispute pending', par_review_updated_at=now()
   where id='14200000-0000-0000-0000-000000000001';
  perform pg_temp.ok('dispute.pending_excludes', (select status='excluded' from public.par_game_processing where game_id='14200000-0000-0000-0000-000000000001'), (select eligibility_reason from public.par_game_processing where game_id='14200000-0000-0000-0000-000000000001'));

  update public.bracket_matches
     set par_review_status='dispute_rejected', par_review_reason='phase4a dispute rejected', par_review_updated_at=now()
   where id='14200000-0000-0000-0000-000000000001';
  perform pg_temp.ok('dispute.rejected_restores_eligibility', (select status='processed' from public.par_game_processing where game_id='14200000-0000-0000-0000-000000000001') and exists (
    select 1 from public.par_rating_events where game_id='14200000-0000-0000-0000-000000000001' and source_type='bracket_match' and event_type='game_processed' and reversed_at is null
  ), null);

  update public.bracket_matches
     set par_review_status='dispute_accepted', par_review_reason='phase4a dispute accepted', par_review_updated_at=now()
   where id='14200000-0000-0000-0000-000000000001';
  perform pg_temp.ok('dispute.accepted_excludes_again', (select status='excluded' from public.par_game_processing where game_id='14200000-0000-0000-0000-000000000001') and not exists (
    select 1 from public.par_rating_events where game_id='14200000-0000-0000-0000-000000000001' and source_type='bracket_match' and event_type='game_processed' and reversed_at is null
  ), null);

  update public.personal_session_participants
     set profile_id='10000000-0000-0000-0000-00000000a002', guest_player_id=null
   where id='12200000-0000-0000-0000-000000000004';
  perform pg_temp.ok('guest_claim.identity_change_replays', exists (
    select 1 from public.par_rating_events
    where game_id='12300000-0000-0000-0000-000000000002'
      and profile_id='10000000-0000-0000-0000-00000000a002'
      and event_type='game_processed'
      and reversed_at is null
  ), null);

  select count(*) into active_before from public.par_rating_events where event_type='game_processed' and reversed_at is null;
  job2 := public.par_replay_all('phase4a_repeat_replay');
  select count(*) into active_after from public.par_rating_events where event_type='game_processed' and reversed_at is null;
  perform pg_temp.ok('replay.repeat_idempotent_active_count', active_before=active_after, format('%s -> %s generation=%s', active_before, active_after, job2.generation));

  select count(*) into gap_count
  from (
    select profile_id, par_before, lag(par_after) over (partition by profile_id order by event_occurred_at, processed_at, id) as prev_after
    from public.par_rating_events
    where generation=job2.generation and event_type='game_processed' and reversed_at is null
  ) q
  where prev_after is not null and par_before <> prev_after;
  perform pg_temp.ok('replay.timeline_continuity_after_corrections', gap_count=0, format('gaps=%s', gap_count));

  select count(*) into final_mismatch
  from public.player_par_profiles p
  left join lateral (
    select e.par_after from public.par_rating_events e
    where e.profile_id=p.profile_id and e.generation=job2.generation and e.event_type='game_processed' and e.reversed_at is null
    order by e.event_occurred_at desc, e.processed_at desc, e.id desc limit 1
  ) last_event on true
  where coalesce(last_event.par_after, p.initial_par) <> p.current_par;
  perform pg_temp.ok('replay.current_profile_equals_timeline_final', final_mismatch=0, format('mismatches=%s', final_mismatch));
end $$;

select test_name, case when passed then 'PASS' else 'FAIL' end as result, coalesce(detail,'') as detail
from par_phase4a_results
order by test_name;

select generation, status, reason, started_at, completed_at, error
from public.par_replay_jobs
order by generation;

select source_type, status, eligibility_reason, count(*)
from public.par_game_processing
group by source_type, status, eligibility_reason
order by source_type, status, eligibility_reason;
