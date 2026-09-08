import type { BMatch, BParticipant } from './bracketTypes';

let _brackets: Record<string, BMatch[][]> = {};

export function getBracket(tournamentId: string): BMatch[][] | null {
  return _brackets[tournamentId] ?? null;
}

export function setBracket(tournamentId: string, bracket: BMatch[][]): void {
  _brackets[tournamentId] = bracket;
}

export function getMatch(tournamentId: string, matchId: string): BMatch | null {
  const bracket = _brackets[tournamentId];
  if (!bracket) return null;
  for (const round of bracket) {
    const m = round.find(m => m.id === matchId);
    if (m) return m;
  }
  return null;
}

export function saveMatchResult(
  tournamentId: string,
  matchId: string,
  winnerId: string,
  score1: number,
  score2: number,
): void {
  const bracket = _brackets[tournamentId];
  if (!bracket) return;

  for (let rIdx = 0; rIdx < bracket.length; rIdx++) {
    const round = bracket[rIdx];
    for (let mIdx = 0; mIdx < round.length; mIdx++) {
      if (round[mIdx].id !== matchId) continue;

      const match = round[mIdx];
      const winner: BParticipant | null =
        match.player1?.id === winnerId ? match.player1 :
        match.player2?.id === winnerId ? match.player2 : null;

      bracket[rIdx][mIdx] = { ...match, status: 'completed', winnerId, score1, score2 };

      if (winner && !winner.isBye && rIdx + 1 < bracket.length) {
        const nextMIdx  = Math.floor(mIdx / 2);
        const isSlot1   = mIdx % 2 === 0;
        const nextMatch = bracket[rIdx + 1][nextMIdx];
        bracket[rIdx + 1][nextMIdx] = {
          ...nextMatch,
          player1: isSlot1 ? winner : nextMatch.player1,
          player2: isSlot1 ? nextMatch.player2 : winner,
        };
      }

      _brackets[tournamentId] = bracket.map(r => [...r]);
      return;
    }
  }
}

// Auto-complete any match where exactly one participant is present (BYE).
// Cascades through all rounds until no more changes occur.
export function autoAdvanceByes(bracket: BMatch[][]): BMatch[][] {
  let changed = true;
  while (changed) {
    changed = false;
    for (let rIdx = 0; rIdx < bracket.length; rIdx++) {
      for (let mIdx = 0; mIdx < bracket[rIdx].length; mIdx++) {
        const match = bracket[rIdx][mIdx];
        if (match.status === 'completed') continue;
        const p1 = match.player1;
        const p2 = match.player2;
        const isByeMatch = (p1 !== null && p2 === null) || (p1 === null && p2 !== null);
        if (!isByeMatch) continue;

        const winner = (p1 ?? p2)!;
        bracket[rIdx][mIdx] = { ...match, status: 'completed', winnerId: winner.id };

        if (rIdx + 1 < bracket.length) {
          const nextMIdx = Math.floor(mIdx / 2);
          const isSlot1  = mIdx % 2 === 0;
          const next     = bracket[rIdx + 1][nextMIdx];
          bracket[rIdx + 1][nextMIdx] = {
            ...next,
            player1: isSlot1 ? winner : next.player1,
            player2: isSlot1 ? next.player2 : winner,
          };
        }
        changed = true;
      }
    }
  }
  return bracket;
}

export function clearBracket(tournamentId: string): void {
  delete _brackets[tournamentId];
}

export function completedMatchCount(tournamentId: string): number {
  const bracket = _brackets[tournamentId];
  if (!bracket) return 0;
  return bracket.flat().filter(m => m.status === 'completed').length;
}
