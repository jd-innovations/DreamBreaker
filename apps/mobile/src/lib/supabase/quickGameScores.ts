import { supabase } from '@/lib/supabase';
import type { Tables } from '@shared/database.types';
import { validateQuickGameEntry, type QuickGameEntry } from '@/lib/quickGameScoring';

export { MAX_GAME_SCORE, validateQuickGameEntry, type QuickGameEntry } from '@/lib/quickGameScoring';

// ─── Quick Game scores ────────────────────────────────────────────────────────
// A Quick Game is a play_events row with event_type 'open_play' (see
// createQuickGame). Its games are stored in play_matches, the same table round
// robins and mini tournaments use, so they count in My Stats' community total
// (lib/stats/myStats.ts) without a second match system. One row per game:
// round = game number, match_number = 1, player_a/a2 vs player_b/b2 are
// play_participants ids of this event.
//
// Only the organizer writes. That is enforced by the existing
// "play_matches: organizer manage" RLS policy, not by this module.
//
// Finishing (play_events.status -> 'completed', via completePlayEvent) rates
// the games for PAR and locks the scores; reopen_quick_game() reverses that.
// Both rules live in migration 20260928210000_par_quick_games.

export type QuickGameMatch = Tables<'play_matches'>;

export type QuickGamePlayer = {
  id: string;
  name: string;
  initials: string;
  claimedBy: string | null;
};

function toRow(entry: QuickGameEntry) {
  return {
    player_a_id:  entry.teamA[0],
    player_a2_id: entry.teamA[1] ?? null,
    player_b_id:  entry.teamB[0],
    player_b2_id: entry.teamB[1] ?? null,
    score_a:      entry.scoreA,
    score_b:      entry.scoreB,
    winner:       entry.scoreA > entry.scoreB ? 1 : 2,
  };
}

// ─── Reads ────────────────────────────────────────────────────────────────────

// Roster via the participant views: the organizer and signed-in players can
// both read play_participants_authenticated, whereas the base table is
// organizer-only under RLS.
export async function fetchQuickGamePlayers(eventId: string, signedIn: boolean): Promise<QuickGamePlayer[]> {
  const table = signedIn ? 'play_participants_authenticated' : 'play_participants_public';
  const { data, error } = await (supabase as any)
    .from(table)
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((p) => {
    const first = (p.first_name ?? '').trim();
    const last = (p.last_initial ?? '').trim();
    return {
      id: p.id as string,
      name: last ? `${first} ${last}.` : first,
      initials: ((first.charAt(0) + last.charAt(0)).toUpperCase()) || '?',
      claimedBy: (p.claimed_by as string | null) ?? null,
    };
  });
}

export async function fetchQuickGameMatches(eventId: string): Promise<QuickGameMatch[]> {
  const { data, error } = await supabase
    .from('play_matches')
    .select('*')
    .eq('event_id', eventId)
    .order('round', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// The viewer's own active PAR change per game of this Quick Game, keyed by
// play_matches id. Additive: failures return an empty map.
export async function fetchMyQuickGameParChanges(eventId: string, profileId: string): Promise<Map<string, number>> {
  const byGame = new Map<string, number>();
  const { data, error } = await (supabase as any)
    .from('par_rating_events')
    .select('game_id, par_change')
    .eq('session_id', eventId)
    .eq('profile_id', profileId)
    .eq('event_type', 'game_processed')
    .is('reversed_at', null);
  if (error) {
    console.warn('[quickGameScores] PAR changes unavailable:', error.message);
    return byGame;
  }
  for (const row of (data ?? []) as { game_id: string; par_change: number }[]) {
    byGame.set(row.game_id, Number(row.par_change));
  }
  return byGame;
}

// Raised by the finish lock (fn_play_matches_lock_finished / guard_finished).
export function isQuickGameFinishedError(e: unknown): boolean {
  return !!e && typeof e === 'object' && 'message' in e
    && String((e as { message: unknown }).message).includes('quick_game_finished');
}

// ─── Writes (organizer only) ──────────────────────────────────────────────────

export async function recordQuickGame(eventId: string, entry: QuickGameEntry, rosterIds: readonly string[]): Promise<void> {
  const invalid = validateQuickGameEntry(entry, rosterIds);
  if (invalid) throw new Error(invalid);

  const { data: last, error: lastErr } = await supabase
    .from('play_matches')
    .select('round')
    .eq('event_id', eventId)
    .order('round', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw lastErr;

  const { error } = await supabase.from('play_matches').insert({
    event_id: eventId,
    round: (last?.round ?? 0) + 1,
    match_number: 1,
    ...toRow(entry),
  });
  if (error) throw error;
}

export async function updateQuickGame(matchId: string, entry: QuickGameEntry, rosterIds: readonly string[]): Promise<void> {
  const invalid = validateQuickGameEntry(entry, rosterIds);
  if (invalid) throw new Error(invalid);

  const { error } = await supabase
    .from('play_matches')
    .update({ ...toRow(entry), updated_at: new Date().toISOString() })
    .eq('id', matchId);
  if (error) throw error;
}

export async function deleteQuickGame(matchId: string): Promise<void> {
  const { error } = await supabase.from('play_matches').delete().eq('id', matchId);
  if (error) throw error;
}

// ─── Score flags (migration 20260928220000) ───────────────────────────────────
// A registered player in a finished game can flag it. While any flag is open
// the game is out of PAR for everyone. It clears when the flagger withdraws or
// the organizer corrects that game's score; the organizer can't dismiss it.

export type QuickGameFlag = {
  id: string;
  match_id: string;
  flagged_by: string;
  status: 'open' | 'withdrawn' | 'resolved';
  created_at: string;
};

export async function fetchOpenQuickGameFlags(eventId: string): Promise<QuickGameFlag[]> {
  const { data, error } = await (supabase as any)
    .from('play_match_score_flags')
    .select('id, match_id, flagged_by, status, created_at')
    .eq('event_id', eventId)
    .eq('status', 'open');
  if (error) throw error;
  return (data ?? []) as QuickGameFlag[];
}

export async function flagQuickGameScore(matchId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('flag_quick_game_score', { p_match_id: matchId });
  if (error) throw error;
}

export async function withdrawQuickGameFlag(matchId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('withdraw_quick_game_flag', { p_match_id: matchId });
  if (error) throw error;
}

// Reverses the Quick Game's PAR changes and returns it to open (or full) so
// its scores can be edited. Finishing again re-rates it.
export async function reopenQuickGame(eventId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('reopen_quick_game', { p_event_id: eventId });
  if (error) throw error;
}
