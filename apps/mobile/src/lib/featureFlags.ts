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

// Single source of truth for the accepted values — the type is derived from the
// list so the two cannot drift, and the warning below can name them.
export const APP_ENV_VALUES = ['development', 'internal', 'production'] as const;

export type AppEnv = (typeof APP_ENV_VALUES)[number];

function isAppEnv(value: string | undefined): value is AppEnv {
  return (APP_ENV_VALUES as readonly string[]).includes(value ?? '');
}

function resolveAppEnv(): AppEnv {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  if (isAppEnv(raw)) return raw;

  const fallback: AppEnv = __DEV__ ? 'development' : 'production';

  // An *unset* value is the expected default and stays silent. A value that is
  // set but unrecognized is a build-configuration bug: it looks deliberate and
  // behaves as production. That is exactly how the `preview` profile shipped
  // `EXPO_PUBLIC_APP_ENV=preview` and silently ran internal QA builds as
  // production until 90505d8. Warn in dev only — a release build must not log.
  if (__DEV__ && raw) {
    console.warn(
      `[featureFlags] Unknown EXPO_PUBLIC_APP_ENV "${raw}". Falling back to ` +
        `"${fallback}". Expected one of: ${APP_ENV_VALUES.join(', ')}.`
    );
  }

  return fallback;
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
  // Paid booking is real end to end — PaymentSheet, webhook, and reservation
  // confirmation were verified on a dev-client build against live Stripe on
  // 2026-08-24 across three real payments, plus kill-mid-payment recovery and
  // PaymentSheet cancel (see Completion Notes 3.1). All five of 3.1's
  // verification items pass. Still `hidden` pending a deliberate beta-scope
  // call, not pending evidence — promoting it means editing BETA_SCOPE.md in
  // the same change. Free reservations are unaffected.
  paidBooking: 'hidden',
  // Filter/Sort buttons on booking results are unimplemented dead-end CTAs.
  bookingFilters: 'deferred',
  // Phases 0-7 built. Purchase, redemption and payout batching are proven
  // against production with real money; Connect onboarding was exercised end
  // to end. Production browse is additionally filtered to coaches with
  // coach_status 'active', so the test_ready fixtures are not sellable to real
  // buyers (see lib/coach/offers.ts).
  coachMarketplace: 'included',
  // No longer browse-only: checkout, vouchers and redemption all work.
  lessonMarketplace: 'included',
  // Redemption is built (Phase 5): a voucher shows a QR and an 8-character
  // code, and a coach can consume it.
  wallet: 'included',
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
