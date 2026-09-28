import { describe, it, expect } from 'vitest';
import { validateQuickGameEntry, MAX_GAME_SCORE } from '../quickGameScoring';

const roster = ['p1', 'p2', 'p3', 'p4'];

describe('validateQuickGameEntry', () => {
  it('accepts a doubles game', () => {
    expect(validateQuickGameEntry({ teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], scoreA: 11, scoreB: 7 }, roster)).toBeNull();
  });

  it('accepts a singles game', () => {
    expect(validateQuickGameEntry({ teamA: ['p1'], teamB: ['p3'], scoreA: 9, scoreB: 11 }, roster)).toBeNull();
  });

  it('requires both teams', () => {
    expect(validateQuickGameEntry({ teamA: [], teamB: ['p3'], scoreA: 11, scoreB: 7 }, roster)).toMatch(/both teams/);
  });

  it('rejects uneven teams', () => {
    expect(validateQuickGameEntry({ teamA: ['p1', 'p2'], teamB: ['p3'], scoreA: 11, scoreB: 7 }, roster)).toMatch(/same number/);
  });

  it('rejects teams of three', () => {
    expect(validateQuickGameEntry({ teamA: ['p1', 'p2', 'p3'], teamB: ['p4', 'p5', 'p6'], scoreA: 11, scoreB: 7 }, roster)).toMatch(/one or two/);
  });

  it('rejects a player on both teams', () => {
    expect(validateQuickGameEntry({ teamA: ['p1', 'p2'], teamB: ['p2', 'p3'], scoreA: 11, scoreB: 7 }, roster)).toMatch(/one team/);
  });

  it('rejects a player who is not on the roster', () => {
    expect(validateQuickGameEntry({ teamA: ['p1'], teamB: ['stranger'], scoreA: 11, scoreB: 7 }, roster)).toMatch(/roster/);
  });

  it('rejects a tie', () => {
    expect(validateQuickGameEntry({ teamA: ['p1'], teamB: ['p2'], scoreA: 10, scoreB: 10 }, roster)).toMatch(/tied/);
  });

  it('rejects missing, negative, fractional and out-of-range scores', () => {
    expect(validateQuickGameEntry({ teamA: ['p1'], teamB: ['p2'], scoreA: NaN, scoreB: 7 }, roster)).toMatch(/both scores/);
    expect(validateQuickGameEntry({ teamA: ['p1'], teamB: ['p2'], scoreA: 1.5, scoreB: 7 }, roster)).toMatch(/both scores/);
    expect(validateQuickGameEntry({ teamA: ['p1'], teamB: ['p2'], scoreA: -1, scoreB: 7 }, roster)).toMatch(/between/);
    expect(validateQuickGameEntry({ teamA: ['p1'], teamB: ['p2'], scoreA: MAX_GAME_SCORE + 1, scoreB: 7 }, roster)).toMatch(/between/);
  });
});
