-- ─────────────────────────────────────────────────────────────────────────────
-- Division play status: only divisions in progress get courts.
--
-- Owner's decisions (2026-09-28):
--   * divisions.play_status: 'not_started' (the default, for new AND existing
--     divisions) | 'live' | 'paused'. "Complete" is not stored. The app derives
--     it from the division's final being scored.
--   * The auto-assign queue (court_queue, so also fn_fill_free_courts and the
--     app's UP NEXT / ON DECK) only includes matches of LIVE divisions.
--   * Pausing never takes anyone off a court. Matches already on court finish,
--     but the division gets no new courts until it's resumed.
--   * Going live (from not_started OR paused) fills free courts at once. The
--     division's waiting matches join the BACK of the line (ready_at = the moment it goes live),
--     so divisions already playing aren't stalled by one starting mid-event.
--   * Assigning by hand is unaffected. The director can still assign any
--     division; the app notes when it isn't live.
--
-- Directors already update their own divisions under "divisions: director
-- manage own", so play_status is set with a plain update. The trigger below
-- does the rest. It's SECURITY DEFINER only to reach fn_fill_free_courts
-- (which has no grants) and to rebase ready_at on the division's matches.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.divisions
  add column if not exists play_status text not null default 'not_started';

alter table public.divisions
  add constraint divisions_play_status_valid
    check (play_status in ('not_started', 'live', 'paused'));

comment on column public.divisions.play_status is
  'not_started | live | paused. Only live divisions are auto-assigned courts. '
  'Complete is derived in the app (the final has a winner).';

-- Queue: as 20260928160000, plus "only live divisions".
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
   order by 2;
$$;

-- Going live: waiting matches join the back of the line, then courts fill.
create or replace function public.fn_division_play_status_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.play_status = 'live' and old.play_status is distinct from 'live' then
    update public.bracket_matches
       set ready_at = clock_timestamp()
     where division_id = new.id
       and completed_at is null
       and court is null
       and ready_at is not null;

    perform public.fn_fill_free_courts(new.tournament_id);
  end if;
  return null;
end; $$;

alter function public.fn_division_play_status_changed() owner to postgres;

drop trigger if exists trg_division_play_status_changed on public.divisions;
create trigger trg_division_play_status_changed
  after update of play_status on public.divisions
  for each row execute function public.fn_division_play_status_changed();
