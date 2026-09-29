// Pool Play → Bracket rules, shared by web and mobile so the two apps can never
// place pools, schedule them or seed the bracket differently. Pure: no database,
// no platform APIs.
//
// Moved from apps/mobile/src/lib/poolSchedule.ts on 2026-09-28 for web parity
// (DIRECTOR_HUB_WEB_PARITY.md, W3). Owner decisions (2026-09-28): pools are
// placed automatically by rating (snake order); 2 advance per pool by default;
// bracket seeding is tier first (every pool winner, then every runner-up), then
// pool record; no first-round meeting between teams from the same pool.
// Standings themselves come from division_pool_standings() in the database.

import { bracketPositions, type BracketTeam } from './bracketBuild';

export const POOL_LETTERS = 'ABCDEFGHIJKLMNOP';
export const DEFAULT_ADVANCE_PER_POOL = 2;

/** Mean of the known ratings (DUPR as number or numeric string); null when none. */
export function meanRating(values: (string | number | null | undefined)[]): number | null {
  const vals = values
    .map(v => (v == null ? NaN : typeof v === 'number' ? v : parseFloat(v)))
    .filter(v => !Number.isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Highest rated first; unrated keep their incoming (registration) order, after the rated. */
export function seedByRating<T>(teams: T[], rating: (t: T) => number | null): T[] {
  return teams
    .map((t, i) => ({ t, i, r: rating(t) }))
    .sort((a, b) => {
      if (a.r != null && b.r != null && a.r !== b.r) return b.r - a.r;
      if (a.r != null && b.r == null) return -1;
      if (a.r == null && b.r != null) return 1;
      return a.i - b.i;
    })
    .map(x => x.t);
}

/** Snake ("serpentine") distribution: A B C D, D C B A, ... */
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

/** The most pools `teams` teams allow (at least 2 per pool, at most 16). */
export function maxPoolCount(teams: number): number {
  return Math.max(1, Math.min(Math.floor(teams / 2), POOL_LETTERS.length));
}

/** Snake sizes for a preview: "4 pools of 3", "2 of 4 and 1 of 3", and the match count. */
export function poolSizes(teams: number, pools: number): { label: string; smallest: number; matches: number } {
  const base = Math.floor(teams / pools);
  const extra = teams % pools;
  const rr = (n: number) => (n * (n - 1)) / 2;
  return {
    label: extra === 0
      ? `${pools} ${pools === 1 ? 'pool' : 'pools'} of ${base}`
      : `${extra} of ${base + 1} and ${pools - extra} of ${base}`,
    smallest: base,
    matches: extra * rr(base + 1) + (pools - extra) * rr(base),
  };
}

export type PoolMatchInsert = {
  tournament_id: string;
  division_id: string;
  round: 'pool';
  pool_label: string;
  match_number: number;
  team1_player_a: string | null;
  team1_player_b: string | null;
  team1_guest_a: string | null;
  team1_guest_b: string | null;
  team2_player_a: string | null;
  team2_player_b: string | null;
  team2_guest_a: string | null;
  team2_guest_b: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Round-robin rows for every pool. The schedule interleaves: round 1 of every
 * pool, then round 2 of every pool, and so on. match_number follows that order,
 * so the court queue's tie-break (match number) rotates across pools.
 */
export function buildPoolMatchRows(input: {
  tournamentId: string;
  divisionId: string;
  pools: BracketTeam[][];
  now: string;
}): PoolMatchInsert[] {
  const perPool = input.pools.map(p => roundRobinRounds(p.length));
  const maxRounds = Math.max(0, ...perPool.map(r => r.length));
  const rows: PoolMatchInsert[] = [];
  let seq = 0;
  for (let r = 0; r < maxRounds; r++) {
    input.pools.forEach((pool, pi) => {
      for (const [i, j] of perPool[pi][r] ?? []) {
        const t1 = pool[i];
        const t2 = pool[j];
        rows.push({
          tournament_id: input.tournamentId,
          division_id: input.divisionId,
          round: 'pool',
          pool_label: POOL_LETTERS[pi],
          match_number: seq++,
          team1_player_a: t1.playerGuestId ? null : t1.playerId,
          team1_player_b: t1.partnerGuestId ? null : t1.partnerId ?? null,
          team1_guest_a: t1.playerGuestId ?? null,
          team1_guest_b: t1.partnerGuestId ?? null,
          team2_player_a: t2.playerGuestId ? null : t2.playerId,
          team2_player_b: t2.partnerGuestId ? null : t2.partnerId ?? null,
          team2_guest_a: t2.playerGuestId ?? null,
          team2_guest_b: t2.partnerGuestId ?? null,
          created_at: input.now,
          updated_at: input.now,
        });
      }
    });
  }
  return rows;
}

/** The identity division_pool_standings() uses for team_key: self|partner (guest id over profile id). */
export function poolTeamKey(t: BracketTeam): string {
  return [t.playerGuestId ?? t.playerId, t.partnerGuestId ?? t.partnerId].filter(Boolean).join('|');
}

// ─── Step 2: seeding pool qualifiers into the bracket ────────────────────────

/** What seeding needs from a standings row. */
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

export { bracketPositions };

/**
 * Qualifiers in seed order, by tier then pool record: every pool winner
 * first, then every runner-up, and so on. Within a tier: wins, then point
 * difference, then points scored, then team key (stable).
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

/** Bracket size for the qualifiers: the next power of two, minimum 4. */
export function poolBracketSize(qualifiers: number): number {
  let size = 4;
  while (size < qualifiers) size *= 2;
  return size;
}
