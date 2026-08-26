// The onboarding draft: what the user has answered so far.
//
// Mirror of `apps/mobile/src/lib/onboarding/state.tsx`'s OnboardingDraft, minus
// the fields web does not collect:
//
//   authMethod / profileEmail / emailPassword / providerSubject
//        the account already exists by the time web onboarding runs — /auth
//        handles signup, so nothing here touches credentials
//   avatarUrl
//        `fn_handle_new_user` already writes it from OAuth `picture` metadata
//   homeCourt / addCourtLater
//        home court is deferred to v2; web has no facility service to search
//   locationEnabled
//        never written to `profiles` on either platform
//
// ── Two deliberate differences from mobile ───────────────────────────────────
//
// **1. Nothing is pre-selected.** Mobile's INITIAL_DRAFT seeds gender: 'male',
// handedness: 'right_handed', selfRating: '3.0-3.5', searchRadiusMiles: 15.
// Those four produce five non-undefined columns, so mobile's finalize always
// writes them — meaning a user who never opened the gender step still gets
// `gender = 'male'`, and re-entering onboarding silently rewrites real answers.
// Web starts empty and requires an explicit choice.
//
// **2. `touched` is tracked separately from value.** `story_radius_miles` is
// `integer NOT NULL DEFAULT 25`. A draft default of 15 would *downgrade* a real
// 25 for anyone who skipped the step, and because the column is NOT NULL there
// is no null to distinguish "unset" from "set to 15". Recording which fields the
// user actually touched is the only way to tell.

export type OnboardingDraft = {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null; // ISO yyyy-mm-dd
  gender: string | null;
  handedness: string | null;
  estimatedCity: string | null;
  estimatedState: string | null;
  estimatedLat: number | null;
  estimatedLng: number | null;
  searchRadiusMiles: number | null;
  selfRating: string | null;
  playingStyle: string[];
  availability: string[];
  intent: string[];
};

export type DraftField = keyof OnboardingDraft;

export const INITIAL_DRAFT: OnboardingDraft = {
  firstName: "",
  lastName: "",
  dateOfBirth: null,
  gender: null,
  handedness: null,
  estimatedCity: null,
  estimatedState: null,
  estimatedLat: null,
  estimatedLng: null,
  searchRadiusMiles: null,
  selfRating: null,
  playingStyle: [],
  availability: [],
  intent: [],
};

// ─── Validators ──────────────────────────────────────────────────────────────
//
// Per-step "can I continue" predicates, ported from mobile's `validators` map.
// Kept together so the whole flow's rules are readable in one place, and
// referenced from steps.ts so a step's gate lives next to its route.

export const validators: Record<string, (d: OnboardingDraft) => boolean> = {
  // Name is prefilled from signup but editable, so re-check it.
  profile: (d) =>
    d.firstName.trim().length > 0 &&
    d.lastName.trim().length > 0 &&
    !!d.dateOfBirth,
  rating: (d) => !!d.selfRating,
  // Location is skippable — the IP lookup may be blocked, and a user is allowed
  // to decline to say where they are.
  area: () => true,
  style: (d) => d.playingStyle.length > 0,
  availability: (d) => d.availability.length > 0,
  goals: (d) => d.intent.length > 0,
};
