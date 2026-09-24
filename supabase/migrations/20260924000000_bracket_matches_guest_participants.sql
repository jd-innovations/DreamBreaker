-- bracket_matches has no way to represent a director-added GUEST participant.
--
-- team1_player_a/b and team2_player_a/b are FKs to profiles(id) only. A
-- director-added guest registrant (director_add_tournament_registration(),
-- migration 20260821030000) has no profiles row — inserting their
-- personal_guest_players.id into one of those columns would fail the FK, so
-- the app was already correctly leaving them NULL for a guest slot. The
-- effect: even after fixing the client-side crash that stopped bracket
-- generation from completing at all (smallestPow2 capped bracketSize at 32,
-- so any division over 32 entrants built a NEGATIVE array length and threw —
-- found 2026-09-24 on RATE LAS VEGAS OPEN - DEMO, 4 of 5 divisions over 32),
-- every guest slot in a generated bracket would still render with no name at
-- all: there was nowhere to record who they were.
--
-- These four columns are that missing place. A slot is a real player OR a
-- guest, never both — enforced below rather than left as a convention, since
-- both the seeding code and the score-advancement code have to keep the pair
-- in lockstep on every write.
--
-- Verified in a rolled-back transaction against a real division of this
-- tournament: a guest inserted into team1_guest_a/team2_guest_a joins back to
-- personal_guest_players correctly ("Anna Leigh Waters" vs "Ben Johns"), and
-- setting team1_player_a on a row that already had team1_guest_a set was
-- correctly refused by the constraint below.

alter table public.bracket_matches
  add column if not exists team1_guest_a uuid references public.personal_guest_players(id) on delete set null,
  add column if not exists team1_guest_b uuid references public.personal_guest_players(id) on delete set null,
  add column if not exists team2_guest_a uuid references public.personal_guest_players(id) on delete set null,
  add column if not exists team2_guest_b uuid references public.personal_guest_players(id) on delete set null;

comment on column public.bracket_matches.team1_guest_a is
  'Director-added guest in the team1_player_a slot. NULL when that slot is a '
  'real player (team1_player_a set instead) or empty. Never both.';
comment on column public.bracket_matches.team1_guest_b is
  'Guest counterpart of team1_player_b — see team1_guest_a.';
comment on column public.bracket_matches.team2_guest_a is
  'Guest counterpart of team2_player_a — see team1_guest_a.';
comment on column public.bracket_matches.team2_guest_b is
  'Guest counterpart of team2_player_b — see team1_guest_a.';

alter table public.bracket_matches
  drop constraint if exists bracket_matches_team1a_not_both,
  drop constraint if exists bracket_matches_team1b_not_both,
  drop constraint if exists bracket_matches_team2a_not_both,
  drop constraint if exists bracket_matches_team2b_not_both;

alter table public.bracket_matches
  add constraint bracket_matches_team1a_not_both check (team1_player_a is null or team1_guest_a is null),
  add constraint bracket_matches_team1b_not_both check (team1_player_b is null or team1_guest_b is null),
  add constraint bracket_matches_team2a_not_both check (team2_player_a is null or team2_guest_a is null),
  add constraint bracket_matches_team2b_not_both check (team2_player_b is null or team2_guest_b is null);
