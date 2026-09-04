// Product analytics for web (TODO1.1_EXECUTION_PLAN.md 4.2).
//
// Every event in the app goes through `track` below, and `track` accepts only
// the event union and the property allowlist from `@shared/analytics`. Nothing
// calls posthog.capture directly — that is the whole design. The allowlist is
// worthless if there is a second door.
//
// ── What this deliberately does not do ──────────────────────────────────────
//
// No autocapture, no session recording, no pageview capture. PostHog's defaults
// record every click, input and navigation, which on this app means chat
// threads, support tickets, and the payment sheet — exactly the data 4.2
// forbids and that the Sentry scrubber spends its whole existence removing.
// Turning it on later is a deliberate decision with a privacy review, not a
// default someone inherits.
//
// `person_profiles: "identified_only"` for the same reason: an anonymous
// visitor browsing tournaments does not need a person record created for them.
//
// ── Identity ────────────────────────────────────────────────────────────────
//
// Only the uuid is ever sent, matching the Sentry scrubber's rule. It is not
// identifying on its own and it is the join key that turns "someone dropped out
// of checkout" into "this stuck booking".

import posthog from "posthog-js";
import {
  sanitizeProperties,
  type AnalyticsEvent,
  type AnalyticsProperties,
} from "@shared/analytics";
import { getPostHogKey, getPostHogHost } from "./env";

let started = false;

/**
 * Initialises the SDK once. Safe to call repeatedly — React strict mode in
 * development mounts effects twice, and a second init would double every event.
 */
export function initAnalytics(config: { key?: string; host?: string }): void {
  if (started || typeof window === "undefined") return;

  // The values are ARGUMENTS, not reads. See ./env.ts — reading process.env in
  // this module silently produced null in production, because posthog-js drags
  // a `process` polyfill into the chunk and Next's static substitution stops
  // applying once `process` is a real binding.
  const key = getPostHogKey(config.key);
  if (!key) return;

  posthog.init(key, {
    api_host: getPostHogHost(config.host),
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    // Web vitals slipped through the first time. It is not autocapture, so the
    // flags above do not cover it — but it still sends events nobody asked for,
    // each carrying the current URL, and the claim in this file's header is
    // that nothing is collected by default. Observed in production 2026-08-31
    // as $web_vitals on /profile.
    capture_performance: false,
  });

  started = true;
}

/**
 * Reports properties that were dropped, so a developer finds out at the moment
 * they add a field rather than by noticing a gap in a funnel weeks later.
 *
 * Development only. In production this stays silent: the drop already happened,
 * which is the behaviour that matters, and a console full of warnings on a
 * user's machine helps nobody.
 */
function reportRejected(event: AnalyticsEvent, dropped: string[], forbidden: string[]): void {
  if (process.env.NODE_ENV !== "development") return;

  if (forbidden.length > 0) {
    console.error(
      `[analytics] ${event}: refused forbidden ${forbidden.join(", ")}. ` +
        `These are on FORBIDDEN_PROPERTY_KEYS in packages/shared/src/analytics.ts ` +
        `because 4.2 forbids shipping them. Send an id instead.`,
    );
  }
  if (dropped.length > 0) {
    console.warn(
      `[analytics] ${event}: dropped ${dropped.join(", ")} — not on the allowlist, ` +
        `or the value failed the safety check (over 64 chars, or contains an email). ` +
        `Add the key to ALLOWED_PROPERTY_KEYS in packages/shared/src/analytics.ts if it is safe to ship.`,
    );
  }
}

/**
 * The only way to send an event.
 *
 * Never throws. An analytics failure must not break a checkout, so everything
 * here is wrapped — a dropped event costs a row in a funnel, an exception
 * escaping into a payment handler costs a booking.
 */
export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  try {
    if (!started) return;

    const { properties: safe, dropped, forbidden } = sanitizeProperties(properties);
    reportRejected(event, dropped, forbidden);

    posthog.capture(event, { ...safe, platform: "web" });
  } catch {
    // Deliberately silent — see above.
  }
}

/**
 * Ties events to a user by uuid alone. Call on sign-in.
 *
 * No name, no email, no properties. PostHog's `identify` takes a property bag
 * as its second argument and it is tempting to fill in; that is how a person
 * record ends up holding the data everything else is stripping out.
 */
export function identifyUser(userId: string): void {
  try {
    if (!started) return;
    posthog.identify(userId);
  } catch {
    /* see track */
  }
}

/**
 * Clears identity on sign-out, so a shared browser does not attribute the next
 * person's session to the last one.
 */
export function resetAnalytics(): void {
  try {
    if (!started) return;
    posthog.reset();
  } catch {
    /* see track */
  }
}
