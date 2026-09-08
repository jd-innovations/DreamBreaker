// Compatibility scoring for Partner Finder, ported from
// web/src/app/matchmaking/page.tsx's computeMatch(). Mobile has no real
// per-user distance yet (profiles carry no lat/lng), so the distance-tier
// component from the web version is omitted and its weight redistributed.
export function computeMatch(
  candidate: { dupr: number | null; availability: string | null },
  mine: { dupr: number | null; availability: string | null },
): { pct: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.dupr && mine.dupr && Math.abs(candidate.dupr - mine.dupr) <= 0.5) {
    score += 45;
    reasons.push('Same DUPR range');
  }
  if (candidate.availability && mine.availability && candidate.availability === mine.availability) {
    score += 35;
    reasons.push('Matching availability');
  }

  // base
  score += 15;

  return { pct: Math.min(score, 99), reasons };
}
