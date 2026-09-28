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


// ─── Step 2: seeding pool qualifiers into the bracket ────────────────────────

/** What seeding needs from a standings row (lib/supabase/pools PoolStanding). */
export type SeedableStanding = {
  teamKey: string;
  rank: number;
  wins: number;
  diff: number;
  pointsFor: number;
};

export type QualifiedSeed<T extends SeedableStanding = SeedableStanding> = T & {
  pool: string;
  /** 1-based overall seed. */
  seed: number;
};

/**
 * Standard bracket slot order for a power-of-two size, as seed numbers:
 * 4 -> [1,4,2,3], 8 -> [1,8,4,5,2,7,3,6]. Adjacent pairs are first-round
 * matches; the top two seeds can only meet in the final.
 */
export function bracketPositions(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const m = order.length * 2;
    order = order.flatMap(s => [s, m + 1 - s]);
  }
  return order;
}

/**
 * Qualifiers in seed order, by tier then pool record (owner's choice
 * 2026-09-28): every pool winner first, then every runner-up, and so on.
 * Within a tier: wins, then point difference, then points scored, then team
 * key (stable).
 */
export function seedQualifiers<T extends SeedableStanding>(
  pools: { label: string; standings: T[] }[],
  advancePerPool: number,
): QualifiedSeed<T>[] {
  const out: QualifiedSeed<T>[] = [];
  for (let rank = 1; rank <= advancePerPool; rank++) {
    const tier = pools
      .map(p => {
        const row = p.standings.find(s => s.rank === rank);
        return row ? { ...row, pool: p.label } : null;
      })
      .filter((x): x is T & { pool: string } => x !== null)
      .sort((a, b) =>
        b.wins - a.wins || b.diff - a.diff || b.pointsFor - a.pointsFor || a.teamKey.localeCompare(b.teamKey));
    for (const t of tier) out.push({ ...t, seed: out.length + 1 });
  }
  return out;
}

/**
 * Places seeds into bracket slots (null = bye; top seeds get the byes) and
 * then breaks any first-round pairing of two teams from the same pool by
 * swapping the lower seed with a same-tier team elsewhere.
 */
export function placeSeeds<T extends SeedableStanding>(
  seeds: QualifiedSeed<T>[],
  size: number,
): (QualifiedSeed<T> | null)[] {
  const slots: (QualifiedSeed<T> | null)[] = bracketPositions(size).map(n => seeds[n - 1] ?? null);

  const pairOf = (i: number) => (i % 2 === 0 ? i + 1 : i - 1);
  const clash = (i: number) => {
    const a = slots[i];
    const b = slots[pairOf(i)];
    return !!a && !!b && a.pool === b.pool;
  };

  for (let i = 0; i < slots.length; i += 2) {
    if (!clash(i)) continue;
    const a = slots[i]!;
    const b = slots[i + 1]!;
    // Move the lower seed of the pair.
    const lowIdx = a.seed > b.seed ? i : i + 1;
    const low = slots[lowIdx]!;
    const keep = slots[pairOf(lowIdx)]!;
    for (let j = 0; j < slots.length; j++) {
      if (j === lowIdx || j === pairOf(lowIdx)) continue;
      const cand = slots[j];
      if (!cand || cand.rank !== low.rank) continue;          // same tier only
      if (cand.pool === keep.pool) continue;                  // would clash here
      const other = slots[pairOf(j)];
      if (other && other.pool === low.pool) continue;         // would clash there
      slots[j] = low;
      slots[lowIdx] = cand;
      break;
    }
  }
  return slots;
}

/**
 * Pools where the last qualifier and the first non-qualifier are level on
 * every tie-break, so the cut was decided by the internal team key.
 */
export function cutoffTies<T extends SeedableStanding & { h2hWins?: number }>(
  pools: { label: string; standings: T[] }[],
  advancePerPool: number,
): string[] {
  return pools
    .filter(p => {
      const inn = p.standings.find(s => s.rank === advancePerPool);
      const out = p.standings.find(s => s.rank === advancePerPool + 1);
      return !!inn && !!out
        && inn.wins === out.wins && (inn.h2hWins ?? 0) === (out.h2hWins ?? 0)
        && inn.diff === out.diff && inn.pointsFor === out.pointsFor;
    })
    .map(p => p.label);
}
