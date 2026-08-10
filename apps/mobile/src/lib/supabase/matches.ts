import { supabase } from '@/lib/supabase';
import { validateScores } from '@/lib/supabase/brackets';

// ─── Court assignment ─────────────────────────────────────────────────────────

export async function assignCourt(matchId: string, courtNumber: number): Promise<void> {
  await supabase
    .from('bracket_matches')
    .update({ court: String(courtNumber), updated_at: new Date().toISOString() })
    .eq('id', matchId);
}

// ─── Score entry + winner advancement ────────────────────────────────────────

export async function saveMatchScore(
  matchId: string,
  score1: number,
  score2: number,
): Promise<string | null> {
  const validationError = validateScores(score1, score2);
  if (validationError) return validationError;

  // Fetch match to get player IDs and advancement links
  const { data: match, error: fetchError } = await supabase
    .from('bracket_matches')
    .select(
      'id, team1_player_a, team1_player_b, team2_player_a, team2_player_b, next_match_id, next_match_slot',
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

    const slotUpdate = match.next_match_slot === 1
      ? { team1_player_a: winnerA, team1_player_b: winnerB }
      : { team2_player_a: winnerA, team2_player_b: winnerB };

    await supabase
      .from('bracket_matches')
      .update({ ...slotUpdate, updated_at: now })
      .eq('id', match.next_match_id);
  }

  return null;
}
