// What never reaches Sentry (TODO1.1_EXECUTION_PLAN.md 4.1).
//
// Sentry's defaults are built for a generic app: it captures request URLs,
// headers, query strings and breadcrumb data, on the reasonable assumption that
// none of those are secrets. In this app several of them are.
//
//   /claim/<token>          -- the path segment IS the credential
//   /auth/callback?code=..  -- an OAuth authorization code
//   Authorization / apikey  -- Supabase JWTs and keys
//
// So the default install would publish working credentials into a dashboard,
// and 4.2 separately forbids shipping names, emails, message bodies, support
// ticket text and exact coordinates. This module is the single place that
// decides what gets stripped, shared by the browser, server and edge runtimes
// so they cannot drift apart.
//
// Deliberately allowed through: Stripe identifiers (`pi_`, `re_`, `cus_`).
// They are not credentials, and they are the one thing that makes a payment
// error actionable -- the reconciliation runbook is written around pasting
// them into the Stripe dashboard. Scrubbing them would leave errors that
// cannot be traced to a payment, which is most of the value.

import type { Breadcrumb } from "@sentry/nextjs";

const REDACTED = "[redacted]";

/**
 * Keys whose VALUE is never safe or never useful. Matched case-insensitively
 * against the whole key, so `email` is stripped but `emailTemplateKey` is not.
 */
const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|apikey|api[-_]?key|x-api-key|token|access[-_]?token|refresh[-_]?token|id[-_]?token|password|secret|session|email|e[-_]?mail|full[-_]?name|first[-_]?name|last[-_]?name|phone|body|message|notes|content|description|latitude|longitude|lat|lng|coords)$/i;

/** Path prefixes where the NEXT segment is itself a credential. */
const TOKEN_IN_PATH = [/\/claim\/[^/?#]+/gi];

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Strips the query string and any credential-bearing path segment.
 *
 * The whole query string goes rather than named parameters: `?code=` on the
 * auth callback is an OAuth code, and an allowlist would have to be kept in
 * step with every future route. Losing query params costs some debugging
 * context; leaking one costs an account.
 */
export function scrubUrl(url: string): string {
  if (!url) return url;
  let out = url.split("#")[0].split("?")[0];
  for (const pattern of TOKEN_IN_PATH) {
    out = out.replace(pattern, (m) => `${m.slice(0, m.lastIndexOf("/"))}/${REDACTED}`);
  }
  return out;
}

/** Redacts email addresses appearing inside free text (messages, stack frames). */
export function scrubText<T>(value: T): T {
  return (typeof value === "string" ? value.replace(EMAIL, REDACTED) : value) as T;
}

/**
 * Recursively redacts sensitive keys. Depth-capped because Sentry payloads can
 * contain cyclic or very deep structures and a scrubber that hangs the process
 * is worse than one that misses a nested field.
 */
function scrubObject(input: unknown, depth = 0): unknown {
  if (depth > 6 || input == null) return input;
  if (typeof input === "string") return scrubText(input);
  if (Array.isArray(input)) return input.map((v) => scrubObject(v, depth + 1));
  if (typeof input !== "object") return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubObject(value, depth + 1);
  }
  return out;
}

// Sentry's event types differ slightly per runtime package; this module is
// shared by all three, so it works structurally rather than importing a type
// that only one of them exports.
type ScrubbableEvent = {
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string>; data?: unknown };
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: unknown }>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  user?: Record<string, unknown>;
};

/**
 * `beforeSend` for every runtime. Returning the event (never null) keeps the
 * error itself — the point is to strip the payload, not to drop reports.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    delete event.request.query_string;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_KEY.test(key)) event.request.headers[key] = REDACTED;
      }
    }
    // Request bodies here carry registration, support-ticket and message
    // payloads. There is no version of that worth keeping.
    if (event.request.data) event.request.data = REDACTED;
  }

  if (event.message) event.message = scrubText(event.message);

  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubText(value.value);
  }

  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubText(crumb.message);
    if (crumb.data) crumb.data = scrubObject(crumb.data) as typeof crumb.data;
  }

  if (event.extra) event.extra = scrubObject(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrubObject(event.contexts) as typeof event.contexts;

  // Keep the user id — it is what turns "an error happened" into "this person
  // is stuck" and is already a random uuid — but never their name or email.
  if (event.user) {
    for (const key of Object.keys(event.user)) {
      if (key !== "id") delete event.user[key];
    }
  }

  return event;
}

/**
 * Shared init options. Release and environment come from Vercel's own build
 * variables so a stack trace can be tied to the exact commit that produced it
 * — without a release, uploaded source maps have nothing to attach to.
 */
export const sharedSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Explicit even though it is the default: this single flag is what decides
  // whether IPs, cookies and headers are attached to every event.
  sendDefaultPii: false,
  // Crash reporting only. Tracing is a separate decision with its own quota
  // cost, and 4.1 is not it — raise deliberately if performance data is wanted.
  tracesSampleRate: 0,
  // Without a DSN the SDK is inert, which is the correct behaviour locally.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  beforeSend: scrubEvent,
  beforeBreadcrumb: (crumb: Breadcrumb): Breadcrumb => {
    if (crumb.data) crumb.data = scrubObject(crumb.data) as Breadcrumb["data"];
    if (crumb.message) crumb.message = scrubText(crumb.message);
    return crumb;
  },
};
