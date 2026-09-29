-- Two integrity gaps in play_matches, found while building Quick Game scores
-- (mobile f77bc1e). Both matter more once organized games feed PAR.
--
-- 1. Roster check (all play event types).
--    "play_matches: organizer manage" only checks that the caller organizes
--    play_matches.event_id. Nothing tied the four player columns to that event,
--    so an organizer could record a game in their own event naming
--    play_participants rows from anyone else's event (their ids are readable
--    through play_participants_authenticated). Verified in a rolled-back
--    transaction on 2026-09-28: the insert succeeded. Every existing row was
--    checked first: 0 of 13 reference a player outside their own event.
--    Applies to round robins and mini tournaments too; their schedules only
--    ever use their own roster, and NULL placeholder slots are allowed.
--
-- 2. Leaving a Quick Game after games were recorded (open_play only).
--    The player FKs are ON DELETE CASCADE, so a player leaving, or being
--    removed, silently deleted every recorded game they were in, including
--    the other players' results. Deleting a participant who is in a scored
--    game of an open_play event is now refused. Scoped to Quick Games at the
--    owner's request; round robin / mini tournament behaviour is unchanged.
--    Deleting the whole event still cascades: by the time the cascade reaches
--    play_participants the event row is gone, and the guard lets it through.

-- ─── 1. Roster check ─────────────────────────────────────────────────────────

create or replace function public.fn_play_matches_roster_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
begin
  foreach v_pid in array array[new.player_a_id, new.player_a2_id, new.player_b_id, new.player_b2_id] loop
    if v_pid is not null and not exists (
      select 1 from public.play_participants p
       where p.id = v_pid and p.event_id = new.event_id
    ) then
      raise exception 'player_not_on_roster'
        using errcode = 'P0001',
              hint = 'Every player in a game must be a participant of that event.';
    end if;
  end loop;
  return new;
end;
$$;

comment on function public.fn_play_matches_roster_guard() is
  'BEFORE INSERT/UPDATE on play_matches: every non-null player column must be a play_participants row of the same event.';

drop trigger if exists trg_play_matches_roster_guard on public.play_matches;
create trigger trg_play_matches_roster_guard
  before insert or update of event_id, player_a_id, player_a2_id, player_b_id, player_b2_id
  on public.play_matches
  for each row execute function public.fn_play_matches_roster_guard();

-- ─── 2. Keep recorded Quick Game results when a player leaves ────────────────

create or replace function public.fn_play_participants_protect_recorded_games()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.play_events e
     where e.id = old.event_id and e.event_type = 'open_play'
  ) and exists (
    select 1 from public.play_matches m
     where m.event_id = old.event_id
       and m.winner is not null
       and old.id in (m.player_a_id, m.player_a2_id, m.player_b_id, m.player_b2_id)
  ) then
    raise exception 'participant_has_recorded_games'
      using errcode = 'P0001',
            hint = 'This player is in recorded games. Delete those games first.';
  end if;
  return old;
end;
$$;

comment on function public.fn_play_participants_protect_recorded_games() is
  'BEFORE DELETE on play_participants: in a Quick Game (open_play), refuse to remove a player who is in a scored game, since the FK cascade would delete that game for every player.';

drop trigger if exists trg_play_participants_protect_recorded_games on public.play_participants;
create trigger trg_play_participants_protect_recorded_games
  before delete on public.play_participants
  for each row execute function public.fn_play_participants_protect_recorded_games();

revoke execute on function public.fn_play_matches_roster_guard() from public, anon, authenticated;
revoke execute on function public.fn_play_participants_protect_recorded_games() from public, anon, authenticated;
