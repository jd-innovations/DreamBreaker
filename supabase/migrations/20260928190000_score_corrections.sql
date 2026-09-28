-- ─────────────────────────────────────────────────────────────────────────────
-- Score corrections: fix a scoring mistake after a match is completed.
--
-- Owner's decisions (2026-09-28):
--   * Who: the tournament's (approved) director and platform admins.
--   * If the winner changes and later matches on that path were already
--     played, those later results are CLEARED (not refused).
--   * Players see an "i" marker with the old score. Only directors and admins
--     see who edited and why.
--   * A reason is required.
--
-- Why a database function: a correction must be all or nothing. The score,
-- the winner, the team advancing into the next match, and any results cleared
-- downstream either all change or none do. The app's first-entry path is
-- two separate client writes, which is fine for first entry but not for this.
--
-- Clearing: when the winner changes, the next match gets the new team in the
-- slot the old winner had. If that next match was already played, its
-- result is invalid (the new team never played it), so it is cleared: score,
-- winner, completion and court released. Then its own winner's advancement is
-- undone (that slot becomes undecided), and so on along the path, until a match
-- that hadn't been played. Courts are released on cleared matches so the
-- one-live-match-per-court index can't trip. Auto-assign then refills free courts.
--
-- Visibility:
--   * bracket_matches.score_edited_at / score_edited_prev sit on the match, so
--     anyone who can read the match (players, on a published tournament) sees
--     the "i" with the old score.
--   * bracket_match_score_edits (editor, reason, cleared matches) is readable
--     only by the tournament's director and admins. It has no insert, update or
--     delete policy: only this function writes it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.bracket_matches
  add column if not exists score_edited_at timestamptz,
  add column if not exists score_edited_prev jsonb;

comment on column public.bracket_matches.score_edited_prev is
  'Score before the most recent correction: {"s1": n, "s2": n, "winner": 1|2}. Public with the match.';

create table if not exists public.bracket_match_score_edits (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references public.bracket_matches(id) on delete cascade,
  tournament_id     uuid not null references public.tournaments(id) on delete cascade,
  old_score_team1   integer[],
  old_score_team2   integer[],
  old_winner        integer,
  new_score_team1   integer[] not null,
  new_score_team2   integer[] not null,
  new_winner        integer not null,
  reason            text not null check (char_length(btrim(reason)) between 3 and 500),
  cleared_match_ids uuid[] not null default '{}',
  edited_by         uuid not null references public.profiles(id),
  edited_at         timestamptz not null default now()
);

create index if not exists idx_score_edits_match on public.bracket_match_score_edits (match_id, edited_at desc);

alter table public.bracket_match_score_edits enable row level security;

drop policy if exists "score edits: director and admin read" on public.bracket_match_score_edits;
create policy "score edits: director and admin read" on public.bracket_match_score_edits
  for select using (
    (select public.is_admin())
    or exists (
      select 1 from public.tournaments t
       where t.id = bracket_match_score_edits.tournament_id
         and t.director_id = (select auth.uid())
    )
  );

revoke all on public.bracket_match_score_edits from anon;
grant select on public.bracket_match_score_edits to authenticated;

-- Matches whose results a correction would clear, in path order. Walks
-- next_match_id from the corrected match while the matches along it were
-- already played. Read-only. Used by both preview and apply.
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
begin
  select next_match_id into v_next from public.bracket_matches where id = p_match_id;
  while v_next is not null and v_guard < 16 loop
    v_guard := v_guard + 1;
    select completed_at into v_done from public.bracket_matches where id = v_next;
    exit when v_done is null;               -- not played yet: nothing more to clear
    v_cleared := v_cleared || v_next;
    select next_match_id into v_next from public.bracket_matches where id = v_next;
  end loop;
  return v_cleared;
end; $$;

-- What a correction would do, without doing it (the app's confirm step).
create or replace function public.preview_score_correction(
  p_match_id uuid,
  p_score1 integer,
  p_score2 integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_winner integer;
  v_new    integer := case when p_score1 > p_score2 then 1 else 2 end;
begin
  select winner into v_winner from public.bracket_matches where id = p_match_id;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'winner_changed', v_winner is distinct from v_new,
    'cleared_count', case when v_winner is distinct from v_new
                          then coalesce(cardinality(public.fn_score_correction_cascade(p_match_id)), 0)
                          else 0 end
  );
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
  -- the team that now advances out of the corrected match
  w_pa uuid; w_pb uuid; w_ga uuid; w_gb uuid;
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

  -- Same rules as the app (lib/bracketScoring.ts validateSingleGameScore).
  v_hi := greatest(p_score1, p_score2);
  v_lo := least(p_score1, p_score2);
  if p_score1 is null or p_score2 is null or p_score1 < 0 or p_score2 < 0
     or p_score1 = p_score2 or v_hi < 11 or v_hi - v_lo < 2 then
    raise exception 'invalid_score' using errcode = 'P0006';
  end if;

  v_new := case when p_score1 > p_score2 then 1 else 2 end;

  -- Winner changed on an elimination match: re-seat the next match, clearing
  -- any results downstream that were played by the wrong team.
  if v_new is distinct from v_m.winner and v_m.next_match_id is not null and v_m.pool_label is null then
    v_cleared := public.fn_score_correction_cascade(p_match_id);

    if v_new = 1 then
      w_pa := v_m.team1_player_a; w_pb := v_m.team1_player_b; w_ga := v_m.team1_guest_a; w_gb := v_m.team1_guest_b;
    else
      w_pa := v_m.team2_player_a; w_pb := v_m.team2_player_b; w_ga := v_m.team2_guest_a; w_gb := v_m.team2_guest_b;
    end if;

    -- The new winner takes the slot in the next match.
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

    -- Clear each played match on the path, and undo its winner's advancement.
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
             set team1_player_a = null, team1_player_b = null, team1_guest_a = null, team1_guest_b = null,
                 updated_at = now()
           where id = v_cur.next_match_id;
        else
          update public.bracket_matches
             set team2_player_a = null, team2_player_b = null, team2_guest_a = null, team2_guest_b = null,
                 updated_at = now()
           where id = v_cur.next_match_id;
        end if;
      end if;
    end loop;
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

  -- Courts released by clearing go back to work.
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
revoke all on function public.correct_match_score(uuid, integer, integer, text) from public;
revoke all on function public.correct_match_score(uuid, integer, integer, text) from anon;
grant execute on function public.correct_match_score(uuid, integer, integer, text) to authenticated, service_role;

revoke all on function public.preview_score_correction(uuid, integer, integer) from public;
revoke all on function public.preview_score_correction(uuid, integer, integer) from anon;
grant execute on function public.preview_score_correction(uuid, integer, integer) to authenticated, service_role;

revoke all on function public.fn_score_correction_cascade(uuid) from public;
revoke all on function public.fn_score_correction_cascade(uuid) from anon;
grant execute on function public.fn_score_correction_cascade(uuid) to authenticated, service_role;
