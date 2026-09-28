-- ─────────────────────────────────────────────────────────────────────────────
-- Court queue fairness across divisions (follow-up to 20260928150000).
--
-- Found in a rolled-back test on RATE LAS VEGAS OPEN - DEMO: matches that are
-- ready the moment a bracket is generated got ready_at = generation time (the
-- backfill used their updated_at). So the division whose bracket was generated
-- first (Women's Singles, 2026-09-24 22:19) would take every court before any
-- other division started.
--
-- "First ready, first played" still holds, but a match that was ready before
-- play could start now counts as ready from the START OF THE EVENT DAY:
--   * generation (INSERT) readiness = start of the later of today and
--     event_date. Every division's opening matches tie.
--   * readiness gained during play (UPDATE, e.g. a winner advancing) =
--     now(), the true time.
-- Ties go to the round relative to the division's own first round (so a
-- 16-player division's opener isn't queued behind everyone's Round of 32),
-- then match number, then division. The result interleaves: M1 of every
-- division, then M2 of every division, and so on.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_bracket_match_ready_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_event_date date;
begin
  if coalesce(new.team1_player_a, new.team1_guest_a) is not null
     and coalesce(new.team2_player_a, new.team2_guest_a) is not null then
    if new.ready_at is null then
      if tg_op = 'INSERT' then
        select event_date into v_event_date
          from public.tournaments where id = new.tournament_id;
        -- greatest() ignores a null event_date.
        new.ready_at := date_trunc('day', greatest(now(), v_event_date::timestamptz));
      else
        new.ready_at := now();
      end if;
    end if;
  else
    new.ready_at := null;
  end if;
  return new;
end; $$;

create or replace function public.court_queue(p_tournament_id uuid)
returns table (match_id uuid, queue_position integer)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with first_round as (
    select division_id, min(public.fn_round_order(round::text)) as first_order
      from public.bracket_matches
     where tournament_id = p_tournament_id
     group by division_id
  )
  select m.id,
         (row_number() over (
            order by m.ready_at,
                     public.fn_round_order(m.round::text) - coalesce(fr.first_order, 0),
                     m.match_number,
                     m.division_id
          ))::integer
    from public.bracket_matches m
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
   order by 2;
$$;

-- Re-baseline readiness gained before the event day to the start of the
-- event day, so existing brackets interleave too. Readiness from the event
-- day onward is left as is. (This UPDATE doesn't fire the automation: that
-- trigger acts only when ready_at goes from null to set, or a match
-- completes.)
update public.bracket_matches m
   set ready_at = date_trunc('day', t.event_date::timestamptz)
  from public.tournaments t
 where t.id = m.tournament_id
   and t.event_date is not null
   and m.completed_at is null
   and m.ready_at is not null
   and m.ready_at < date_trunc('day', t.event_date::timestamptz);
