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

/**
 * Whether crash reporting is actually running. False in Expo Go and in any
 * build made before `EXPO_PUBLIC_SENTRY_DSN` existed, where `initSentry` is a
 * no-op — a diagnostics screen that says "sent" when nothing was sent is worse
 * than one that says nothing is wired.
 */
export const CRASH_REPORTING_ENABLED = Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN);

/**
 * Sends a deliberately over-stuffed event so the scrubber above can be checked
 * against something that actually has secrets in it (4.1's Completion Notes
 * record that it had only ever been observed against an event carrying little
 * to scrub, and 4.2's verification asks for proof that no sensitive payload is
 * sent).
 *
 * Everything below is fake. It is written to hit every branch of `beforeSend`:
 * a sensitive key at the top level and nested, an email inside otherwise
 * innocuous prose, a Supabase URL carrying an access token in its query string,
 * and user context that should arrive reduced to the uuid alone.
 *
 * In Sentry, the resulting event must show `[redacted]` for every field named
 * below, a breadcrumb URL with no query string, and a user with an id and
 * nothing else. Anything legible is a scrubber bug, not a test artefact.
 */
export function sendScrubProbe(): void {
  if (!CRASH_REPORTING_ENABLED) return;

  Sentry.addBreadcrumb({
    category: 'xhr',
    message: 'GET storage object',
    data: {
      url: 'https://fbzetvkbhneptvfruilw.supabase.co/storage/v1/object/avatars/a.png?token=fake-access-token&apikey=fake-anon-key',
      apikey: 'fake-anon-key',
    },
  });

  Sentry.withScope((scope) => {
    scope.setUser({
      id: '00000000-0000-4000-8000-000000000000',
      email: 'scrub-probe@example.invalid',
      username: 'Scrub Probe',
    });
    scope.setExtras({
      email: 'scrub-probe@example.invalid',
      full_name: 'Scrub Probe',
      phone: '+15550100',
      message: 'my card was declined, reach me at scrub-probe@example.invalid',
      latitude: 27.3364,
      longitude: -82.5307,
      nested: { authorization: 'Bearer fake-token', notes: 'support ticket body' },
      // Kept on purpose — these two are the deliberate exceptions.
      payment_intent_id: 'pi_0000000000fake',
      user_id: '00000000-0000-4000-8000-000000000000',
    });
    Sentry.captureException(
      new Error('Scrub probe (deliberate): contact scrub-probe@example.invalid')
    );
  });
}

/**
 * Throws on the next tick so the failure reaches the global error handler
 * rather than a React render boundary. A `throw` inside a press handler is a
 * different code path and would not prove the handler is installed.
 */
export function throwUncaughtError(): void {
  setTimeout(() => {
    throw new Error('Deliberate uncaught JS error from the diagnostics screen');
  }, 0);
}

/**
 * Kills the process through the native layer. Nothing after this runs, and the
 * report is delivered on the NEXT launch — an empty Sentry immediately after is
 * expected, not a failure. This is the only check that exercises the native
 * handler; `beforeSend` never sees it, so it proves delivery, not scrubbing.
 */
export function crashNative(): void {
  Sentry.nativeCrash();
}
