// Pure rules for a Quick Game score entry, kept free of the Supabase client so
// they can be unit-tested (see vitest.config.mts) and shared by the entry card
// and the writes in lib/supabase/quickGameScores.ts.

export type QuickGameEntry = {
  teamA: string[];
  teamB: string[];
  scoreA: number;
  scoreB: number;
};

export const MAX_GAME_SCORE = 99;

// Returns a user-facing error message, or null when the entry is valid.
// Pure, so the screen can disable Save with the same rules the writes enforce.
export function validateQuickGameEntry(entry: QuickGameEntry, rosterIds: readonly string[]): string | null {
  const { teamA, teamB, scoreA, scoreB } = entry;
  if (teamA.length === 0 || teamB.length === 0) return 'Pick players for both teams.';
  if (teamA.length > 2 || teamB.length > 2) return 'A team has one or two players.';
  if (teamA.length !== teamB.length) return 'Both teams need the same number of players.';
  const all = [...teamA, ...teamB];
  if (new Set(all).size !== all.length) return 'A player can only be on one team.';
  const roster = new Set(rosterIds);
  if (all.some(id => !roster.has(id))) return 'Every player must be on this game’s roster.';
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return 'Enter both scores.';
  if (scoreA < 0 || scoreB < 0 || scoreA > MAX_GAME_SCORE || scoreB > MAX_GAME_SCORE) {
    return `Scores must be between 0 and ${MAX_GAME_SCORE}.`;
  }
  if (scoreA === scoreB) return 'Scores can’t be tied. A game needs a winner.';
  return null;
}
