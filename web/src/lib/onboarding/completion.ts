// Profile-completeness predicates for the web onboarding flow.
//
// Mirror of `apps/mobile/src/lib/profileCompletion.ts`. Ported rather than
// imported because there is no shared workspace yet (task B1 in
// WEB_MOBILE_ALIGNMENT_PLAN.md). **If you change a rule here, change it there in
// the same commit** — these decide whether a user is sent into onboarding, and
// the two platforms disagreeing means a user is onboarded on one and not the
// other.
//
// The two functions below answer deliberately different questions and must not
// be swapped for one another.

/** The subset of `profiles` these predicates read. Keeps callers free to select
 *  only what they need rather than the whole row. */
export type CompletenessFields = {
  full_name?: string | null;
  dupr?: number | string | null;
  self_rating?: string | null;
  skill_level?: string | null;
  gender?: string | null;
  hand?: string | null;
  play_style?: string | null;
  availability?: string | null;
  onboarding_intent?: string[] | null;
  location_city?: string | null;
};

/**
 * The routing gate: "is this profile complete enough to enter the app?"
 *
 * Deliberately minimal — a name and any one rating source. Partner Finder and
 * PAR both fall back across dupr -> self_rating -> skill_level, so any one of
 * them is enough to participate.
 *
 * **Never use this as a progress percentage**, and never use a percentage to
 * decide navigation. Mobile keeps the same separation for the same reason.
 *
 * A `profiles` row always exists for an authenticated user (`fn_handle_new_user`
 * creates it on signup), so `null` here means the row could not be READ, not
 * that the user is new. Callers must distinguish a failed read from an
 * incomplete profile before acting on `false` — routing a user with a real
 * profile into onboarding lets the finalize step overwrite fields they already
 * set.
 */
export function isProfileCompleteForEntry(profile: CompletenessFields | null): boolean {
  if (!profile) return false;
  const hasName = !!profile.full_name && profile.full_name.trim().length > 0;
  const hasRating = !!profile.dupr || !!profile.self_rating || !!profile.skill_level;
  return hasName && hasRating;
}

// Fields onboarding collects beyond the entry minimum. Missing several of them
// is what the nudge exists to fix.
const ENRICHMENT_FIELDS: ((p: CompletenessFields) => boolean)[] = [
  (p) => !!p.gender,
  (p) => !!p.hand,
  (p) => !!p.play_style,
  (p) => !!p.availability,
  (p) => !!p.onboarding_intent && p.onboarding_intent.length > 0,
  (p) => !!p.location_city,
];

/**
 * The nudge's question: "is this profile thin enough to be worth interrupting
 * someone over?" Softer than the entry gate and used ONLY by the nudge — never
 * for routing.
 *
 * Returns false on a null profile: a failed read is not a reason to nag.
 */
export function needsProfileEnrichment(profile: CompletenessFields | null): boolean {
  if (!profile) return false;
  const missing = ENRICHMENT_FIELDS.filter((has) => !has(profile)).length;
  return missing >= 3;
}
