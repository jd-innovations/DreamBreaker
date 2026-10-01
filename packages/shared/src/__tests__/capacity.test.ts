import { describe, it, expect } from 'vitest';
import { fillPercent, spotsLeft, tournamentCapacity } from '../capacity';

describe('tournament capacity', () => {
  it('uses the divisions total when there are divisions', () => {
    expect(tournamentCapacity(120, [80, 56, 88, 44, 40])).toBe(308);
  });
  it('falls back to the tournament draw size without divisions', () => {
    expect(tournamentCapacity(32, [])).toBe(32);
    expect(tournamentCapacity(32, [0, 0])).toBe(32);
  });
  it('never reports negative spots or more than 100%', () => {
    expect(spotsLeft(120, 175)).toBe(0);
    expect(spotsLeft(308, 175)).toBe(133);
    expect(fillPercent(120, 175)).toBe(100);
    expect(fillPercent(308, 175)).toBe(57);
    expect(fillPercent(0, 5)).toBe(0);
  });
});
