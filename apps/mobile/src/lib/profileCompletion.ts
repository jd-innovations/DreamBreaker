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

// The routing gate's definition of "complete enough to enter the app" — a
// deliberately different question from getProfileCompletion()'s 0-100 ring
// percentage, which is a progress indicator and must never be used to decide
// navigation.
//
// A `profiles` row always exists for an authenticated user (fn_handle_new_user
// creates it on signup), so `null` here means the row could not be read, not
// that the user is new. Callers must distinguish a failed load from an
// incomplete profile before acting on `false` — see resolveAuthGate().
export function isProfileCompleteForEntry(profile: UserProfile | null): boolean {
  if (!profile) return false;
  const hasName = !!profile.full_name && profile.full_name.trim().length > 0;
  // Any one rating source is enough: Partner Finder and PAR both fall back
  // across dupr -> self_rating -> skill_level.
  const hasRating = !!profile.dupr || !!profile.self_rating || !!profile.skill_level;
  return hasName && hasRating;
}
