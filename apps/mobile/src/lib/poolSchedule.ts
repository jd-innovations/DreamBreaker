// Pool play scheduling: pure functions, no I/O (unit-testable without the
// app's module aliases). Used by lib/supabase/pools.ts.
import type { TournamentRegistration } from './registrationStore';

export const POOL_LETTERS = 'ABCDEFGHIJKLMNOP';
export const DEFAULT_ADVANCE_PER_POOL = 2;

type Team = TournamentRegistration;

/** Team rating for seeding: mean of the known DUPRs; null when unrated. */
export function teamRating(t: Team): number | null {
  const vals = [t.playerDupr, t.partnerDupr]
    .map(v => (v != null ? parseFloat(v) : NaN))
    .filter(v => !Number.isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Highest rated first; unrated keep registration order, after the rated. */
export function seedTeams(teams: Team[]): Team[] {
  return teams
    .map((t, i) => ({ t, i, r: teamRating(t) }))
    .sort((a, b) => {
      if (a.r != null && b.r != null && a.r !== b.r) return b.r - a.r;
      if (a.r != null && b.r == null) return -1;
      if (a.r == null && b.r != null) return 1;
      return a.i - b.i;
    })
    .map(x => x.t);
}

/** Snake ("serpentine") distribution, as web's serpentinePool does: A B C D, D C B A, ... */
export function snakePools<T>(seeded: T[], poolCount: number): T[][] {
  const pools: T[][] = Array.from({ length: poolCount }, () => []);
  seeded.forEach((team, i) => {
    const row = Math.floor(i / poolCount);
    const pos = i % poolCount;
    pools[row % 2 === 0 ? pos : poolCount - 1 - pos].push(team);
  });
  return pools;
}

/**
 * Round-robin rounds by the circle method: each round is a list of index
 * pairs. With an odd count, one team sits out each round (no match is created
 * for the bye).
 */
export function roundRobinRounds(n: number): [number, number][][] {
  const ids: (number | null)[] = Array.from({ length: n }, (_, i) => i);
  if (n % 2 === 1) ids.push(null);
  const m = ids.length;
  const rounds: [number, number][][] = [];
  for (let r = 0; r < m - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i];
      const b = ids[m - 1 - i];
      if (a != null && b != null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    // rotate all but the first
    ids.splice(1, 0, ids.pop() as number | null);
  }
  return rounds;
}

/**
 * A sensible pool count for `teams` teams, starting from `preferred`
 * (tournaments.pool_count). Pools get at least 3 teams where possible, and
 * never fewer than 2.
 */
export function suggestPoolCount(teams: number, preferred: number | null | undefined): number {
  if (teams < 4) return 1;
  const maxBySize = Math.max(1, Math.floor(teams / 3));
  return Math.min(Math.max(1, preferred ?? 4), maxBySize, POOL_LETTERS.length);
}

