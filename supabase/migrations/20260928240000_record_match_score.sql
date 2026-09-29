-- record_match_score: first-time score entry for a bracket or pool match, and
-- the winner's advancement, in one transaction. Used by web Day Of (W1 of
-- DIRECTOR_HUB_WEB_PARITY.md) and by mobile, replacing mobile's two separate
-- client writes (score, then next-match slot), which could leave a winner who
-- never advanced if the second write failed.
--
-- Security design (rafter-secure-design, 2026-09-28):
--   * Who: an admin, or the tournament's approved director. The same rule as
--     correct_match_score and the existing "director manage own" RLS policy,
--     checked inside the function against THIS match's tournament, first.
--     Nobody gains the ability to score who couldn't already.
--   * Inputs: the match id and two integers only. score_entered_by/_at are
--     set here from auth.uid(); nothing else is client-settable.
--   * Rules: the app's score rules (to 11, win by 2, no ties, whole numbers),
--     both teams present, tournament not cancelled.
--   * Idempotent: a retry with the same score returns ok (safe after a dropped
--     connection). A different score on a finished match is refused with
--     already_scored; that is what correct_match_score (with a reason) is for.
--   * Atomic: the match row is locked; score and advancement commit together.
--     The existing court automation trigger (trg_bracket_court_automation)
--     frees the court and fills the next one on completion, as before.
--   * SECURITY DEFINER with a fixed search_path; EXECUTE for authenticated
--     only. Stable error codes, no internals in messages.

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

  -- Same rules as the app (packages/shared/src/bracketScoring.ts).
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

  -- Elimination: the winner takes their slot in the next match. Pool matches
  -- have no next match.
  if v_m.next_match_id is not null and v_m.next_match_slot is not null then
    if v_winner = 1 then
      w_pa := v_m.team1_player_a; w_pb := v_m.team1_player_b; w_ga := v_m.team1_guest_a; w_gb := v_m.team1_guest_b;
    else
      w_pa := v_m.team2_player_a; w_pb := v_m.team2_player_b; w_ga := v_m.team2_guest_a; w_gb := v_m.team2_guest_b;
    end if;

    if v_m.next_match_slot = 1 then
      update public.bracket_matches
         set team1_player_a = w_pa, team1_player_b = w_pb, team1_guest_a = w_ga, team1_guest_b = w_gb,
             updated_at = now()
       where id = v_m.next_match_id;
    else
      update public.bracket_matches
         set team2_player_a = w_pa, team2_player_b = w_pb, team2_guest_a = w_ga, team2_guest_b = w_gb,
             updated_at = now()
       where id = v_m.next_match_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'winner', v_winner);
end; $$;

comment on function public.record_match_score(uuid, integer, integer) is
  'Director/admin: record a first-time score and advance the winner atomically. Same score rules as the app; a retry with the same score is a no-op; a different score on a finished match must go through correct_match_score.';

alter function public.record_match_score(uuid, integer, integer) owner to postgres;
revoke all on function public.record_match_score(uuid, integer, integer) from public, anon;
grant execute on function public.record_match_score(uuid, integer, integer) to authenticated;
