export const USE_SUPABASE = true;

// ─── Build environment ────────────────────────────────────────────────────────
//
// `EXPO_PUBLIC_APP_ENV` is the single source of truth for which build this is.
// It is deliberately opt-in: an unset value resolves to `production` in a
// release build, so forgetting to set it can only ever make the app *more*
// restrictive, never less.
//
//   development — local Metro / dev client (default when __DEV__)
//   internal    — internal TestFlight / QA builds (set EXPO_PUBLIC_APP_ENV=internal)
//   production  — public beta and store builds (default for any release build)

export type AppEnv = 'development' | 'internal' | 'production';

function resolveAppEnv(): AppEnv {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  if (raw === 'development' || raw === 'internal' || raw === 'production') return raw;
  return __DEV__ ? 'development' : 'production';
}

export const APP_ENV: AppEnv = resolveAppEnv();

/** True for public beta / store builds. Nothing unfinished may be reachable here. */
export const IS_PRODUCTION_BUILD = APP_ENV === 'production';

/** True for local dev and internal QA builds — developer access is preserved here. */
export const IS_INTERNAL_BUILD = !IS_PRODUCTION_BUILD;

// ─── Beta scope ───────────────────────────────────────────────────────────────
//
// See BETA_SCOPE.md at the repo root for the rationale, readiness, and exit
// criteria behind every classification below. This map is the runtime half of
// that document — change them together.
//
//   included      visible to every user in every build
//   hidden        built but unverified; internal builds only until it is proven
//   internal-only diagnostics/QA tooling; never intended for external users
//   deferred      not built; no reachable code path in any build
//
// Nothing here deletes code. `hidden` and `internal-only` both resolve to
// "internal builds only" at runtime; the distinction records *why* it is off.

export type FeatureVisibility = 'included' | 'hidden' | 'internal-only' | 'deferred';

export type FeatureKey =
  | 'paidBooking'
  | 'bookingFilters'
  | 'coachMarketplace'
  | 'lessonMarketplace'
  | 'wallet'
  | 'marketplaceAiAssist'
  | 'myStats'
  | 'devTools';

export const FEATURE_VISIBILITY: Record<FeatureKey, FeatureVisibility> = {
  // Booking creates a real reservation and a real Stripe PaymentIntent, but
  // never presents PaymentSheet (see 3.1). Free reservations are unaffected.
  paidBooking: 'hidden',
  // Filter/Sort buttons on booking results are unimplemented dead-end CTAs.
  bookingFilters: 'deferred',
  // Coach activation drives real Stripe Connect onboarding; purchase, payout,
  // and redemption phases are unbuilt.
  coachMarketplace: 'hidden',
  // Browse-only surface for offers that cannot be purchased yet.
  lessonMarketplace: 'hidden',
  // Wallet renders real entitlements whose redemption action is unbuilt.
  wallet: 'hidden',
  // Anthropic-backed listing rewrite; key provisioning is unverified.
  marketplaceAiAssist: 'hidden',
  // Read-only, real-data, and the destination the working log-session flow
  // hands off to — hiding it would break a shipping loop, not de-risk one. No
  // PAR value is computed client-side; the screen renders what the server
  // already stores.
  myStats: 'included',
  // design-lab, dev-qr-scan, onboarding-preview.
  devTools: 'internal-only',
};

export function isFeatureEnabled(key: FeatureKey): boolean {
  const visibility = FEATURE_VISIBILITY[key];
  if (visibility === 'included') return true;
  if (visibility === 'deferred') return false;
  return IS_INTERNAL_BUILD;
}
