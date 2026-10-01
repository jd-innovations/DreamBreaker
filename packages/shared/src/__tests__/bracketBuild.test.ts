import { describe, it, expect } from 'vitest';
import {
  activeTeamEntries, bracketPositions, bracketRoundLabel, bracketSizeFor, buildBracketMatchRows, openingRoundSeeds, seededSlots,
  type BracketTeam,
} from '../bracketBuild';

const team = (id: string): BracketTeam => ({ playerId: id, partnerId: null, playerGuestId: null, partnerGuestId: null });

function build(slots: (BracketTeam | null)[]) {
  let n = 0;
  return buildBracketMatchRows({
    tournamentId: 't', divisionId: 'd', slots, now: '2026-09-28T00:00:00Z',
    newId: () => `m${++n}`,
  });
}

describe('bracket sizing and labels', () => {
  it('sizes to the next power of two, minimum 4, with no cap', () => {
    expect(bracketSizeFor(2)).toBe(4);
    expect(bracketSizeFor(5)).toBe(8);
    expect(bracketSizeFor(44)).toBe(64);
    expect(bracketSizeFor(88)).toBe(128);
  });

  it('labels rounds from the final backwards', () => {
    expect(bracketRoundLabel(2, 3)).toBe('final');
    expect(bracketRoundLabel(1, 3)).toBe('sf');
    expect(bracketRoundLabel(0, 3)).toBe('qf');
    expect(bracketRoundLabel(0, 8)).toBe('pool');
  });

  it('places seeds so 1 and 2 can only meet in the final', () => {
    expect(bracketPositions(4)).toEqual([1, 4, 2, 3]);
    expect(bracketPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('gives byes to the top seeds', () => {
    const slots = seededSlots(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(slots).toEqual(['s1', null, 's4', 's5', 's2', null, 's3', 's6']);
  });
});

describe('activeTeamEntries', () => {
  type Reg = { id: string; self: string; partner: string | null; status: string; at: string };
  const view = (r: Reg) => ({ self: r.self, partner: r.partner, status: r.status, registeredAt: r.at });

  it('keeps registered and checked-in entries in registration order', () => {
    const regs: Reg[] = [
      { id: '2', self: 'b', partner: null, status: 'checked_in', at: '2026-09-02' },
      { id: '1', self: 'a', partner: null, status: 'registered', at: '2026-09-01' },
      { id: '3', self: 'c', partner: null, status: 'cancelled', at: '2026-09-03' },
    ];
    expect(activeTeamEntries(regs, view).map(r => r.id)).toEqual(['1', '2']);
  });

  it('drops the mirrored row of a doubles team', () => {
    const regs: Reg[] = [
      { id: '1', self: 'a', partner: 'b', status: 'registered', at: '2026-09-01' },
      { id: '2', self: 'b', partner: 'a', status: 'registered', at: '2026-09-02' },
      { id: '3', self: 'c', partner: 'd', status: 'registered', at: '2026-09-03' },
    ];
    expect(activeTeamEntries(regs, view).map(r => r.id)).toEqual(['1', '3']);
  });
});

describe('buildBracketMatchRows', () => {
  it('builds every match and links each to the next', () => {
    const rows = build([team('a'), team('b'), team('c'), team('d')]).filter(r => r.round !== 'bronze');
    expect(rows).toHaveLength(3);
    const final = rows.find(r => r.round === 'final')!;
    const semis = rows.filter(r => r.round === 'sf');
    expect(semis.map(r => [r.next_match_id, r.next_match_slot])).toEqual([[final.id, 1], [final.id, 2]]);
    expect(final.next_match_id).toBeNull();
    expect(rows.every(r => r.winner === null && r.completed_at === null)).toBe(true);
  });

  it('completes a first-round bye and advances the team', () => {
    const rows = build([team('a'), null, team('c'), team('d')]);
    const [bye, real] = rows.filter(r => r.round === 'sf');
    expect(bye.winner).toBe(1);
    expect(bye.completed_at).not.toBeNull();
    expect(real.winner).toBeNull();
    const final = rows.find(r => r.round === 'final')!;
    expect(final.team1_player_a).toBe('a');
    expect(final.team2_player_a).toBeNull(); // waiting on the real semifinal
  });

  it('does not let a bye cascade past a real match waiting to be played', () => {
    // 3 teams in 8 slots: a has a bye, but b-vs-c still has to be played.
    const rows = build([team('a'), null, null, null, team('b'), team('c'), null, null]);
    const final = rows.find(r => r.round === 'final')!;
    expect(final.winner).toBeNull();
    expect(final.completed_at).toBeNull();
  });

  it('carries guest identities', () => {
    const guest: BracketTeam = { playerId: null, partnerId: 'p2', playerGuestId: 'g1', partnerGuestId: null };
    const rows = build([guest, team('b'), team('c'), team('d')]);
    const first = rows.find(r => r.round === 'sf' && r.match_number === 0)!;
    expect(first.team1_guest_a).toBe('g1');
    expect(first.team1_player_b).toBe('p2');
    expect(first.team1_player_a).toBeNull();
  });

  it('adds a 3rd-place match fed by both semifinal losers', () => {
    const rows = build([team('a'), team('b'), team('c'), team('d')]);
    const bronze = rows.find(r => r.round === 'bronze')!;
    expect(bronze).toBeDefined();
    const semis = rows.filter(r => r.round === 'sf');
    expect(semis.map(r => [r.loser_next_match_id, r.loser_next_match_slot])).toEqual([[bronze.id, 1], [bronze.id, 2]]);
    expect(bronze.next_match_id).toBeNull();
    expect(bronze.team1_player_a).toBeNull();
  });

  it('skips the 3rd-place match when a semifinal is a walkover', () => {
    // 3 teams: a gets a bye through its semifinal, so only one real loser exists.
    const rows = build([team('a'), null, team('c'), team('d')]);
    expect(rows.some(r => r.round === 'bronze')).toBe(false);
    expect(rows.every(r => r.loser_next_match_id === null)).toBe(true);
  });

  it('builds no 3rd-place match when asked not to', () => {
    let n = 0;
    const rows = buildBracketMatchRows({
      tournamentId: 't', divisionId: 'd', slots: [team('a'), team('b'), team('c'), team('d')],
      now: '2026-09-28T00:00:00Z', newId: () => `m${++n}`, thirdPlace: false,
    });
    expect(rows.some(r => r.round === 'bronze')).toBe(false);
  });

  it('rejects slot counts that are not a power of two', () => {
    expect(() => build([team('a'), team('b'), team('c')])).toThrow();
  });
});

describe('openingRoundSeeds', () => {
  it('reads standard placement, byes on the top seeds', () => {
    // 6 teams in 8 slots: positions 1,8,4,5,2,7,3,6.
    const seeds = openingRoundSeeds([
      { team1: 'a', team2: null }, { team1: 'd', team2: 'e' },
      { team1: 'b', team2: null }, { team1: 'c', team2: 'f' },
    ]);
    expect(seeds && Object.fromEntries(seeds)).toEqual({ a: 1, d: 4, e: 5, b: 2, c: 3, f: 6 });
  });
  it('returns null for a bracket not built with standard placement', () => {
    expect(openingRoundSeeds([
      { team1: 'a', team2: 'b' }, { team1: 'c', team2: null },
      { team1: 'd', team2: 'e' }, { team1: 'f', team2: null },
    ])).toBeNull();
    expect(openingRoundSeeds([])).toBeNull();
  });
});
