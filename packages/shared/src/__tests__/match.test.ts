import { describe, it, expect } from 'vitest';
import { computeMatch } from '../match';

const SCHEDULE_WED_EVE = { wed: ['evening'] };
const SCHEDULE_WED_MORN = { wed: ['morning'] };
const SCHEDULE_BUSY = { wed: ['evening'], sat: ['morning', 'afternoon'] };

describe('computeMatch', () => {
  it('scores a baseline when nothing is known', () => {
    const { pct, reasons } = computeMatch(
      { dupr: null, schedule: null, distanceMi: null },
      { dupr: null, schedule: null },
    );
    expect(pct).toBe(10);
    expect(reasons).toEqual([]);
  });

  it('does not guess a rating match when either side is unrated', () => {
    const { pct } = computeMatch(
      { dupr: null, schedule: null, distanceMi: null },
      { dupr: 4.0, schedule: null },
    );
    expect(pct).toBe(10);
  });

  describe('rating tapers rather than flipping at a threshold', () => {
    const near = (gap: number) =>
      computeMatch({ dupr: 4 + gap, schedule: null, distanceMi: null }, { dupr: 4, schedule: null }).pct;

    it('gives full credit inside half a point', () => {
      expect(near(0)).toBe(45);   // 10 base + 35
      expect(near(0.5)).toBe(45);
    });

    it('decays past it instead of dropping to zero', () => {
      // The old function scored 0.51 exactly like a 3.0 gap.
      const justOver = near(0.6);
      expect(justOver).toBeGreaterThan(10);
      expect(justOver).toBeLessThan(45);
      expect(near(1.0)).toBeLessThan(justOver);
    });

    it('is gone once the gap is a different game', () => {
      expect(near(1.5)).toBe(10);
      expect(near(3.0)).toBe(10);
    });
  });

  describe('distance now counts', () => {
    const at = (miles: number | null) =>
      computeMatch({ dupr: null, schedule: null, distanceMi: miles }, { dupr: null, schedule: null }).pct;

    it('rewards nearby players fully', () => {
      expect(at(0)).toBe(40);   // 10 base + 30
      expect(at(5)).toBe(40);
    });

    it('tapers with distance', () => {
      expect(at(15)).toBeGreaterThan(10);
      expect(at(15)).toBeLessThan(40);
      expect(at(25)).toBe(10);
    });

    it('treats unknown distance as unknown, not as far', () => {
      // Scores nothing, but must not claim distance as a reason either.
      const { pct, reasons } = computeMatch(
        { dupr: null, schedule: null, distanceMi: null },
        { dupr: null, schedule: null },
      );
      expect(pct).toBe(10);
      expect(reasons).toEqual([]);
    });
  });

  describe('availability uses real overlap, not string equality', () => {
    it('scores nothing when the day matches but the time does not', () => {
      // The exact bug the shared availability module exists to prevent: both
      // players summarise as "Wed", but one plays mornings and one evenings.
      const { pct, reasons } = computeMatch(
        { dupr: null, schedule: SCHEDULE_WED_MORN, distanceMi: null },
        { dupr: null, schedule: SCHEDULE_WED_EVE },
      );
      expect(pct).toBe(10);
      expect(reasons).toEqual([]);
    });

    it('scores a genuine shared slot', () => {
      const { pct, reasons } = computeMatch(
        { dupr: null, schedule: SCHEDULE_WED_EVE, distanceMi: null },
        { dupr: null, schedule: SCHEDULE_WED_EVE },
      );
      expect(pct).toBeGreaterThan(10);
      expect(reasons.join(' ')).toMatch(/Wednesday/i);
    });

    it('rewards more overlap, with a ceiling', () => {
      const one = computeMatch(
        { dupr: null, schedule: SCHEDULE_WED_EVE, distanceMi: null },
        { dupr: null, schedule: SCHEDULE_BUSY },
      ).pct;
      const three = computeMatch(
        { dupr: null, schedule: SCHEDULE_BUSY, distanceMi: null },
        { dupr: null, schedule: SCHEDULE_BUSY },
      ).pct;
      expect(three).toBeGreaterThan(one);
      expect(three).toBeLessThanOrEqual(10 + 25);
    });

    it('survives a legacy text value instead of a schedule', () => {
      // Old rows still carry the derived summary. It must degrade to "no
      // overlap", never throw.
      expect(() =>
        computeMatch(
          { dupr: null, schedule: 'Weekday evenings', distanceMi: null },
          { dupr: null, schedule: SCHEDULE_WED_EVE },
        ),
      ).not.toThrow();
    });
  });

  it('produces a real spread, not four fixed values', () => {
    // The old scoring could only ever return 15, 50, 60 or 95.
    const scores = new Set(
      [0, 3, 8, 14, 22, 40].flatMap((miles) =>
        [0, 0.3, 0.8, 1.2, 2.0].map(
          (gap) =>
            computeMatch(
              { dupr: 4 + gap, schedule: SCHEDULE_WED_EVE, distanceMi: miles },
              { dupr: 4, schedule: SCHEDULE_BUSY },
            ).pct,
        ),
      ),
    );
    expect(scores.size).toBeGreaterThan(8);
  });

  it('never claims a perfect match', () => {
    const { pct } = computeMatch(
      { dupr: 4, schedule: SCHEDULE_BUSY, distanceMi: 0 },
      { dupr: 4, schedule: SCHEDULE_BUSY },
    );
    expect(pct).toBeLessThanOrEqual(99);
  });
});
