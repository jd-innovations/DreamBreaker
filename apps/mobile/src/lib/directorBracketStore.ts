import { getTournamentRegistrations } from '@/lib/registrationStore';
import { getDivisionsForTournament } from '@/data/divisions';
import type { Tournament } from '@/lib/tournamentTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DirectorBracketParticipant = {
  id: string;
  name: string;
  partnerName?: string;
  divisionId: string;
  seed: number;
};

export type DirectorBracketMatch = {
  id: string;
  tournamentId: string;
  divisionId: string;
  roundIndex: number;
  roundName: string;
  matchNumber: number;
  participant1: DirectorBracketParticipant | null;
  participant2: DirectorBracketParticipant | null;
  winnerId?: string;
  score1?: number;
  score2?: number;
  courtNumber?: number;
  completedAt?: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
};

export type DirectorBracketRound = {
  id: string;
  roundIndex: number;
  roundName: string;
  matches: DirectorBracketMatch[];
};

export type DirectorBracket = {
  id: string;
  tournamentId: string;
  divisionId: string;
  divisionName: string;
  bracketSize: number;
  participants: DirectorBracketParticipant[];
  rounds: DirectorBracketRound[];
  status: 'not_started' | 'in_progress' | 'completed';
  createdAt: string;
  completedAt?: string;
  championId?: string;
  championName?: string;
  runnerUpId?: string;
  runnerUpName?: string;
  publishedAt?: string;
};

// ─── Module stores ────────────────────────────────────────────────────────────

let _brackets: DirectorBracket[] = [];
let _counter = 0;

// Tournament completion overrides — tracks when all divisions complete
const _completedTournaments = new Set<string>();

function uid(): string { return `bkt-${++_counter}`; }

// ─── Score validation (Phase 2) ───────────────────────────────────────────────

function validateScores(score1: number, score2: number): string | null {
  if (!Number.isInteger(score1) || !Number.isInteger(score2)) return 'Scores must be whole numbers.';
  if (score1 < 0 || score2 < 0) return 'Scores cannot be negative.';
  if (score1 === score2) return 'Scores cannot be tied. No ties allowed.';
  const winner = Math.max(score1, score2);
  const loser  = Math.min(score1, score2);
  if (winner < 11) return 'Winning score must be at least 11.';
  if (winner - loser < 2) return 'Winner must win by at least 2 points.';
  return null;
}

// ─── Bracket generation helpers ───────────────────────────────────────────────

function smallestPow2(n: number): number {
  let p = 4;
  while (p < n) p *= 2;
  return Math.min(p, 32);
}

function roundNamesForSize(bracketSize: number): string[] {
  const numRounds = Math.log2(bracketSize);
  return Array.from({ length: numRounds }, (_, i) => {
    const fromEnd = numRounds - 1 - i;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinals';
    if (fromEnd === 2) return 'Quarterfinals';
    return `Round ${i + 1}`;
  });
}

function advanceWinner(
  rounds: DirectorBracketRound[],
  match: DirectorBracketMatch,
  winner: DirectorBracketParticipant,
): void {
  const nextRoundIdx = match.roundIndex + 1;
  if (nextRoundIdx >= rounds.length) return;
  const nextMatchIdx = Math.floor(match.matchNumber / 2);
  const nextMatch = rounds[nextRoundIdx].matches[nextMatchIdx];
  if (!nextMatch) return;
  if (match.matchNumber % 2 === 0) {
    nextMatch.participant1 = winner;
  } else {
    nextMatch.participant2 = winner;
  }
}

function buildBracket(
  tournamentId: string,
  divisionId: string,
  divisionName: string,
  participants: DirectorBracketParticipant[],
  bracketSize: number,
): DirectorBracket {
  const roundNames = roundNamesForSize(bracketSize);

  const rounds: DirectorBracketRound[] = roundNames.map((name, ri) => ({
    id: uid(),
    roundIndex: ri,
    roundName: name,
    matches: Array.from({ length: bracketSize / Math.pow(2, ri + 1) }, (_, mi) => ({
      id: uid(),
      tournamentId,
      divisionId,
      roundIndex: ri,
      roundName: name,
      matchNumber: mi,
      participant1: null,
      participant2: null,
      status: 'pending' as const,
    })),
  }));

  const slots: (DirectorBracketParticipant | null)[] = [
    ...participants,
    ...Array<null>(bracketSize - participants.length).fill(null),
  ];

  for (let mi = 0; mi < rounds[0].matches.length; mi++) {
    rounds[0].matches[mi].participant1 = slots[mi * 2] ?? null;
    rounds[0].matches[mi].participant2 = slots[mi * 2 + 1] ?? null;
  }

  // Auto-advance BYE matches
  for (const match of rounds[0].matches) {
    const p1 = match.participant1;
    const p2 = match.participant2;
    if (p1 !== null && p2 === null) {
      match.winnerId = p1.id; match.status = 'completed';
      advanceWinner(rounds, match, p1);
    } else if (p1 === null && p2 !== null) {
      match.winnerId = p2.id; match.status = 'completed';
      advanceWinner(rounds, match, p2);
    } else if (p1 === null && p2 === null) {
      match.status = 'completed';
    }
  }

  // Cascade BYEs through subsequent rounds
  let changed = true;
  while (changed) {
    changed = false;
    for (let ri = 1; ri < rounds.length; ri++) {
      for (const match of rounds[ri].matches) {
        if (match.status === 'completed') continue;
        const p1 = match.participant1;
        const p2 = match.participant2;
        if (p1 !== null && p2 === null) {
          match.winnerId = p1.id; match.status = 'completed';
          advanceWinner(rounds, match, p1); changed = true;
        } else if (p1 === null && p2 !== null) {
          match.winnerId = p2.id; match.status = 'completed';
          advanceWinner(rounds, match, p2); changed = true;
        } else if (p1 === null && p2 === null) {
          match.status = 'completed'; changed = true;
        }
      }
    }
  }

  return {
    id: uid(),
    tournamentId,
    divisionId,
    divisionName,
    bracketSize,
    participants,
    rounds,
    status: 'not_started',
    createdAt: new Date().toISOString(),
  };
}

// ─── Tournament completion check (Phase 11) ───────────────────────────────────

function checkAndCompleteTournament(tournamentId: string): void {
  const divisions = getDivisionsForTournament(tournamentId);
  if (divisions.length === 0) return;
  const allComplete = divisions.every(d => {
    const b = getBracket(tournamentId, d.id);
    return b?.status === 'completed';
  });
  if (allComplete) _completedTournaments.add(tournamentId);
}

// ─── Store APIs ───────────────────────────────────────────────────────────────

export function createBracket(tournamentId: string, divisionId: string): DirectorBracket {
  _brackets = _brackets.filter(
    b => !(b.tournamentId === tournamentId && b.divisionId === divisionId),
  );

  const divisions = getDivisionsForTournament(tournamentId);
  const division  = divisions.find(d => d.id === divisionId);

  const regs = getTournamentRegistrations(tournamentId).filter(
    r => r.divisionId === divisionId &&
         (r.status === 'registered' || r.status === 'checked_in'),
  );

  const sorted = [...regs].sort(
    (a, b) => new Date(a.registrationDate).getTime() - new Date(b.registrationDate).getTime(),
  );

  const participants: DirectorBracketParticipant[] = sorted.map((r, i) => ({
    id:          r.id,
    name:        r.playerName,
    partnerName: r.partnerName,
    divisionId:  r.divisionId,
    seed:        i + 1,
  }));

  const bracketSize = smallestPow2(participants.length);
  const bracket = buildBracket(
    tournamentId, divisionId, division?.name ?? 'Division', participants, bracketSize,
  );

  _brackets.push(bracket);
  return bracket;
}

export function getBracket(tournamentId: string, divisionId: string): DirectorBracket | null {
  return _brackets.find(
    b => b.tournamentId === tournamentId && b.divisionId === divisionId,
  ) ?? null;
}

export function getAllBrackets(tournamentId: string): DirectorBracket[] {
  return _brackets.filter(b => b.tournamentId === tournamentId);
}

export function hasBracket(tournamentId: string, divisionId: string): boolean {
  return _brackets.some(
    b => b.tournamentId === tournamentId && b.divisionId === divisionId,
  );
}

export function assignCourt(
  tournamentId: string,
  divisionId: string,
  matchId: string,
  courtNumber: number,
): void {
  const bracket = getBracket(tournamentId, divisionId);
  if (!bracket) return;
  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (match.id !== matchId) continue;
      match.courtNumber = courtNumber;
      if (match.status === 'pending') match.status = 'scheduled';
      return;
    }
  }
}

// Phase 1 + 2 + 5: saveMatchScore — validates, determines winner, advances, detects champion
export function saveMatchScore(
  tournamentId: string,
  divisionId: string,
  matchId: string,
  score1: number,
  score2: number,
): string | null {
  const error = validateScores(score1, score2);
  if (error) return error;

  const bracket = getBracket(tournamentId, divisionId);
  if (!bracket) return 'Bracket not found.';

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (match.id !== matchId) continue;

      const p1 = match.participant1;
      const p2 = match.participant2;
      if (!p1 || !p2) return 'Match participants not ready.';

      const winner = score1 > score2 ? p1 : p2;
      const loser  = score1 > score2 ? p2 : p1;

      match.score1       = score1;
      match.score2       = score2;
      match.winnerId     = winner.id;
      match.status       = 'completed';
      match.completedAt  = new Date().toISOString();

      const isFinal = match.roundIndex === bracket.rounds.length - 1;

      if (isFinal) {
        // Phase 5: champion detection
        bracket.championId   = winner.id;
        bracket.championName = winner.name;
        bracket.runnerUpId   = loser.id;
        bracket.runnerUpName = loser.name;
        bracket.completedAt  = new Date().toISOString();
        bracket.status       = 'completed';
        checkAndCompleteTournament(tournamentId);
      } else {
        advanceWinner(bracket.rounds, match, winner);
        bracket.status = 'in_progress';
      }

      return null;
    }
  }

  return 'Match not found.';
}

// Phase 7: publish results
export function publishAllBrackets(tournamentId: string): void {
  const now = new Date().toISOString();
  for (const bracket of _brackets.filter(b => b.tournamentId === tournamentId)) {
    bracket.publishedAt = now;
  }
}

export function clearBracket(tournamentId: string, divisionId: string): void {
  _brackets = _brackets.filter(
    b => !(b.tournamentId === tournamentId && b.divisionId === divisionId),
  );
}

// Phase 11: tournament status
export function isTournamentCompleted(tournamentId: string): boolean {
  return _completedTournaments.has(tournamentId);
}

export function getTournamentExtendedStatus(
  tournamentId: string,
  defaultStatus: Tournament['status'],
): Tournament['status'] {
  return _completedTournaments.has(tournamentId) ? 'completed' : defaultStatus;
}

// Bracket metrics helpers (Phase 9)
export function getBracketMatchCounts(tournamentId: string): {
  total: number;
  completed: number;
  remaining: number;
  completionPct: number;
} {
  const brackets = getAllBrackets(tournamentId);
  let total = 0;
  let completed = 0;
  for (const b of brackets) {
    for (const round of b.rounds) {
      for (const match of round.matches) {
        // Only count real matches (not double-BYE auto-completes with no participants)
        if (match.participant1 !== null || match.participant2 !== null) {
          total++;
          if (match.status === 'completed') completed++;
        }
      }
    }
  }
  const remaining = total - completed;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, remaining, completionPct };
}
