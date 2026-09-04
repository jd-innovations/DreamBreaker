// PostHog connection configuration (TODO1.1_EXECUTION_PLAN.md 4.2).
//
// Deliberately shaped like ../supabase/env.ts, and deliberately different in
// one respect: this one never throws.
//
// Supabase config is fail-closed because a web app that cannot reach its
// database should not boot pretending it can — item 2.3 exists because a
// silent fallback once pointed a preview deploy at production. Analytics is the
// opposite case. A missing key means one funnel goes unmeasured; a throw would
// mean the site does not render. So an unset key leaves the SDK uninitialised
// and every capture becomes a no-op, matching how Sentry behaves without a DSN
// (see ../observability/scrub.ts `enabled`).
//
// ── Why these values are PASSED IN and not read from process.env here ───────
//
// They used to be read here, exactly like ../supabase/env.ts does it. It did
// not work in production, and the reason is worth writing down because nothing
// about the source looks wrong.
//
// Next inlines `process.env.NEXT_PUBLIC_*` by static substitution. That only
// happens while `process` is the compile-time global. This module is bundled
// into the same chunk as `posthog-js`, which brings a `process` polyfill with
// it — so `process` became a real module binding, the reference compiled to
// `r.default.env.NEXT_PUBLIC_POSTHOG_KEY`, and in the browser that is
// undefined. Verified against the deployed bundle 2026-08-31: the Supabase
// values appear as string literals in their chunk while this one did not.
//
// The symptom was silence. getPostHogKey() returned null, initAnalytics()
// returned early, every track() was a no-op, and the site behaved perfectly
// while the dashboard stayed empty through two deploys.
//
// So the read now happens in the ROOT LAYOUT, a server component with no
// posthog-js anywhere near it, and the values arrive here as arguments.
//
// The one Next specific still worth knowing, inherited from the Supabase
// module: a variable that was never set arrives as the STRING "undefined",
// not as `undefined`, so a plain `if (!value)` does not catch it.

/** Values Next.js or a shell can produce for a variable that was never set. */
const EMPTY_VALUES = new Set(["", "undefined", "null"]);

function isMissing(value: string | undefined): boolean {
  return value === undefined || EMPTY_VALUES.has(value.trim());
}

/** US cloud. Overridden by NEXT_PUBLIC_POSTHOG_HOST for an EU project. */
const DEFAULT_HOST = "https://us.i.posthog.com";

/**
 * The PostHog project API key, or null when analytics is switched off.
 *
 * Public by design — a project key is write-only and is meant to ship in a
 * client bundle. It is NOT a personal API key, which can read and administer
 * the project and must never appear in one.
 */
export function getPostHogKey(raw: string | undefined): string | null {
  if (isMissing(raw)) return null;

  const value = raw!.trim();

  // A personal API key (`phx_`) pasted here would be a real credential leak
  // into every browser, and it would still "work" well enough to look correct,
  // so it is worth failing loudly in development. Never in production: a
  // misconfigured analytics key must not take the site down.
  if (!value.startsWith("phc_")) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        `[analytics] NEXT_PUBLIC_POSTHOG_KEY does not look like a PostHog project key ` +
          `(expected it to start with 'phc_'). A 'phx_' value is a PERSONAL API key — ` +
          `it can read and administer the project and must never be shipped to a browser. ` +
          `Set the project key from PostHog → Settings → Project → Project API Key.`,
      );
    }
    return null;
  }

  return value;
}

/** The ingestion host. Wrong region silently drops events, answering 200. */
export function getPostHogHost(raw: string | undefined): string {
  return isMissing(raw) ? DEFAULT_HOST : raw!.trim();
}
