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

/** Unfinished matches holding a court, per division id. */
export function onCourtByDivision(inUse: CourtInUse[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of inUse) {
    if (c.divisionId) out.set(c.divisionId, (out.get(c.divisionId) ?? 0) + 1);
  }
  return out;
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

// ─── 3rd-place match (20260928270000) ─────────────────────────────────────────

const THIRD_PLACE_ERRORS: Record<string, string> = {
  not_allowed:        'Only this tournament’s director or an admin can change the bracket.',
  already_exists:     'This bracket already has a 3rd-place match.',
  no_semifinals:      'This bracket has no semifinals yet.',
  semifinal_walkover: 'A semifinal was a walkover, so there is no second team to play for 3rd.',
};

/** Adds a 3rd-place match to an existing bracket, keeping every score. */
export async function addThirdPlaceMatch(
  tournamentId: string,
  divisionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('add_third_place_match', {
    p_tournament_id: tournamentId, p_division_id: divisionId,
  });
  if (!error) return { ok: true };
  const code = Object.keys(THIRD_PLACE_ERRORS).find(k => error.message?.includes(k));
  return { ok: false, error: code ? THIRD_PLACE_ERRORS[code] : 'Could not add the 3rd-place match. Please try again.' };
}

// ─── Score entry + winner advancement ────────────────────────────────────────

export async function saveMatchScore(
  matchId: string,
  score1: number,
  score2: number,
): Promise<string | null> {
  const validationError = validateScores(score1, score2);
  if (validationError) return validationError;

  // One server call records the score and advances the winner (guest slots
  // included) in a single transaction: record_match_score, migration
  // 20260928240000. It replaced two client writes, where a failed second write
  // left a winner who never advanced. Web Day Of uses the same function.
  const { error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  }).rpc('record_match_score', { p_match_id: matchId, p_score1: score1, p_score2: score2 });

  if (!error) return null;
  const code = Object.keys(RECORD_ERRORS).find(k => error.message?.includes(k));
  return code ? RECORD_ERRORS[code] : 'Failed to save score.';
}

const RECORD_ERRORS: Record<string, string> = {
  not_allowed:          'Only this tournament’s director or an admin can enter scores.',
  already_scored:       'This match already has a score. Use Edit score to change it.',
  teams_not_set:        'Both teams need to be known before a score can be entered.',
  invalid_score:        'Win to 11, win by 2, no ties.',
  tournament_cancelled: 'This tournament was cancelled.',
  match_not_found:      'Match not found.',
};

// ─── Score corrections (20260928190000) ───────────────────────────────────────
// Director / admin only, all-or-nothing in the database. A winner change clears
// any later results on that path that were already played.

const CORRECTION_ERRORS: Record<string, string> = {
  not_allowed:         'Only this tournament\u2019s director or an admin can edit scores.',
  match_not_completed: 'This match has no result to correct yet.',
  reason_required:     'Please give a reason for the correction.',
  invalid_score:       'Win to 11, win by 2, no ties.',
  match_not_found:     'This match no longer exists.',
};

export async function previewScoreCorrection(
  matchId: string,
  score1: number,
  score2: number,
): Promise<{ winnerChanged: boolean; clearedCount: number } | null> {
  const { data, error } = await supabase.rpc('preview_score_correction', {
    p_match_id: matchId, p_score1: score1, p_score2: score2,
  });
  const d = data as { ok?: boolean; winner_changed?: boolean; cleared_count?: number } | null;
  if (error || !d?.ok) return null;
  return { winnerChanged: !!d.winner_changed, clearedCount: d.cleared_count ?? 0 };
}

export async function correctMatchScore(
  matchId: string,
  score1: number,
  score2: number,
  reason: string,
): Promise<{ ok: true; clearedCount: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('correct_match_score', {
    p_match_id: matchId, p_score1: score1, p_score2: score2, p_reason: reason,
  });
  if (error) {
    const code = Object.keys(CORRECTION_ERRORS).find(k => error.message?.includes(k));
    return { ok: false, error: code ? CORRECTION_ERRORS[code] : 'Could not correct the score. Please try again.' };
  }
  const d = data as { cleared_count?: number } | null;
  return { ok: true, clearedCount: d?.cleared_count ?? 0 };
}

export type ScoreEditDetail = {
  editedAt: string;
  reason: string;
  editorName: string | null;
  oldScore1?: number;
  oldScore2?: number;
};

/** Latest correction with editor and reason. Readable only by the director / admins (RLS). */
export async function fetchLatestScoreEdit(matchId: string): Promise<ScoreEditDetail | null> {
  const { data } = await supabase
    .from('bracket_match_score_edits')
    .select('edited_at, reason, old_score_team1, old_score_team2, editor:profiles!bracket_match_score_edits_edited_by_fkey(full_name)')
    .eq('match_id', matchId)
    .order('edited_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const editor = data.editor as { full_name?: string | null } | null;
  return {
    editedAt:   data.edited_at,
    reason:     data.reason,
    editorName: editor?.full_name ?? null,
    oldScore1:  data.old_score_team1?.[0],
    oldScore2:  data.old_score_team2?.[0],
  };
}
