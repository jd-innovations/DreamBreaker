import { describe, it, expect } from 'vitest';
import type { BracketTeam } from '../bracketBuild';
import {
  buildPoolMatchRows, cutoffTies, maxPoolCount, meanRating, placeSeeds, poolBracketSize, poolSizes, poolTeamKey,
  roundRobinRounds, seedByRating, seedQualifiers, snakePools, suggestPoolCount, type SeedableStanding,
} from '../poolSchedule';

const team = (id: string): BracketTeam => ({ playerId: id, partnerId: null, playerGuestId: null, partnerGuestId: null });

describe('rating and pool placement', () => {
  it('averages known ratings and ignores missing ones', () => {
    expect(meanRating(['4.0', 3.5])).toBe(3.75);
    expect(meanRating([null, '4.2'])).toBe(4.2);
    expect(meanRating([null, undefined, 'n/a'])).toBeNull();
  });

  it('seeds rated teams first, unrated in registration order', () => {
    const r: Record<string, number | null> = { a: null, b: 3.5, c: 4.5, d: null };
    expect(seedByRating(['a', 'b', 'c', 'd'], t => r[t])).toEqual(['c', 'b', 'a', 'd']);
  });

  it('snakes seeds across pools', () => {
    expect(snakePools([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([[1, 8], [2, 7], [3, 6], [4, 5]]);
    expect(snakePools([1, 2, 3, 4, 5], 2)).toEqual([[1, 4, 5], [2, 3]]);
  });

  it('suggests and caps pool counts', () => {
    expect(suggestPoolCount(3, 4)).toBe(1);
    expect(suggestPoolCount(12, 4)).toBe(4);
    expect(suggestPoolCount(9, 4)).toBe(3);
    expect(maxPoolCount(9)).toBe(4);
    expect(maxPoolCount(100)).toBe(16);
  });

  it('describes pool sizes and match counts', () => {
    expect(poolSizes(12, 4)).toEqual({ label: '4 pools of 3', smallest: 3, matches: 12 });
    expect(poolSizes(10, 3)).toEqual({ label: '1 of 4 and 2 of 3', smallest: 3, matches: 12 });
  });
});

describe('round robin', () => {
  it('pairs everyone exactly once', () => {
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const pairs = roundRobinRounds(n).flat().map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join('-'));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      expect(pairs.length).toBe((n * (n - 1)) / 2);
    }
  });

  it('interleaves pools round by round with running match numbers', () => {
    const rows = buildPoolMatchRows({
      tournamentId: 't', divisionId: 'd', now: 'now',
      pools: [[team('a1'), team('a2'), team('a3')], [team('b1'), team('b2'), team('b3')]],
    });
    expect(rows).toHaveLength(6);
    expect(rows.map(r => r.pool_label)).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
    expect(rows.map(r => r.match_number)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rows.every(r => r.round === 'pool')).toBe(true);
  });

  it('writes guests to guest columns only', () => {
    const [row] = buildPoolMatchRows({
      tournamentId: 't', divisionId: 'd', now: 'now',
      pools: [[
        { playerId: 'p1', partnerId: 'x', playerGuestId: null, partnerGuestId: 'g1' },
        { playerId: 'p2', partnerId: 'p3', playerGuestId: null, partnerGuestId: null },
      ]],
    });
    expect(row.team1_player_a).toBe('p1');
    expect(row.team1_player_b).toBeNull();
    expect(row.team1_guest_b).toBe('g1');
    expect(row.team2_player_b).toBe('p3');
  });

  it('keys teams as the standings function does', () => {
    expect(poolTeamKey({ playerId: 'p1', partnerId: 'p2', playerGuestId: null, partnerGuestId: null })).toBe('p1|p2');
    expect(poolTeamKey({ playerId: 'p1', partnerId: null, playerGuestId: null, partnerGuestId: 'g1' })).toBe('p1|g1');
    expect(poolTeamKey(team('solo'))).toBe('solo');
  });
});

describe('building the bracket from pools', () => {
  const row = (teamKey: string, rank: number, wins: number, diff = 0, pointsFor = 0): SeedableStanding & { h2hWins?: number } =>
    ({ teamKey, rank, wins, diff, pointsFor });

  const pools = [
    { label: 'A', standings: [row('a1', 1, 3, 10), row('a2', 2, 2, 4), row('a3', 3, 1)] },
    { label: 'B', standings: [row('b1', 1, 3, 12), row('b2', 2, 2, 2), row('b3', 3, 0)] },
  ];

  it('seeds every winner before every runner-up, then by record', () => {
    expect(seedQualifiers(pools, 2).map(s => `${s.seed}:${s.teamKey}`)).toEqual(['1:b1', '2:a1', '3:a2', '4:b2']);
  });

  it('keeps same-pool teams apart in round one', () => {
    const slots = placeSeeds(seedQualifiers(pools, 2), 4);
    for (let i = 0; i < slots.length; i += 2) expect(slots[i]!.pool).not.toBe(slots[i + 1]!.pool);
  });

  it('gives byes to the top seeds', () => {
    const three = [pools[0], pools[1], { label: 'C', standings: [row('c1', 1, 1)] }];
    const seeds = seedQualifiers(three, 1);
    const size = poolBracketSize(seeds.length);
    expect(size).toBe(4);
    const slots = placeSeeds(seeds, size);
    expect(slots.filter(s => s === null)).toHaveLength(1);
    const byeIdx = slots.indexOf(null);
    expect(slots[byeIdx % 2 === 0 ? byeIdx + 1 : byeIdx - 1]!.seed).toBe(1);
  });

  it('flags an exact tie at the cut', () => {
    const tied = [{ label: 'A', standings: [row('a1', 1, 2), row('a2', 2, 1, 0, 20), row('a3', 3, 1, 0, 20)] }];
    expect(cutoffTies(tied, 2)).toEqual(['A']);
    expect(cutoffTies(pools, 2)).toEqual([]);
  });
});
