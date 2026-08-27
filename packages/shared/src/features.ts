// Feature visibility — the shared half.
//
// Mirrors `apps/mobile/src/lib/featureFlags.ts`. Workstream B4 of the alignment
// plan, and decision D4: a shared map, not a vendor flag service.
//
// Only the *map* and the *decision rule* live here. Deciding whether the caller
// is an internal build does NOT, because the two platforms answer it from
// entirely different inputs — mobile reads `EXPO_PUBLIC_APP_ENV` and `__DEV__`,
// web reads `NEXT_PUBLIC_APP_ENV` and `NODE_ENV`. Putting that resolution here
// would drag a platform API into a package that has to bundle for a Next server,
// a browser, and Hermes.
//
// See `BETA_SCOPE.md` at the repo root for the rationale, readiness and exit
// criteria behind every classification below. This map is the runtime half of
// that document — change them together.

/**
 *   included      visible to every user in every build
 *   hidden        built but unverified; internal builds only until it is proven
 *   internal-only diagnostics/QA tooling; never intended for external users
 *   deferred      not built; no reachable code path in any build
 *
 * Nothing here deletes code. `hidden` and `internal-only` both resolve to
 * "internal builds only" at runtime; the distinction records *why* it is off.
 */
export type FeatureVisibility = "included" | "hidden" | "internal-only" | "deferred";

export type FeatureKey =
  | "paidBooking"
  | "bookingFilters"
  | "coachMarketplace"
  | "lessonMarketplace"
  | "wallet"
  | "marketplaceAiAssist"
  | "myStats"
  | "devTools";

export const FEATURE_VISIBILITY: Record<FeatureKey, FeatureVisibility> = {
  // Paid booking is real end to end on mobile — PaymentSheet, webhook and
  // reservation confirmation verified against live Stripe on 2026-08-24. Still
  // `hidden` pending a deliberate beta-scope call, not pending evidence.
  // Web takes no tournament payments at all today (decision D1).
  paidBooking: "hidden",
  // Filter/Sort on booking results are unimplemented dead-end CTAs.
  bookingFilters: "deferred",
  // Coach activation drives real Stripe Connect onboarding; purchase, payout
  // and redemption phases are unbuilt.
  coachMarketplace: "hidden",
  // Browse-only surface for offers that cannot be purchased yet.
  lessonMarketplace: "hidden",
  // Wallet renders real entitlements whose redemption action is unbuilt.
  wallet: "hidden",
  // Anthropic-backed listing rewrite; key provisioning is unverified.
  marketplaceAiAssist: "hidden",
  // Read-only, real data, and the destination the working log-session flow
  // hands off to — hiding it would break a shipping loop, not de-risk one.
  myStats: "included",
  // design-lab, dev-qr-scan, onboarding-preview.
  devTools: "internal-only",
};

/**
 * The decision rule, as a pure function.
 *
 * @param key            the feature to test
 * @param isInternalBuild whether the caller is a dev or internal QA build.
 *                        Resolved by each app — see the note at the top.
 */
export function resolveFeature(key: FeatureKey, isInternalBuild: boolean): boolean {
  const visibility = FEATURE_VISIBILITY[key];
  if (visibility === "included") return true;
  if (visibility === "deferred") return false;
  return isInternalBuild;
}
