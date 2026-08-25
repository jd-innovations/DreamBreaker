// Crash reporting for the mobile app (TODO1.1_EXECUTION_PLAN.md 4.1).
//
// Mirrors web/src/lib/observability/scrub.ts in intent. Deliberately a separate
// copy rather than a shared package: the two apps have no shared workspace, and
// the sensitive surfaces genuinely differ — the web scrubber cares about
// credential-bearing URLs (/claim/<token>, ?code=), while here the risk is XHR
// breadcrumbs to Supabase carrying apikey headers and bearer tokens, plus chat
// and support text in captured state. If a shared package ever exists, merge
// these; until then, a change to one is a prompt to check the other.
//
// Kept out of the crash reporter on purpose: names, emails, phone numbers,
// message and support-ticket bodies, and coordinates — 4.2's forbidden list.
// Kept IN on purpose: Stripe identifiers and the user's uuid, which are what
// make a payment crash traceable to a person's actual stuck booking.

import * as Sentry from '@sentry/react-native';
import { APP_ENV } from '@/lib/featureFlags';

const REDACTED = '[redacted]';

const SENSITIVE_KEY =
  /^(authorization|cookie|apikey|api[-_]?key|token|access[-_]?token|refresh[-_]?token|id[-_]?token|password|secret|session|email|e[-_]?mail|full[-_]?name|first[-_]?name|last[-_]?name|phone|body|message|notes|content|description|latitude|longitude|lat|lng|coords)$/i;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Supabase access tokens ride in query strings on storage/realtime URLs, and
 * the whole query string is dropped for the same reason as on web: an
 * allowlist would have to be maintained against every future endpoint.
 */
function scrubUrl(url: string): string {
  return typeof url === 'string' ? url.split('#')[0].split('?')[0] : url;
}

function scrubText<T>(value: T): T {
  return (typeof value === 'string' ? value.replace(EMAIL, REDACTED) : value) as T;
}

function scrubObject(input: unknown, depth = 0): unknown {
  if (depth > 6 || input == null) return input;
  if (typeof input === 'string') return scrubText(input);
  if (Array.isArray(input)) return input.map((v) => scrubObject(v, depth + 1));
  if (typeof input !== 'object') return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubObject(value, depth + 1);
  }
  return out;
}

/**
 * Starts crash reporting. Safe to call when EXPO_PUBLIC_SENTRY_DSN is unset —
 * the SDK stays inert, which is what should happen in Expo Go and in any build
 * that predates the env var.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Separates dev noise from real beta crashes inside one project. APP_ENV is
    // the same value that drives feature flags, so a build's crashes and its
    // feature set can never disagree about which environment it is.
    environment: APP_ENV,
    sendDefaultPii: false,
    // Crash reporting only — tracing has its own quota cost and is not 4.1.
    tracesSampleRate: 0,
    // The default attaches a screenshot to every crash. On this app that would
    // capture chat threads, support tickets and payment sheets, which is
    // exactly the data we are excluding everywhere else.
    attachScreenshot: false,
    attachViewHierarchy: false,

    beforeSend(event) {
      if (event.message) event.message = scrubText(event.message);

      for (const value of event.exception?.values ?? []) {
        if (value.value) value.value = scrubText(value.value);
      }

      for (const crumb of event.breadcrumbs ?? []) {
        if (crumb.message) crumb.message = scrubText(crumb.message);
        if (crumb.data) {
          const data = crumb.data as Record<string, unknown>;
          if (typeof data.url === 'string') data.url = scrubUrl(data.url);
          crumb.data = scrubObject(data) as typeof crumb.data;
        }
      }

      if (event.extra) event.extra = scrubObject(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = scrubObject(event.contexts) as typeof event.contexts;

      // The uuid is the useful half of user context and is not identifying on
      // its own; the name and email are neither.
      if (event.user) {
        event.user = { id: event.user.id };
      }

      return event;
    },
  });
}

/**
 * Ties crashes to a user without shipping who they are. Call on sign-in;
 * call with null on sign-out so a shared device does not attribute one
 * person's crashes to the next.
 */
export function setSentryUser(userId: string | null): void {
  if (!process.env.EXPO_PUBLIC_SENTRY_DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/**
 * Wraps the root layout so Sentry can attach its error boundary and native
 * crash handlers. Re-exported from here so the app's Sentry surface stays in
 * this one module rather than importing the SDK across the codebase.
 */
export const withCrashReporting = Sentry.wrap;
