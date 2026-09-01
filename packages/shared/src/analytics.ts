// Product analytics — the shared half (TODO1.1_EXECUTION_PLAN.md 4.2).
//
// Vendor: PostHog, US cloud. Decided 2026-08-29, closing the last open gate on
// 4.2. The SDKs differ per platform (`posthog-js` on web, `posthog-react-native`
// on mobile) but the *vocabulary* must not, so it lives here — same reasoning as
// `tokens.ts` and `play-profile.ts`. An event named `booking_succeeded` on one
// platform and `booking_success` on the other does not produce two columns in a
// funnel; it produces a funnel that is quietly wrong.
//
// ── Why an allowlist and not a blocklist ────────────────────────────────────
//
// 4.2 forbids shipping raw names, emails, message and support text, card data
// and exact coordinates. A blocklist gets that wrong by construction: it only
// excludes what someone thought of, so every new property added anywhere in
// either app leaks until a human notices. Here the default is *drop*. A
// property reaches PostHog only if its key is in ALLOWED_PROPERTY_KEYS below,
// which means adding a field is a deliberate edit to this file with the
// question "is this safe to ship" asked at the moment of writing.
//
// This mirrors the intent of the Sentry scrubber in
// `apps/mobile/src/lib/observability/sentry.ts`, and makes the same two
// deliberate exceptions: the user's uuid and Stripe identifiers are kept,
// because they are what make a funnel drop-off traceable to a real stuck
// booking, and neither identifies a person on its own.
//
// If you change the forbidden list here, change the Sentry scrubber too.

/**
 * Every event either app is allowed to send. The union is the enforcement:
 * a typo is a type error rather than a new event appearing in the dashboard
 * next to the real one.
 *
 * Derived from 4.2's "privacy-safe core events" list. Add to it deliberately —
 * an event that is never analysed is still a row someone has to reason about.
 */
export type AnalyticsEvent =
  // Onboarding
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "profile_completed"
  // Auth
  | "auth_started"
  | "auth_succeeded"
  | "auth_failed"
  // Push permissions
  | "push_prompt_shown"
  | "push_prompt_accepted"
  | "push_prompt_denied"
  // Tournament registration
  | "tournament_registration_started"
  | "tournament_registration_succeeded"
  | "tournament_registration_failed"
  // Booking funnel
  | "booking_started"
  | "booking_slot_selected"
  | "booking_succeeded"
  | "booking_failed"
  // Payments
  | "payment_started"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_canceled"
  // Check-in. NOT `qr_checkin_*`: manual check-in and QR scanning share one
  // code path, so an event named for the scanner would count both and hide how
  // much the scanner is actually used — which is the number that decides
  // whether it earns its place at a busy check-in desk. The `checkin_method`
  // property carries scan vs manual. Renamed 2026-08-31, one event into the
  // project's history, because renaming later means losing history or keeping
  // an alias forever.
  | "checkin_succeeded"
  | "checkin_failed"
  // Support
  | "support_ticket_submitted";

export const ANALYTICS_EVENTS: readonly AnalyticsEvent[] = [
  "onboarding_step_viewed",
  "onboarding_step_completed",
  "profile_completed",
  "auth_started",
  "auth_succeeded",
  "auth_failed",
  "push_prompt_shown",
  "push_prompt_accepted",
  "push_prompt_denied",
  "tournament_registration_started",
  "tournament_registration_succeeded",
  "tournament_registration_failed",
  "booking_started",
  "booking_slot_selected",
  "booking_succeeded",
  "booking_failed",
  "payment_started",
  "payment_succeeded",
  "payment_failed",
  "payment_canceled",
  "checkin_succeeded",
  "checkin_failed",
  "support_ticket_submitted",
] as const;

/**
 * Property values that survive sanitisation. Objects and arrays are dropped
 * whole rather than walked: nesting is how free text sneaks in, and no event
 * in the list above needs it.
 */
export type AnalyticsValue = string | number | boolean | null;

export type AnalyticsProperties = Record<string, unknown>;

/**
 * The complete set of property keys either app may send.
 *
 * Read the groupings as the argument for each one. Anything absent is dropped
 * silently in production and loudly in development — see sanitizeProperties.
 */
export const ALLOWED_PROPERTY_KEYS: readonly string[] = [
  // Who and where, without saying who. The uuid is not identifying on its own
  // and is the join key back to a support conversation about a real failure.
  "user_id",
  "platform", // "web" | "ios" | "android"
  "app_env", // matches EXPO_PUBLIC_APP_ENV / NEXT_PUBLIC_APP_ENV
  "app_version",

  // Funnel mechanics.
  "step",
  "step_index",
  "step_count",
  "method", // "email" | "google" | "apple"
  "provider",
  "result", // "success" | "failure" | "canceled"
  "error_code", // a code, never a message — messages carry user text
  "duration_ms",
  "source", // which screen or CTA started the flow

  // Domain identifiers. Opaque ids, never names or titles: a tournament title
  // is authored text and can contain anything, including a person's name.
  "tournament_id",
  "event_id",
  "reservation_id",
  "facility_id",
  "court_id",
  "listing_id",
  // Coach Marketplace: the offer is what the user chose, the purchase is the
  // row the server minted for it. Both opaque ids, never the lesson title -
  // that is coach-authored text and can contain anything.
  "offer_id",
  "purchase_id",
  "conversation_id",
  "ticket_id",
  "group_id",

  // Money. Stripe ids are kept for the same reason the Sentry scrubber keeps
  // them: without one, a failed payment event cannot be tied to the intent that
  // actually failed, which is the whole point of measuring the funnel.
  "amount_cents",
  "entry_fee_cents",
  "currency",
  "is_free",
  "payment_intent_id",
  "stripe_status",

  // Check-in and permissions.
  "checkin_method", // "scan" | "manual"
  "permission_status", // "granted" | "denied" | "undetermined"

  // Support. The category is a fixed vocabulary; the body never leaves the app.
  "ticket_category",
] as const;

/**
 * Keys that must never be sent, listed explicitly even though the allowlist
 * already excludes them.
 *
 * The allowlist is the mechanism; this is the documentation, and it is what a
 * reviewer checks against 4.2's forbidden list. It also gives the dev-time
 * warning something specific to say when someone reaches for `email` — the
 * difference between "dropped an unknown key" and "you tried to ship a
 * forbidden one" is worth the duplication.
 */
export const FORBIDDEN_PROPERTY_KEYS: readonly string[] = [
  "name",
  "full_name",
  "first_name",
  "last_name",
  "display_name",
  "email",
  "phone",
  "message",
  "body",
  "content",
  "notes",
  "description",
  "title",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "coords",
  "address",
  "card",
  "card_number",
  "last4",
  "password",
  "token",
  "access_token",
];

/**
 * Longest string a property value may be. Ids, enum values and version strings
 * are all far shorter; anything longer is prose, and prose is the thing being
 * kept out. 64 fits a uuid (36) and a Stripe intent id (27) with room to spare.
 */
const MAX_VALUE_LENGTH = 64;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function isSafeValue(value: unknown): value is AnalyticsValue {
  if (value === null) return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  // A string that is too long, or that contains an address, is prose or PII
  // regardless of which key it arrived under.
  return value.length <= MAX_VALUE_LENGTH && !EMAIL.test(value);
}

export interface SanitizedProperties {
  /** Safe to send. */
  properties: Record<string, AnalyticsValue>;
  /** Keys removed because they are not on the allowlist, or failed the value check. */
  dropped: string[];
  /** Keys removed that are on the explicit forbidden list — always a bug. */
  forbidden: string[];
}

/**
 * Reduces an arbitrary property bag to what is safe to send.
 *
 * Never throws, and never returns a partially-checked object: callers on both
 * platforms send `properties` and nothing else. The two reject lists are
 * returned rather than logged here so each platform can surface them its own
 * way — the shared package deliberately knows nothing about console, __DEV__ or
 * NODE_ENV, because it has to bundle for a Next server, a browser and Hermes.
 */
export function sanitizeProperties(input: AnalyticsProperties | undefined): SanitizedProperties {
  const properties: Record<string, AnalyticsValue> = {};
  const dropped: string[] = [];
  const forbidden: string[] = [];

  if (!input) return { properties, dropped, forbidden };

  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_PROPERTY_KEYS.includes(key)) {
      forbidden.push(key);
      continue;
    }
    if (!ALLOWED_PROPERTY_KEYS.includes(key)) {
      dropped.push(key);
      continue;
    }
    if (!isSafeValue(value)) {
      dropped.push(key);
      continue;
    }
    properties[key] = value;
  }

  return { properties, dropped, forbidden };
}

/**
 * True when the string is an event this app is allowed to send. Useful at the
 * edges where the event name arrives as a string rather than the union — a
 * deep link, or a value read from configuration.
 */
export function isAnalyticsEvent(value: string): value is AnalyticsEvent {
  return (ANALYTICS_EVENTS as readonly string[]).includes(value);
}
