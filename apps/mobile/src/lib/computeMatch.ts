import {
  normalizeSchedule,
  scheduleOverlap,
  overlapSlotCount,
  describeOverlap,
  type AvailabilitySchedule,
} from '@shared/availability';

/**
 * How well two players suit each other, 0–99.
 *
 * ── What changed, 2026-09-21 ────────────────────────────────────────────────
 *
 * The old scoring was base 15 / DUPR 45 / availability 35, each all-or-nothing,
 * so the whole function could only ever return 15, 50, 60 or 95 — four values
 * dressed up as a percentage. Worse, both signals were broken in practice:
 *
 *   * DUPR was binary at 0.5. A 0.51 gap scored the same as a 3.0 gap.
 *   * Availability compared `profiles.availability`, the DERIVED human summary,
 *     with ===. That is the exact bug packages/shared/src/availability.ts was
 *     written to kill: the summary drops the time of day, so two players both
 *     showing "Wed, Sat" matched even if one meant mornings and the other
 *     evenings, while two people genuinely sharing Wednesday evenings scored
 *     zero because their summary strings differed. In the current data it was
 *     almost always false, which made most pairs score 15 or 60.
 *   * DISTANCE, in a sport where you have to physically meet, counted for
 *     nothing. It was displayed on the card and ignored by the maths.
 *
 * Now: base 10 / DUPR 35 / distance 30 / availability 25, each tapered.
 */

const BASE = 10;
const MAX_DUPR = 35;
const MAX_DISTANCE = 30;
const MAX_AVAILABILITY = 25;

/** Within this, ratings are effectively the same game. */
const DUPR_CLOSE = 0.5;
/** Past this, it is a different game and the bonus is gone. */
const DUPR_FAR = 1.5;

/** At or under this, distance is not a consideration at all. */
const NEAR_MILES = 5;
/** Past this, proximity stops being a reason to play with someone. */
const FAR_MILES = 25;

export type MatchInput = {
  dupr: number | null;
  /** The jsonb schedule. Never the `availability` summary text. */
  schedule: AvailabilitySchedule | unknown;
};

export type MatchCandidate = MatchInput & {
  /** Miles between the two players. Null when either location is unknown. */
  distanceMi?: number | null;
};

/** Linear fall-off from `full` down to 0 as x moves from `best` to `worst`. */
function taper(x: number, best: number, worst: number, full: number): number {
  if (x <= best) return full;
  if (x >= worst) return 0;
  return full * (1 - (x - best) / (worst - best));
}

export function computeMatch(
  candidate: MatchCandidate,
  mine: MatchInput,
): { pct: number; reasons: string[] } {
  let score = BASE;
  const reasons: string[] = [];

  // ── Rating ────────────────────────────────────────────────────────────────
  // Unrated on either side scores nothing rather than guessing. A missing
  // rating is not evidence of a close one.
  if (candidate.dupr != null && mine.dupr != null) {
    const gap = Math.abs(candidate.dupr - mine.dupr);
    const points = taper(gap, DUPR_CLOSE, DUPR_FAR, MAX_DUPR);
    score += points;
    if (gap <= DUPR_CLOSE) reasons.push('Same skill range');
    else if (points > 0) reasons.push('Close on skill');
  }

  // ── Distance ──────────────────────────────────────────────────────────────
  // Null means one of the two has no location, which is not the same as being
  // far away — it scores zero but says nothing, rather than claiming distance
  // as a negative.
  if (candidate.distanceMi != null && Number.isFinite(candidate.distanceMi)) {
    const miles = Math.max(0, candidate.distanceMi);
    const points = taper(miles, NEAR_MILES, FAR_MILES, MAX_DISTANCE);
    score += points;
    if (miles <= NEAR_MILES) reasons.push('Nearby');
    else if (points > 0) reasons.push(`${Math.round(miles)} mi away`);
  }

  // ── Availability ──────────────────────────────────────────────────────────
  // Real overlap: the same day AND the same block. normalizeSchedule() is safe
  // on anything, including the legacy text column, so a caller that still has
  // only the old value degrades to "no overlap" rather than throwing.
  const overlap = scheduleOverlap(
    normalizeSchedule(mine.schedule),
    normalizeSchedule(candidate.schedule),
  );
  const slots = overlapSlotCount(overlap);
  if (slots > 0) {
    // Three shared slots is a standing game; more adds little, so the curve
    // flattens rather than rewarding someone for ticking every box.
    score += Math.min(MAX_AVAILABILITY, slots * 9);
    const described = describeOverlap(overlap);
    if (described) reasons.push(described);
  }

  // Capped at 99 deliberately: a computed affinity should not claim to be
  // perfect, and the old function made the same promise.
  return { pct: Math.min(Math.round(score), 99), reasons };
}
