import { supabase } from '@/lib/supabase';
import { validateScores, roundDisplayName } from '@/lib/supabase/brackets';

// ─── Court assignment ─────────────────────────────────────────────────────────

// Courts are named ("7", "Stadium"), from tournaments.courts. A court is IN USE
// while a match on it is unfinished (completed_at null); saving the score
// frees it, and the match keeps its court as a record. The partial unique
// index bracket_matches_one_live_match_per_court (20260928140000) enforces
// one unfinished match per court per tournament, across every division.

export type CourtInUse = {
  court: string;
  matchId: string;
  divisionId: string | null;
  divisionName: string;
  roundName: string;
  matchNumber: number;
};

export async function fetchCourtsInUse(tournamentId: string): Promise<CourtInUse[]> {
  const { data, error } = await supabase
    .from('bracket_matches')
    .select('id, court, division_id, round, pool_label, match_number, divisions(name)')
    .eq('tournament_id', tournamentId)
    .not('court', 'is', null)
    .is('completed_at', null);
  if (error || !data) return [];
  return data.map(r => ({
    court:        r.court as string,
    matchId:      r.id,
    divisionId:   r.division_id,
    divisionName: (r.divisions as { name?: string } | null)?.name ?? 'Another division',
    roundName:    r.pool_label ? `Pool ${r.pool_label}` : roundDisplayName(String(r.round)),
    matchNumber:  r.match_number,
  }));
}

/**
 * The tournament-wide court queue (court_queue(), 20260928150000): match id ->
 * 1-based position, first ready first played. The same definition the
 * database uses to hand out freed courts, so "Up next" can't disagree with it.
 */
export async function fetchCourtQueue(tournamentId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('court_queue', { p_tournament_id: tournamentId });
  if (error || !data) return new Map();
  return new Map(data.map(r => [r.match_id, r.queue_position]));
}

/** Assigns a court by name, or clears it with null. Reports failure instead of throwing. */
export async function assignCourt(
  matchId: string,
  court: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('bracket_matches')
    .update({ court, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .select('id');

  if (error) {
    // 23505 = the one-live-match-per-court index: someone else just took it.
    return {
      ok: false,
      error: error.code === '23505'
        ? 'That court was just assigned to another match. Pick a different court.'
        : 'Could not update the court. Please try again.',
    };
  }
  // RLS filters a disallowed update to zero rows rather than erroring.
  if (!data || data.length === 0) {
    return { ok: false, error: 'You are not able to change this match.' };
  }
  return { ok: true };
}

// ─── Score entry + winner advancement ────────────────────────────────────────

export async function saveMatchScore(
  matchId: string,
  score1: number,
  score2: number,
): Promise<string | null> {
  const validationError = validateScores(score1, score2);
  if (validationError) return validationError;

  // Fetch match to get player IDs and advancement links. team*_guest_* carry
  // a director-added guest's identity (personal_guest_players.id) — a slot is
  // either a real player or a guest, never both, and both must be advanced
  // together or a guest's win loses their name on the next round.
  const { data: match, error: fetchError } = await supabase
    .from('bracket_matches')
    .select(
      // A single string literal, not `+`-concatenated: supabase-js infers the
      // return type by parsing this as a literal at compile time, and a
      // concatenated expression falls back to an untyped GenericStringError.
      'id, team1_player_a, team1_player_b, team1_guest_a, team1_guest_b, team2_player_a, team2_player_b, team2_guest_a, team2_guest_b, next_match_id, next_match_slot',
    )
    .eq('id', matchId)
    .single();

  if (fetchError || !match) return 'Match not found.';

  const winnerTeam = score1 > score2 ? 1 : 2;
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('bracket_matches')
    .update({
      score_team1:  [score1],
      score_team2:  [score2],
      winner:       winnerTeam,
      completed_at: now,
      updated_at:   now,
    })
    .eq('id', matchId);

  if (updateError) return 'Failed to save score.';

  // Advance winner to next match slot
  if (match.next_match_id && match.next_match_slot) {
    const winnerA = winnerTeam === 1 ? match.team1_player_a : match.team2_player_a;
    const winnerB = winnerTeam === 1 ? match.team1_player_b : match.team2_player_b;
    const winnerGuestA = winnerTeam === 1 ? match.team1_guest_a : match.team2_guest_a;
    const winnerGuestB = winnerTeam === 1 ? match.team1_guest_b : match.team2_guest_b;

    const slotUpdate = match.next_match_slot === 1
      ? { team1_player_a: winnerA, team1_player_b: winnerB, team1_guest_a: winnerGuestA, team1_guest_b: winnerGuestB }
      : { team2_player_a: winnerA, team2_player_b: winnerB, team2_guest_a: winnerGuestA, team2_guest_b: winnerGuestB };

    await supabase
      .from('bracket_matches')
      .update({ ...slotUpdate, updated_at: now })
      .eq('id', match.next_match_id);
  }

  return null;
}
