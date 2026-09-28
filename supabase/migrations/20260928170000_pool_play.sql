-- ─────────────────────────────────────────────────────────────────────────────
-- Pool Play → Bracket (the "hybrid"), step 1: pools and standings.
--
-- Owner's decisions (2026-09-28): the format is set per tournament
-- (tournament_format = 'pool_bracket'), pool settings are per division, the
-- default is 2 advancing per pool (editable), teams go into pools
-- automatically by rating, and the move to the bracket is confirmed by the
-- director (step 2, not in this migration).
--
-- Pool matches are ordinary bracket_matches rows with round = 'pool' and a
-- pool_label ('A', 'B', ...). The pool_label is what marks pool play, NOT the
-- round: createBracket's roundLabel() already uses 'pool' as the catch-all for
-- elimination rounds earlier than r64 (brackets over 128 entrants), and those
-- rows have no pool_label. So score
-- entry, the court queue / auto-assign (20260928150000/160000) and realtime
-- all work unchanged. Pool matches have no next_match_id: nothing advances
-- until the director builds the bracket.
--
-- Standings (division_pool_standings) are computed, not stored, so they can
-- never drift from the scores. Rank within a pool:
--   1. wins
--   2. head-to-head: wins against teams in the same pool with the same win total
--   3. point difference
--   4. points scored
--   5. team key (stable last resort)
-- SECURITY INVOKER: reads are governed by bracket_matches RLS.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.bracket_matches
  add column if not exists pool_label text;

-- A pool letter only ever sits on a 'pool'-round row. The reverse doesn't
-- hold (see above).
alter table public.bracket_matches
  add constraint bracket_matches_pool_label_only_in_pools
    check (pool_label is null or round = 'pool');

comment on column public.bracket_matches.pool_label is
  'Pool letter (A, B, ...) for round = ''pool'' matches; null for elimination rounds.';

alter table public.divisions
  add column if not exists pool_count integer,
  add column if not exists advance_per_pool integer not null default 2;

alter table public.divisions
  add constraint divisions_pool_count_range check (pool_count is null or pool_count between 1 and 16),
  add constraint divisions_advance_per_pool_range check (advance_per_pool between 1 and 8);

comment on column public.divisions.pool_count is
  'Pools used for this division''s pool play (null = not generated / use tournaments.pool_count).';
comment on column public.divisions.advance_per_pool is
  'Top N of each pool that move on to the bracket. Default 2, set by the director.';

create or replace function public.division_pool_standings(p_division_id uuid)
returns table (
  pool_label     text,
  team_key       text,
  player_a       uuid,
  player_b       uuid,
  guest_a        uuid,
  guest_b        uuid,
  played         integer,
  wins           integer,
  losses         integer,
  points_for     integer,
  points_against integer,
  point_diff     integer,
  h2h_wins       integer,
  pool_rank      integer
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with m as (
    select bm.*
      from public.bracket_matches bm
     where bm.division_id = p_division_id
       and bm.pool_label is not null
  ),
  -- One row per team per match, from that team's side.
  sides as (
    select m.pool_label,
           m.team1_player_a as pa, m.team1_player_b as pb, m.team1_guest_a as ga, m.team1_guest_b as gb,
           concat_ws('|', coalesce(m.team1_player_a, m.team1_guest_a), coalesce(m.team1_player_b, m.team1_guest_b)) as team_key,
           concat_ws('|', coalesce(m.team2_player_a, m.team2_guest_a), coalesce(m.team2_player_b, m.team2_guest_b)) as opp_key,
           m.score_team1[1] as pts_for, m.score_team2[1] as pts_against,
           (m.winner = 1) as won, (m.completed_at is not null) as done
      from m
    union all
    select m.pool_label,
           m.team2_player_a, m.team2_player_b, m.team2_guest_a, m.team2_guest_b,
           concat_ws('|', coalesce(m.team2_player_a, m.team2_guest_a), coalesce(m.team2_player_b, m.team2_guest_b)),
           concat_ws('|', coalesce(m.team1_player_a, m.team1_guest_a), coalesce(m.team1_player_b, m.team1_guest_b)),
           m.score_team2[1], m.score_team1[1],
           (m.winner = 2), (m.completed_at is not null)
      from m
  ),
  agg as (
    select s.pool_label, s.team_key,
           (array_agg(s.pa))[1] as player_a, (array_agg(s.pb))[1] as player_b,
           (array_agg(s.ga))[1] as guest_a,  (array_agg(s.gb))[1] as guest_b,
           (count(*) filter (where s.done))::integer                    as played,
           (count(*) filter (where s.done and s.won))::integer          as wins,
           (count(*) filter (where s.done and not s.won))::integer      as losses,
           coalesce(sum(s.pts_for)     filter (where s.done), 0)::integer as points_for,
           coalesce(sum(s.pts_against) filter (where s.done), 0)::integer as points_against
      from sides s
     group by s.pool_label, s.team_key
  ),
  ranked as (
    select a.*,
           (a.points_for - a.points_against) as point_diff,
           (select count(*)
              from sides s
              join agg o on o.pool_label = s.pool_label and o.team_key = s.opp_key
             where s.pool_label = a.pool_label and s.team_key = a.team_key
               and s.done and s.won and o.wins = a.wins)::integer as h2h_wins
      from agg a
  )
  select r.pool_label, r.team_key, r.player_a, r.player_b, r.guest_a, r.guest_b,
         r.played, r.wins, r.losses, r.points_for, r.points_against, r.point_diff, r.h2h_wins,
         (row_number() over (
            partition by r.pool_label
            order by r.wins desc, r.h2h_wins desc, r.point_diff desc, r.points_for desc, r.team_key
          ))::integer as pool_rank
    from ranked r
   order by r.pool_label, 14;
$$;

revoke all on function public.division_pool_standings(uuid) from public;
revoke all on function public.division_pool_standings(uuid) from anon;
grant execute on function public.division_pool_standings(uuid) to authenticated, service_role;
