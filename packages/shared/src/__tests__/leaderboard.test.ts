import { describe, it, expect } from 'vitest';
import { divisionLeaderboard, type LeaderboardMatch } from '../leaderboard';

let n = 0;
function m(round: string, t1: string | null, t2: string | null, result?: [number, number], extra: Partial<LeaderboardMatch> = {}): LeaderboardMatch {
  const done = !!result;
  return {
    id: `m${++n}`, round, poolLabel: null, matchNumber: n,
    team1: t1 ? [t1] : [], team2: t2 ? [t2] : [],
    team1Name: t1, team2Name: t2,
    score1: result?.[0] ?? null, score2: result?.[1] ?? null,
    winner: done ? (result![0] > result![1] ? 1 : 2) : null,
    completed: done, court: null, ...extra,
  };
}
const byName = (rows: ReturnType<typeof divisionLeaderboard>) => new Map(rows.map(r => [r.name, r]));

describe('divisionLeaderboard', () => {
  // 8 teams: A..H. QF: A-B, C-D, E-F, G-H.
  const qf = [m('qf', 'A', 'B', [11, 3]), m('qf', 'C', 'D', [11, 9]), m('qf', 'E', 'F', [5, 11]), m('qf', 'G', 'H', [11, 7])];

  it('places a finished bracket with a 3rd-place match', () => {
    const rows = divisionLeaderboard([
      ...qf,
      m('sf', 'A', 'C', [11, 8]), m('sf', 'F', 'G', [9, 11]),
      m('bronze', 'C', 'F', [11, 6]),
      m('final', 'A', 'G', [11, 4]),
    ]);
    const t = byName(rows);
    expect(t.get('A')!.placeLabel).toBe('Champion');
    expect(t.get('G')!.placeLabel).toBe('2nd');
    expect(t.get('C')!.placeLabel).toBe('3rd');
    expect(t.get('F')!.placeLabel).toBe('4th');
    expect(['B', 'D', 'E', 'H'].map(k => t.get(k)!.placeLabel)).toEqual(['T5', 'T5', 'T5', 'T5']);
    expect(rows.map(r => r.name).slice(0, 4)).toEqual(['A', 'G', 'C', 'F']);
    // T5 ordered by point difference: D -2, H -4, E -6, B -8.
    expect(rows.slice(4).map(r => r.name)).toEqual(['D', 'H', 'E', 'B']);
  });

  it('ties semifinal losers at T3 without a 3rd-place match', () => {
    const rows = divisionLeaderboard([...qf, m('sf', 'A', 'C', [11, 8]), m('sf', 'F', 'G', [9, 11]), m('final', 'A', 'G', [11, 4])]);
    const t = byName(rows);
    expect(t.get('C')!.placeLabel).toBe('T3');
    expect(t.get('F')!.placeLabel).toBe('T3');
  });

  it('shows teams still in with their next round and court', () => {
    const rows = divisionLeaderboard([...qf, m('sf', 'A', 'C', undefined, { court: '4' }), m('sf', 'F', 'G'), m('final', null, null)]);
    const t = byName(rows);
    expect(t.get('A')!.status).toBe('in');
    expect(t.get('A')!.currentRound).toBe('Semifinals');
    expect(t.get('A')!.onCourt).toBe('4');
    expect(t.get('B')!.placeLabel).toBe('T5');
    expect(rows.slice(0, 4).every(r => r.status === 'in')).toBe(true);
  });

  it('keeps semifinal losers in while the 3rd-place match is unplayed', () => {
    const rows = divisionLeaderboard([...qf, m('sf', 'A', 'C', [11, 8]), m('sf', 'F', 'G', [9, 11]), m('bronze', 'C', 'F'), m('final', 'A', 'G')]);
    const t = byName(rows);
    expect(t.get('C')!.status).toBe('in');
    expect(t.get('C')!.currentRound).toBe('3rd Place');
  });

  it('counts records but ignores byes', () => {
    const rows = divisionLeaderboard([m('sf', 'A', null, undefined, { winner: 1, completed: true }), m('sf', 'B', 'C', [11, 2]), m('final', 'A', 'B')]);
    const a = byName(rows).get('A')!;
    expect([a.wins, a.losses]).toEqual([0, 0]);
    const b = byName(rows).get('B')!;
    expect([b.wins, b.pointDiff]).toEqual([1, 9]);
  });

  it('ranks teams knocked out in pools below the bracket', () => {
    const pool = (t1: string, t2: string, r: [number, number]) => m('pool', t1, t2, r, { poolLabel: 'A' });
    const rows = divisionLeaderboard([
      pool('A', 'B', [11, 5]), pool('A', 'C', [11, 6]), pool('B', 'C', [11, 9]),
      m('final', 'A', 'B'),
    ]);
    const c = byName(rows).get('C')!;
    expect(c.status).toBe('pool');
    expect(rows.at(-1)!.name).toBe('C');
  });
});
