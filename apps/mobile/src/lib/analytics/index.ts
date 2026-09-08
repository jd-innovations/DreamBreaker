// Product analytics for mobile (TODO1.1_EXECUTION_PLAN.md 4.2).
//
// Mirrors web/src/lib/analytics/index.ts. The SDKs differ — posthog-js there,
// posthog-react-native here — but the vocabulary, the allowlist and the rules
// below are shared through @shared/analytics, because an event named one thing
// on web and another on mobile does not produce two columns in a funnel, it
// produces a funnel that is quietly wrong.
//
// Everything goes through `track`, which accepts only the event union and the
// property allowlist. Nothing calls posthog.capture directly; an allowlist with
// a second door is not an allowlist.
//
// ── Defaults deliberately off ───────────────────────────────────────────────
//
// No autocapture, no session replay. On this app those record chat threads,
// support tickets and the payment sheet — exactly what 4.2 forbids and what the
// Sentry scrubber next door spends its whole existence removing. Turning any of
// it on is a decision with a privacy review, not a default someone inherits.
//
// ── Why this file is bigger than the web one ────────────────────────────────
//
// The RN SDK needs an explicit async init (it restores its queue from storage)
// and there is no `window` to hang a singleton off, so the client is held here
// and every call short-circuits when it is null. `initAnalytics` is safe to
// call twice: React strict mode mounts effects twice in development, and a
// second client would double every event.

import PostHog from 'posthog-react-native';
import {
  sanitizeProperties,
  type AnalyticsEvent,
  type AnalyticsProperties,
} from '@shared/analytics';
import { APP_ENV } from '@/lib/featureFlags';

let client: PostHog | null = null;
let starting: Promise<void> | null = null;

/** US cloud. Overridden by EXPO_PUBLIC_POSTHOG_HOST for an EU project. */
const DEFAULT_HOST = 'https://us.i.posthog.com';

/**
 * True when analytics is configured. With no key the SDK is never constructed
 * and every call below is a no-op — the correct behaviour in Expo Go and in any
 * build predating the env var, matching how initSentry handles a missing DSN.
 */
export const ANALYTICS_ENABLED = Boolean(process.env.EXPO_PUBLIC_POSTHOG_KEY);

/**
 * Starts the SDK. Idempotent, and safe to await or to fire and forget.
 *
 * A failure here is swallowed on purpose: analytics that cannot start must not
 * stop the app from starting.
 */
export async function initAnalytics(): Promise<void> {
  if (client || starting) return starting ?? undefined;

  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  starting = (async () => {
    try {
      client = new PostHog(key, {
        host: process.env.EXPO_PUBLIC_POSTHOG_HOST || DEFAULT_HOST,
        // Session replay would capture the payment sheet and every chat thread.
        enableSessionReplay: false,
        // The app routes with expo-router; screen events would need the router
        // anyway, and autocapture here mostly produces noise tied to component
        // names that change whenever anything is refactored.
        captureAppLifecycleEvents: false,
      });
    } catch {
      client = null;
    }
  })();

  await starting;
}

/**
 * Surfaces rejected properties to a developer at the moment they add a field,
 * rather than through a hole in a funnel weeks later. Development only — in a
 * release build the drop has already happened, which is the part that matters.
 */
function reportRejected(event: AnalyticsEvent, dropped: string[], forbidden: string[]): void {
  if (!__DEV__) return;

  if (forbidden.length > 0) {
    console.error(
      `[analytics] ${event}: refused forbidden ${forbidden.join(', ')}. These are on ` +
        `FORBIDDEN_PROPERTY_KEYS in packages/shared/src/analytics.ts because 4.2 forbids ` +
        `shipping them. Send an id instead.`
    );
  }
  if (dropped.length > 0) {
    console.warn(
      `[analytics] ${event}: dropped ${dropped.join(', ')} — not on the allowlist, or the ` +
        `value failed the safety check (over 64 chars, or contains an email). Add the key to ` +
        `ALLOWED_PROPERTY_KEYS in packages/shared/src/analytics.ts if it is safe to ship.`
    );
  }
}

/**
 * The only way to send an event.
 *
 * Never throws. A dropped event costs a row in a funnel; an exception escaping
 * into a payment or check-in handler costs a booking.
 */
export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  try {
    if (!client) return;

    const { properties: safe, dropped, forbidden } = sanitizeProperties(properties);
    reportRejected(event, dropped, forbidden);

    client.capture(event, {
      ...safe,
      platform: 'ios',
      app_env: APP_ENV,
    });
  } catch {
    // Deliberately silent — see above.
  }
}

/**
 * Ties events to a user by uuid alone. Call on sign-in.
 *
 * No name, no email, no property bag. `identify` takes properties as its second
 * argument and it is tempting to fill in; that is exactly how a person record
 * ends up holding the data every other layer is stripping out.
 */
export function identifyUser(userId: string): void {
  try {
    client?.identify(userId);
  } catch {
    /* see track */
  }
}

/**
 * Clears identity on sign-out so a shared device does not attribute the next
 * person's session to the last one. Mirrors setSentryUser(null).
 */
export function resetAnalytics(): void {
  try {
    client?.reset();
  } catch {
    /* see track */
  }
}
