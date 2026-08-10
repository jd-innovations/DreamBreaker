import type { UserProfile } from '@/lib/services/profile';

// Weighted fields — avatar and bio count double since they matter most for
// how complete a profile looks/reads to other players.
const CHECKS: { weight: number; test: (p: UserProfile) => boolean }[] = [
  { weight: 2, test: (p) => !!p.avatar_url },
  { weight: 2, test: (p) => !!p.bio },
  { weight: 1, test: (p) => !!p.handle },
  { weight: 1, test: (p) => !!p.location_city && !!p.location_state },
  { weight: 1, test: (p) => !!p.hand },
  { weight: 1, test: (p) => !!p.play_style },
  { weight: 1, test: (p) => !!p.skill_level },
  { weight: 1, test: (p) => !!p.dupr || !!p.self_rating },
  { weight: 1, test: (p) => !!p.availability_schedule && Object.keys(p.availability_schedule).length > 0 },
];

const TOTAL_WEIGHT = CHECKS.reduce((sum, c) => sum + c.weight, 0);

export function getProfileCompletion(profile: UserProfile | null): number {
  if (!profile) return 0;
  const earned = CHECKS.reduce((sum, c) => sum + (c.test(profile) ? c.weight : 0), 0);
  return Math.round((earned / TOTAL_WEIGHT) * 100);
}
