-- 3rd-place (bronze) match between the semifinal losers (owner, 2026-09-28).
--
-- round_label already had 'bronze' and fn_round_order already ranks it between
-- the semifinals and the final. What was missing is a loser link: matches only
-- said where their WINNER goes. Now a semifinal also says where its LOSER goes.
--
--   * bracket_matches.loser_next_match_id / loser_next_match_slot
--   * record_match_score: places the loser, as it places the winner.
--   * Score corrections: a semifinal whose winner changes puts its new loser in
--     the 3rd-place match, and a 3rd-place match already played on that path is
--     cleared like any other downstream result (fn_score_correction_cascade and
--     correct_match_score; preview counts it).
--   * add_third_place_match: adds one to a bracket built before this, keeping
--     every score (the demo tournament's brackets).
--
-- New brackets get the match from the shared builder
-- (packages/shared/src/bracketBuild.ts) when both semifinals will have two real
-- teams. Readiness and courts need nothing new: a match is ready once both
-- teams are known (trg_bracket_match_ready_at) and the queue already orders
-- bronze before the final.

alter table public.bracket_matches
  add column if not exists loser_next_match_id uuid references public.bracket_matches(id) on delete set null,
  add column if not exists loser_next_match_slot smallint;

alter table public.bracket_matches
  drop constraint if exists bracket_matches_loser_next_slot_valid,
  add constraint bracket_matches_loser_next_slot_valid
    check ((loser_next_match_id is null and loser_next_match_slot is null)
        or (loser_next_match_id is not null and loser_next_match_slot in (1, 2)));

comment on column public.bracket_matches.loser_next_match_id is
  'Semifinals only: the 3rd-place match this match''s loser plays in. Null elsewhere.';

-- ─── Recording a score places the loser too ─────────────────────────────────

create or replace function public.record_match_score(
  p_match_id uuid,
  p_score1   integer,
  p_score2   integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor    uuid := auth.uid();
  v_m        public.bracket_matches;
  v_t        public.tournaments;
  v_hi       integer;
  v_lo       integer;
  v_winner   integer;
  w_pa uuid; w_pb uuid; w_ga uuid; w_gb uuid;
  l_pa uuid; l_pb uuid; l_ga uuid; l_gb uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_m from public.bracket_matches where id = p_match_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;

  select * into v_t from public.tournaments where id = v_m.tournament_id;
  if not (public.is_admin() or (v_t.director_id = v_actor and public.is_approved_director())) then
    raise exception 'not_allowed' using errcode = 'P0003';
  end if;

  if v_t.status = 'cancelled' then
    raise exception 'tournament_cancelled' using errcode = 'P0007';
  end if;

  v_hi := greatest(p_score1, p_score2);
  v_lo := least(p_score1, p_score2);
  if p_score1 is null or p_score2 is null or p_score1 < 0 or p_score2 < 0
     or p_score1 = p_score2 or v_hi < 11 or v_hi - v_lo < 2 then
    raise exception 'invalid_score' using errcode = 'P0006';
  end if;
  v_winner := case when p_score1 > p_score2 then 1 else 2 end;

  if v_m.completed_at is not null then
    if v_m.score_team1 = array[p_score1] and v_m.score_team2 = array[p_score2] then
      return jsonb_build_object('ok', true, 'already', true, 'winner', v_m.winner);
    end if;
    raise exception 'already_scored' using errcode = 'P0008';
  end if;

  if (v_m.team1_player_a is null and v_m.team1_guest_a is null)
     or (v_m.team2_player_a is null and v_m.team2_guest_a is null) then
    raise exception 'teams_not_set' using errcode = 'P0009';
  end if;

  update public.bracket_matches
     set score_team1 = array[p_score1],
         score_team2 = array[p_score2],
         winner = v_winner,
         completed_at = now(),
         score_entered_by = v_actor,
         score_entered_at = now(),
         updated_at = now()
   where id = p_match_id;

  if v_winner = 1 then
    w_pa := v_m.team1_player_a; w_pb := v_m.team1_player_b; w_ga := v_m.team1_guest_a; w_gb := v_m.team1_guest_b;
    l_pa := v_m.team2_player_a; l_pb := v_m.team2_player_b; l_ga := v_m.team2_guest_a; l_gb := v_m.team2_guest_b;
  else
    w_pa := v_m.team2_player_a; w_pb := v_m.team2_player_b; w_ga := v_m.team2_guest_a; w_gb := v_m.team2_guest_b;
    l_pa := v_m.team1_player_a; l_pb := v_m.team1_player_b; l_ga := v_m.team1_guest_a; l_gb := v_m.team1_guest_b;
  end if;

  -- The winner moves on. Pool matches have no next match.
  if v_m.next_match_id is not null and v_m.next_match_slot is not null then
    if v_m.next_match_slot = 1 then
      update public.bracket_matches
         set team1_player_a = w_pa, team1_player_b = w_pb, team1_guest_a = w_ga, team1_guest_b = w_gb, updated_at = now()
       where id = v_m.next_match_id;
    else
      update public.bracket_matches
         set team2_player_a = w_pa, team2_player_b = w_pb, team2_guest_a = w_ga, team2_guest_b = w_gb, updated_at = now()
       where id = v_m.next_match_id;
    end if;
  end if;

  -- A semifinal's loser goes to the 3rd-place match.
  if v_m.loser_next_match_id is not null then
    if v_m.loser_next_match_slot = 1 then
      update public.bracket_matches
         set team1_player_a = l_pa, team1_player_b = l_pb, team1_guest_a = l_ga, team1_guest_b = l_gb, updated_at = now()
       where id = v_m.loser_next_match_id;
    else
      update public.bracket_matches
         set team2_player_a = l_pa, team2_player_b = l_pb, team2_guest_a = l_ga, team2_guest_b = l_gb, updated_at = now()
       where id = v_m.loser_next_match_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'winner', v_winner);
end; $$;

alter function public.record_match_score(uuid, integer, integer) owner to postgres;
revoke all on function public.record_match_score(uuid, integer, integer) from public, anon;
grant execute on function public.record_match_score(uuid, integer, integer) to authenticated;

-- ─── Corrections: follow the loser link as well ─────────────────────────────

-- Played matches a winner change on p_match_id invalidates: the winner's path
-- onward (as before), plus any played 3rd-place match fed by the corrected
-- match or by a match on that path.
create or replace function public.fn_score_correction_cascade(p_match_id uuid)
returns uuid[]
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_next    uuid;
  v_done    timestamptz;
  v_cleared uuid[] := '{}';
  v_guard   integer := 0;
  v_bronze  uuid[];
begin
  select next_match_id into v_next from public.bracket_matches where id = p_match_id;
  while v_next is not null and v_guard < 16 loop
    v_guard := v_guard + 1;
    select completed_at into v_done from public.bracket_matches where id = v_next;
    exit when v_done is null;               -- not played yet: nothing more to clear
    v_cleared := v_cleared || v_next;
    select next_match_id into v_next from public.bracket_matches where id = v_next;
  end loop;

  select array_agg(distinct b.id) into v_bronze
    from public.bracket_matches s
    join public.bracket_matches b on b.id = s.loser_next_match_id
   where s.id = any(array[p_match_id] || v_cleared)
     and b.completed_at is not null
     and not (b.id = any(v_cleared));

  return v_cleared || coalesce(v_bronze, '{}');
end; $$;

create or replace function public.correct_match_score(
  p_match_id uuid,
  p_score1   integer,
  p_score2   integer,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor     uuid := auth.uid();
  v_m         public.bracket_matches;
  v_director  uuid;
  v_new       integer;
  v_hi        integer;
  v_lo        integer;
  v_cleared   uuid[] := '{}';
  v_id        uuid;
  v_cur       public.bracket_matches;
  w_pa uuid; w_pb uuid; w_ga uuid; w_gb uuid;
  l_pa uuid; l_pb uuid; l_ga uuid; l_gb uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_m from public.bracket_matches where id = p_match_id for update;
  if not found then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;

  select director_id into v_director from public.tournaments where id = v_m.tournament_id;
  if not (public.is_admin() or (v_director = v_actor and public.is_approved_director())) then
    raise exception 'not_allowed' using errcode = 'P0003';
  end if;

  if v_m.completed_at is null or v_m.winner is null then
    raise exception 'match_not_completed' using errcode = 'P0004';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = 'P0005';
  end if;

  v_hi := greatest(p_score1, p_score2);
  v_lo := least(p_score1, p_score2);
  if p_score1 is null or p_score2 is null or p_score1 < 0 or p_score2 < 0
     or p_score1 = p_score2 or v_hi < 11 or v_hi - v_lo < 2 then
    raise exception 'invalid_score' using errcode = 'P0006';
  end if;

  v_new := case when p_score1 > p_score2 then 1 else 2 end;

  if v_new = 1 then
    w_pa := v_m.team1_player_a; w_pb := v_m.team1_player_b; w_ga := v_m.team1_guest_a; w_gb := v_m.team1_guest_b;
    l_pa := v_m.team2_player_a; l_pb := v_m.team2_player_b; l_ga := v_m.team2_guest_a; l_gb := v_m.team2_guest_b;
  else
    w_pa := v_m.team2_player_a; w_pb := v_m.team2_player_b; w_ga := v_m.team2_guest_a; w_gb := v_m.team2_guest_b;
    l_pa := v_m.team1_player_a; l_pb := v_m.team1_player_b; l_ga := v_m.team1_guest_a; l_gb := v_m.team1_guest_b;
  end if;

  -- Winner changed on an elimination match: re-seat the next match (and the
  -- 3rd-place match for a semifinal), clearing results played by the wrong team.
  if v_new is distinct from v_m.winner and v_m.pool_label is null
     and (v_m.next_match_id is not null or v_m.loser_next_match_id is not null) then
    v_cleared := public.fn_score_correction_cascade(p_match_id);

    if v_m.next_match_id is not null then
      if v_m.next_match_slot = 1 then
        update public.bracket_matches
           set team1_player_a = w_pa, team1_player_b = w_pb, team1_guest_a = w_ga, team1_guest_b = w_gb, updated_at = now()
         where id = v_m.next_match_id;
      else
        update public.bracket_matches
           set team2_player_a = w_pa, team2_player_b = w_pb, team2_guest_a = w_ga, team2_guest_b = w_gb, updated_at = now()
         where id = v_m.next_match_id;
      end if;
    end if;

    -- Clear each played match on the path, and undo both its advancements.
    foreach v_id in array v_cleared loop
      select * into v_cur from public.bracket_matches where id = v_id for update;

      update public.bracket_matches
         set score_team1 = null, score_team2 = null, winner = null,
             completed_at = null, score_entered_by = null, score_entered_at = null,
             court = null, updated_at = now()
       where id = v_id;

      if v_cur.next_match_id is not null then
        if v_cur.next_match_slot = 1 then
          update public.bracket_matches
             set team1_player_a = null, team1_player_b = null, team1_guest_a = null, team1_guest_b = null, updated_at = now()
           where id = v_cur.next_match_id;
        else
          update public.bracket_matches
             set team2_player_a = null, team2_player_b = null, team2_guest_a = null, team2_guest_b = null, updated_at = now()
           where id = v_cur.next_match_id;
        end if;
      end if;

      if v_cur.loser_next_match_id is not null then
        if v_cur.loser_next_match_slot = 1 then
          update public.bracket_matches
             set team1_player_a = null, team1_player_b = null, team1_guest_a = null, team1_guest_b = null, updated_at = now()
           where id = v_cur.loser_next_match_id;
        else
          update public.bracket_matches
             set team2_player_a = null, team2_player_b = null, team2_guest_a = null, team2_guest_b = null, updated_at = now()
           where id = v_cur.loser_next_match_id;
        end if;
      end if;
    end loop;

    -- A corrected semifinal's new loser takes the 3rd-place slot.
    if v_m.loser_next_match_id is not null then
      if v_m.loser_next_match_slot = 1 then
        update public.bracket_matches
           set team1_player_a = l_pa, team1_player_b = l_pb, team1_guest_a = l_ga, team1_guest_b = l_gb, updated_at = now()
         where id = v_m.loser_next_match_id;
      else
        update public.bracket_matches
           set team2_player_a = l_pa, team2_player_b = l_pb, team2_guest_a = l_ga, team2_guest_b = l_gb, updated_at = now()
         where id = v_m.loser_next_match_id;
      end if;
    end if;
  end if;

  -- The correction itself, with the public "was" marker.
  update public.bracket_matches
     set score_team1 = array[p_score1],
         score_team2 = array[p_score2],
         winner = v_new,
         score_entered_by = v_actor,
         score_entered_at = now(),
         score_edited_at = now(),
         score_edited_prev = jsonb_build_object('s1', v_m.score_team1[1], 's2', v_m.score_team2[1], 'winner', v_m.winner),
         updated_at = now()
   where id = p_match_id;

  insert into public.bracket_match_score_edits (
    match_id, tournament_id, old_score_team1, old_score_team2, old_winner,
    new_score_team1, new_score_team2, new_winner, reason, cleared_match_ids, edited_by
  ) values (
    p_match_id, v_m.tournament_id, v_m.score_team1, v_m.score_team2, v_m.winner,
    array[p_score1], array[p_score2], v_new, btrim(p_reason), v_cleared, v_actor
  );

  if cardinality(v_cleared) > 0 then
    perform public.fn_fill_free_courts(v_m.tournament_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'winner_changed', v_new is distinct from v_m.winner,
    'cleared_count', cardinality(v_cleared)
  );
end; $$;

alter function public.correct_match_score(uuid, integer, integer, text) owner to postgres;
revoke all on function public.correct_match_score(uuid, integer, integer, text) from public, anon;
grant execute on function public.correct_match_score(uuid, integer, integer, text) to authenticated, service_role;

-- ─── Add a 3rd-place match to an existing bracket ───────────────────────────

create or replace function public.add_third_place_match(p_tournament_id uuid, p_division_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor  uuid := auth.uid();
  v_t      public.tournaments;
  v_sf     public.bracket_matches[];
  v_s      public.bracket_matches;
  v_bronze uuid := gen_random_uuid();
  v_slot   smallint := 0;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select * into v_t from public.tournaments where id = p_tournament_id;
  if not found then
    raise exception 'tournament_not_found' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or (v_t.director_id = v_actor and public.is_approved_director())) then
    raise exception 'not_allowed' using errcode = 'P0003';
  end if;

  perform 1 from public.bracket_matches
   where tournament_id = p_tournament_id and division_id = p_division_id and pool_label is null
   for update;

  if exists (select 1 from public.bracket_matches
              where tournament_id = p_tournament_id and division_id = p_division_id
                and pool_label is null and round = 'bronze') then
    raise exception 'already_exists' using errcode = 'P0010';
  end if;

  select array_agg(m order by m.match_number) into v_sf
    from public.bracket_matches m
   where m.tournament_id = p_tournament_id and m.division_id = p_division_id
     and m.pool_label is null and m.round = 'sf';
  if coalesce(cardinality(v_sf), 0) <> 2 then
    raise exception 'no_semifinals' using errcode = 'P0011';
  end if;

  -- A semifinal already won by walkover has no loser to send.
  foreach v_s in array v_sf loop
    if v_s.completed_at is not null
       and ((v_s.team1_player_a is null and v_s.team1_guest_a is null)
         or (v_s.team2_player_a is null and v_s.team2_guest_a is null)) then
      raise exception 'semifinal_walkover' using errcode = 'P0012';
    end if;
  end loop;

  insert into public.bracket_matches (id, tournament_id, division_id, round, match_number)
  values (v_bronze, p_tournament_id, p_division_id, 'bronze', 0);

  foreach v_s in array v_sf loop
    v_slot := v_slot + 1;
    update public.bracket_matches
       set loser_next_match_id = v_bronze, loser_next_match_slot = v_slot, updated_at = now()
     where id = v_s.id;

    -- Semifinals already played send their loser now.
    if v_s.completed_at is not null and v_s.winner in (1, 2) then
      if v_slot = 1 then
        update public.bracket_matches
           set team1_player_a = case when v_s.winner = 1 then v_s.team2_player_a else v_s.team1_player_a end,
               team1_player_b = case when v_s.winner = 1 then v_s.team2_player_b else v_s.team1_player_b end,
               team1_guest_a  = case when v_s.winner = 1 then v_s.team2_guest_a  else v_s.team1_guest_a  end,
               team1_guest_b  = case when v_s.winner = 1 then v_s.team2_guest_b  else v_s.team1_guest_b  end,
               updated_at = now()
         where id = v_bronze;
      else
        update public.bracket_matches
           set team2_player_a = case when v_s.winner = 1 then v_s.team2_player_a else v_s.team1_player_a end,
               team2_player_b = case when v_s.winner = 1 then v_s.team2_player_b else v_s.team1_player_b end,
               team2_guest_a  = case when v_s.winner = 1 then v_s.team2_guest_a  else v_s.team1_guest_a  end,
               team2_guest_b  = case when v_s.winner = 1 then v_s.team2_guest_b  else v_s.team1_guest_b  end,
               updated_at = now()
         where id = v_bronze;
      end if;
    end if;
  end loop;

  return v_bronze;
end; $$;

comment on function public.add_third_place_match(uuid, uuid) is
  'Director/admin: add a 3rd-place match to an existing single-elimination bracket, linking both semifinal losers (placing any already decided). Keeps every score.';

alter function public.add_third_place_match(uuid, uuid) owner to postgres;
revoke all on function public.add_third_place_match(uuid, uuid) from public, anon;
grant execute on function public.add_third_place_match(uuid, uuid) to authenticated;
