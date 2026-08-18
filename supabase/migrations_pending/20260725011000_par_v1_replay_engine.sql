-- PAR Phase 4A: deterministic replay engine.
-- Adds replay generations/jobs and makes corrections converge by replaying the
-- canonical source timeline without changing PAR math or source weighting.

create or replace function public.par_current_generation()
returns bigint language sql stable as $$
  select coalesce(nullif(current_setting('app.par_generation', true), '')::bigint, 0);
$$;

alter table public.player_par_profiles
  add column if not exists current_generation bigint not null default 0;

alter table public.par_rating_events
  add column if not exists generation bigint not null default public.par_current_generation(),
  add column if not exists event_occurred_at timestamptz,
  add column if not exists replay_job_id uuid,
  add column if not exists superseded_reason text;

create table if not exists public.par_replay_jobs (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  generation bigint not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint par_replay_jobs_status check (status in ('running','completed','failed'))
);

create unique index if not exists uq_par_replay_jobs_generation on public.par_replay_jobs(generation);
create index if not exists idx_par_rating_events_generation on public.par_rating_events(generation, event_occurred_at);
create index if not exists idx_par_rating_events_replay_job on public.par_rating_events(replay_job_id);

alter table public.par_rating_events
  drop constraint if exists par_rating_events_replay_job_id_fkey,
  add constraint par_rating_events_replay_job_id_fkey
    foreign key (replay_job_id) references public.par_replay_jobs(id) on delete set null;

alter table public.personal_games
  add column if not exists par_review_status text not null default 'valid',
  add column if not exists par_review_reason text,
  add column if not exists par_review_updated_at timestamptz;
alter table public.play_matches
  add column if not exists par_review_status text not null default 'valid',
  add column if not exists par_review_reason text,
  add column if not exists par_review_updated_at timestamptz;
alter table public.bracket_matches
  add column if not exists par_review_status text not null default 'valid',
  add column if not exists par_review_reason text,
  add column if not exists par_review_updated_at timestamptz;

alter table public.personal_games
  drop constraint if exists personal_games_par_review_status,
  add constraint personal_games_par_review_status
    check (par_review_status in ('valid','voided','disputed_pending','dispute_rejected','dispute_accepted'));
alter table public.play_matches
  drop constraint if exists play_matches_par_review_status,
  add constraint play_matches_par_review_status
    check (par_review_status in ('valid','voided','disputed_pending','dispute_rejected','dispute_accepted'));
alter table public.bracket_matches
  drop constraint if exists bracket_matches_par_review_status,
  add constraint bracket_matches_par_review_status
    check (par_review_status in ('valid','voided','disputed_pending','dispute_rejected','dispute_accepted'));

create or replace function public.par_review_is_eligible(p_status text)
returns boolean language sql immutable as $$
  select coalesce(p_status, 'valid') in ('valid','dispute_rejected');
$$;

create or replace function public.par_source_timestamp(p_source_type text, p_game_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case p_source_type
    when 'personal' then (
      select s.played_at + (g.game_number * interval '1 millisecond')
      from public.personal_games g join public.personal_sessions s on s.id = g.session_id
      where g.id = p_game_id
    )
    when 'play_match' then (
      select (e.event_date::timestamptz
              + coalesce(e.start_time, time '00:00')::interval
              + (coalesce(m.round,0) * interval '1 minute')
              + (coalesce(m.match_number,0) * interval '1 millisecond'))
      from public.play_matches m join public.play_events e on e.id = m.event_id
      where m.id = p_game_id
    )
    when 'bracket_match' then (
      select coalesce(m.completed_at, m.score_entered_at, m.scheduled_at, t.event_date::timestamptz)
             + (coalesce(m.match_number,0) * interval '1 millisecond')
      from public.bracket_matches m join public.tournaments t on t.id = m.tournament_id
      where m.id = p_game_id
    )
  end;
$$;

create or replace function public.par_record_excluded_source(
  p_source_type text,
  p_game_id uuid,
  p_session_id uuid,
  p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare v_algo text;
begin
  select version into v_algo from public.par_algorithm_versions where is_active order by activated_at desc nulls last limit 1;
  insert into public.par_game_processing (
    game_id, source_type, session_id, status, eligibility_reason,
    verification_level, algorithm_version, processed_at, last_evaluated_at, error_message
  ) values (
    p_game_id, p_source_type, p_session_id, 'excluded', p_reason,
    'excluded', v_algo, null, now(), null
  )
  on conflict (game_id) do update set
    source_type = excluded.source_type,
    session_id = excluded.session_id,
    status = 'excluded',
    eligibility_reason = excluded.eligibility_reason,
    verification_level = 'excluded',
    algorithm_version = excluded.algorithm_version,
    processed_at = null,
    last_evaluated_at = now(),
    error_message = null;
end;
$$;

create or replace function public.par_replay_all(p_reason text default 'replay')
returns public.par_replay_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.par_replay_jobs;
  v_generation bigint;
  v_row record;
  v_failures integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('dreambreaker.par_replay_all'));

  v_generation := greatest(
    coalesce((select max(current_generation) from public.player_par_profiles), 0),
    coalesce((select max(generation) from public.par_rating_events), 0),
    coalesce((select max(generation) from public.par_replay_jobs), 0)
  ) + 1;

  insert into public.par_replay_jobs(reason, generation, status)
  values (coalesce(p_reason, 'replay'), v_generation, 'running')
  returning * into v_job;

  perform set_config('app.par_generation', v_generation::text, true);
  perform set_config('app.par_replay_active', 'true', true);
  perform set_config('request.jwt.claim.sub', '', true);

  update public.par_rating_events
     set reversed_at = coalesce(reversed_at, now()),
         superseded_reason = coalesce(superseded_reason, coalesce(p_reason, 'replay'))
   where event_type = 'game_processed'
     and reversed_at is null;

  update public.player_par_profiles
     set current_par = initial_par,
         confidence_score = 0,
         confidence_band = 'low',
         eligible_games_count = 0,
         last_processed_game_id = null,
         last_rated_at = null,
         current_generation = v_generation;

  update public.par_game_processing
     set status = case when status in ('processed','reversed','failed','eligible','processing') then 'pending' else status end,
         processed_at = null,
         error_message = null,
         last_evaluated_at = now()
   where status in ('processed','reversed','failed','eligible','processing');

  for v_row in
    select *
    from (
      select 'personal'::text as source_type, g.id as game_id, g.session_id,
             public.par_source_timestamp('personal', g.id) as occurred_at,
             g.game_number as seq,
             g.par_review_status
        from public.personal_games g
        join public.personal_sessions s on s.id = g.session_id
       where g.status = 'completed' and s.status = 'completed'
      union all
      select 'play_match', m.id, m.event_id,
             public.par_source_timestamp('play_match', m.id),
             coalesce(m.match_number, m.round, 0),
             m.par_review_status
        from public.play_matches m
        join public.play_events e on e.id = m.event_id
       where e.status = 'completed' and m.winner is not null
      union all
      select 'bracket_match', m.id, m.tournament_id,
             public.par_source_timestamp('bracket_match', m.id),
             coalesce(m.match_number, 0),
             m.par_review_status
        from public.bracket_matches m
       where m.completed_at is not null and m.winner is not null
    ) unified
    order by occurred_at nulls last, source_type, seq nulls last, game_id
  loop
    begin
      if not public.par_review_is_eligible(v_row.par_review_status) then
        perform public.par_record_excluded_source(
          v_row.source_type, v_row.game_id, v_row.session_id, v_row.par_review_status
        );
      elsif v_row.source_type = 'personal' then
        perform public.process_personal_game_par(v_row.game_id);
      elsif v_row.source_type = 'play_match' then
        perform public.process_play_match_par(v_row.game_id);
      else
        perform public.process_bracket_match_par(v_row.game_id);
      end if;

      update public.par_rating_events
         set generation = v_generation,
             event_occurred_at = coalesce(event_occurred_at, v_row.occurred_at),
             replay_job_id = v_job.id,
             superseded_reason = null
       where game_id = v_row.game_id
         and source_type = v_row.source_type
         and generation = v_generation
         and event_type = 'game_processed'
         and reversed_at is null;
    exception when others then
      insert into public.par_game_processing (game_id, source_type, session_id, status, eligibility_reason, error_message, last_evaluated_at)
      values (v_row.game_id, v_row.source_type, v_row.session_id, 'failed', 'processing_failed', sqlerrm, now())
      on conflict (game_id) do update set
        source_type = excluded.source_type,
        session_id = excluded.session_id,
        status = 'failed',
        eligibility_reason = 'processing_failed',
        error_message = sqlerrm,
        last_evaluated_at = now();
      v_failures := v_failures + 1;
    end;
  end loop;

  update public.player_par_profiles p
     set current_generation = v_generation
   where exists (
     select 1 from public.par_rating_events e
     where e.profile_id = p.profile_id
       and e.generation = v_generation
       and e.event_type = 'game_processed'
       and e.reversed_at is null
   );

  update public.par_replay_jobs
     set status = case when v_failures > 0 then 'failed' else 'completed' end,
         error = case when v_failures > 0 then format('%s source rows failed during replay', v_failures) else null end,
         completed_at = now(),
         updated_at = now()
   where id = v_job.id
   returning * into v_job;

  perform set_config('app.par_replay_active', 'false', true);
  return v_job;
exception when others then
  perform set_config('app.par_replay_active', 'false', true);
  if v_job.id is not null then
    update public.par_replay_jobs
       set status = 'failed', error = sqlerrm, completed_at = now(), updated_at = now()
     where id = v_job.id;
  end if;
  raise;
end;
$$;

create or replace function public.par_request_replay(p_reason text default 'source_corrected')
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.par_replay_active', true), '') = 'true' then
    return;
  end if;
  perform public.par_replay_all(coalesce(p_reason, 'source_corrected'));
end;
$$;

create or replace function public.try_process_personal_session_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from new.status then
    perform public.par_request_replay('personal_session_completed');
  end if;
  return new;
end;
$$;

create or replace function public.try_process_personal_claimed_participant_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and (old.profile_id is distinct from new.profile_id or old.guest_player_id is distinct from new.guest_player_id) then
    perform public.par_request_replay('personal_participant_identity_changed');
  end if;
  return new;
end;
$$;

create or replace function public.try_replay_personal_game_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (
    old.team_one_score is distinct from new.team_one_score or
    old.team_two_score is distinct from new.team_two_score or
    old.winning_team is distinct from new.winning_team or
    old.status is distinct from new.status or
    old.par_review_status is distinct from new.par_review_status
  ) then
    perform public.par_request_replay('personal_game_corrected');
  end if;
  return new;
end;
$$;

create or replace function public.try_replay_personal_game_participant_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (
    old.session_participant_id is distinct from new.session_participant_id or
    old.team_number is distinct from new.team_number or
    old.position is distinct from new.position
  ) then
    perform public.par_request_replay('personal_participant_replaced');
  end if;
  return new;
end;
$$;

create or replace function public.try_process_play_event_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from new.status then
    perform public.par_request_replay('play_event_completed');
  end if;
  return new;
end;
$$;

create or replace function public.try_process_play_match_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (
    old.winner is distinct from new.winner or
    old.score_a is distinct from new.score_a or
    old.score_b is distinct from new.score_b or
    old.player_a_id is distinct from new.player_a_id or
    old.player_a2_id is distinct from new.player_a2_id or
    old.player_b_id is distinct from new.player_b_id or
    old.player_b2_id is distinct from new.player_b2_id or
    old.par_review_status is distinct from new.par_review_status
  ) then
    perform public.par_request_replay('play_match_corrected');
  end if;
  return new;
end;
$$;

create or replace function public.try_process_bracket_match_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (
    old.winner is distinct from new.winner or
    old.completed_at is distinct from new.completed_at or
    old.score_entered_at is distinct from new.score_entered_at or
    old.score_team1 is distinct from new.score_team1 or
    old.score_team2 is distinct from new.score_team2 or
    old.team1_player_a is distinct from new.team1_player_a or
    old.team1_player_b is distinct from new.team1_player_b or
    old.team2_player_a is distinct from new.team2_player_a or
    old.team2_player_b is distinct from new.team2_player_b or
    old.par_review_status is distinct from new.par_review_status
  ) then
    perform public.par_request_replay('bracket_match_corrected');
  end if;
  return new;
end;
$$;

create or replace function public.try_process_play_participant_claim_par()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.claimed_by is distinct from new.claimed_by then
    perform public.par_request_replay('play_participant_identity_changed');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_personal_games_replay_par on public.personal_games;
create trigger trg_personal_games_replay_par
  after update of team_one_score, team_two_score, winning_team, status, par_review_status
  on public.personal_games
  for each row execute function public.try_replay_personal_game_par();

drop trigger if exists trg_personal_game_participants_replay_par on public.personal_game_participants;
create trigger trg_personal_game_participants_replay_par
  after update of session_participant_id, team_number, position
  on public.personal_game_participants
  for each row execute function public.try_replay_personal_game_participant_par();

drop trigger if exists trg_play_matches_process_par on public.play_matches;
create trigger trg_play_matches_process_par
  after update of winner, score_a, score_b, player_a_id, player_a2_id, player_b_id, player_b2_id, par_review_status
  on public.play_matches
  for each row execute function public.try_process_play_match_par();

drop trigger if exists trg_bracket_matches_process_par on public.bracket_matches;
create trigger trg_bracket_matches_process_par
  after update of winner, completed_at, score_entered_at, score_team1, score_team2,
                  team1_player_a, team1_player_b, team2_player_a, team2_player_b, par_review_status
  on public.bracket_matches
  for each row execute function public.try_process_bracket_match_par();

alter table public.par_replay_jobs enable row level security;
drop policy if exists "par_replay_jobs: admin read" on public.par_replay_jobs;
create policy "par_replay_jobs: admin read"
  on public.par_replay_jobs for select
  using (public.is_admin());

revoke all on table public.par_replay_jobs from anon, authenticated;
grant all on table public.par_replay_jobs to service_role;
revoke all on function public.par_replay_all(text) from public, anon, authenticated;
revoke all on function public.par_request_replay(text) from public, anon, authenticated;
revoke all on function public.par_record_excluded_source(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.par_current_generation() from public, anon, authenticated;


revoke insert, update, delete, truncate on table public.par_algorithm_versions from anon, authenticated;
grant select on table public.par_algorithm_versions to anon, authenticated;
