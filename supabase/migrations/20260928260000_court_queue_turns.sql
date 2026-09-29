-- Live divisions take turns for courts.
--
-- Found on RATE LAS VEGAS OPEN - DEMO (2026-09-28): with Men's and Women's
-- Doubles both live, Men's held queue places 1-12. Starting a division stamps
-- its waiting matches ready_at = clock_timestamp() row by row
-- (fn_division_play_status_changed), so the division started a moment earlier
-- had every one of its matches "older" than the other's, and the round /
-- match-number tie-breaks that were meant to interleave divisions never ran.
-- One live division took every court until it ran out of ready matches.
--
-- Now each waiting match gets a turn number:
--     turn = courts its division already holds + its place in its division's line
-- and the lowest turn goes first. A division's own line keeps the old order
-- (ready_at, then round relative to the division's first round, then match
-- number), so nothing changes inside a division. Between divisions, courts
-- even out: a division holding 5 courts waits while one holding 1 catches up.
--
-- Unchanged: only LIVE divisions are queued (the Start/Pause switch decides who
-- plays); a match whose player is already on a court is skipped; ties still
-- fall back to ready_at, round, match number, division. Same signature, so
-- fn_fill_free_courts and both apps (Up next, web Day Of) pick it up as is.

create or replace function public.court_queue(p_tournament_id uuid)
returns table(match_id uuid, queue_position integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with first_round as (
    select division_id, min(public.fn_round_order(round::text)) as first_order
      from public.bracket_matches
     where tournament_id = p_tournament_id
     group by division_id
  ),
  busy as (
    -- Courts each division holds right now.
    select division_id, count(*) as on_court
      from public.bracket_matches
     where tournament_id = p_tournament_id
       and court is not null
       and completed_at is null
     group by division_id
  ),
  waiting as (
    select m.id,
           m.division_id,
           m.ready_at,
           m.match_number,
           public.fn_round_order(m.round::text) - coalesce(fr.first_order, 0) as rel_round
      from public.bracket_matches m
      join public.divisions d on d.id = m.division_id and d.play_status = 'live'
      left join first_round fr on fr.division_id is not distinct from m.division_id
     where m.tournament_id = p_tournament_id
       and m.completed_at is null
       and m.court is null
       and m.ready_at is not null
       -- Nobody in this match may be on another court right now.
       and not exists (
         select 1
           from public.bracket_matches o
          where o.tournament_id = p_tournament_id
            and o.court is not null
            and o.completed_at is null
            and array_remove(array[o.team1_player_a, o.team1_player_b, o.team2_player_a, o.team2_player_b,
                                   o.team1_guest_a,  o.team1_guest_b,  o.team2_guest_a,  o.team2_guest_b], null)
             && array_remove(array[m.team1_player_a, m.team1_player_b, m.team2_player_a, m.team2_player_b,
                                   m.team1_guest_a,  m.team1_guest_b,  m.team2_guest_a,  m.team2_guest_b], null)
       )
  ),
  ranked as (
    select w.*,
           row_number() over (partition by w.division_id
                              order by w.ready_at, w.rel_round, w.match_number) as line_place
      from waiting w
  )
  select r.id,
         (row_number() over (
            order by coalesce(b.on_court, 0) + r.line_place,
                     r.ready_at,
                     r.rel_round,
                     r.match_number,
                     r.division_id
          ))::integer
    from ranked r
    left join busy b on b.division_id is not distinct from r.division_id
   order by 2;
$function$;

comment on function public.court_queue(uuid) is
  'Waiting matches of LIVE divisions in the order they get courts. Turn = courts the division already holds + place in its own line; lowest first, so live divisions share courts evenly. Skips matches whose players are on a court.';
