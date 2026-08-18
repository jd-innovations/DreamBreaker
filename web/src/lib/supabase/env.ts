// Single source of truth for Supabase connection configuration
// (TODO1.1_EXECUTION_PLAN.md item 2.3).
//
// Previously client.ts, server.ts, and service.ts each carried a hardcoded
// production URL and anon key, used whenever the environment variables looked
// wrong. That was added to work around a Vercel misconfiguration, and it worked
// — which is the problem. A preview or staging deploy with no Supabase env vars
// silently pointed at production and behaved perfectly, so nobody found out.
//
// The fallbacks are gone. Misconfiguration now fails loudly, at the first
// attempt to build a Supabase client, with a message naming the variable and
// what it should look like.
//
// Two Next.js specifics this has to defend against:
//
//   1. `NEXT_PUBLIC_*` variables are inlined at BUILD time by literal source
//      text match. `process.env[someVariable]` is not substituted, so every
//      read below must spell the variable out in full. That is why this file
//      has repetitive literal reads instead of a lookup table.
//   2. A missing variable is inlined as the STRING "undefined", not as
//      `undefined`. A plain `if (!value)` check does not catch it.

/** Values Next.js or a shell can produce for a variable that was never set. */
const EMPTY_VALUES = new Set(["", "undefined", "null"]);

function isMissing(value: string | undefined): boolean {
  return value === undefined || EMPTY_VALUES.has(value.trim());
}

/** Anything JWT-shaped is redacted before it reaches a log or an error page. */
function redact(value: string): string {
  if (value.startsWith("eyJ") || value.startsWith("sb_")) {
    return `${value.slice(0, 8)}…[redacted, ${value.length} chars]`;
  }
  return JSON.stringify(value);
}

function fail(variable: string, problem: string, expected: string): never {
  throw new Error(
    `[supabase] ${variable} ${problem}. Expected ${expected}. ` +
      `Set it in web/.env.local for local development, or in the Vercel project's ` +
      `Environment Variables for the deployed environment. There is deliberately no ` +
      `fallback — see web/src/lib/supabase/env.ts.`,
  );
}

/**
 * The Supabase project URL. Public by design; safe in a client bundle.
 *
 * Also catches the specific misconfiguration this project actually hit: the
 * anon key pasted into the URL slot. A JWT does not parse as an https URL, so
 * it is rejected here instead of producing a client that fails every request.
 */
export function getSupabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (isMissing(raw)) {
    fail("NEXT_PUBLIC_SUPABASE_URL", "is not set", "an https URL such as https://<project-ref>.supabase.co");
  }

  const value = raw!.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail(
      "NEXT_PUBLIC_SUPABASE_URL",
      `is not a valid URL (got ${redact(value)})`,
      "an https URL such as https://<project-ref>.supabase.co — note that a value starting 'eyJ' means the ANON KEY was pasted into the URL variable",
    );
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    fail("NEXT_PUBLIC_SUPABASE_URL", `must use https (got ${parsed.protocol}//)`, "an https URL, or http on localhost for the local stack");
  }

  return value;
}

/**
 * The Supabase anon/publishable key. Public by design; safe in a client bundle
 * and protected by RLS, not by secrecy.
 *
 * Accepts both key formats Supabase issues: the legacy JWT (`eyJ…`) and the
 * newer publishable key (`sb_publishable_…`).
 */
export function getSupabaseAnonKey(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isMissing(raw)) {
    fail("NEXT_PUBLIC_SUPABASE_ANON_KEY", "is not set", "a Supabase anon key ('eyJ…' JWT or 'sb_publishable_…')");
  }

  const value = raw!.trim();
  if (!value.startsWith("eyJ") && !value.startsWith("sb_publishable_")) {
    fail(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      `does not look like a Supabase anon key (got ${redact(value)})`,
      "'eyJ…' (legacy JWT) or 'sb_publishable_…' — note that a value starting 'https://' means the PROJECT URL was pasted into the key variable",
    );
  }

  return value;
}

/**
 * The service-role key. Server-only — this must never be imported into a
 * client component, which is why it is read from a non-`NEXT_PUBLIC_` variable
 * that Next refuses to inline into the browser bundle.
 *
 * The anon-key check below is not paranoia. The two keys are interchangeable at
 * the type level, so pasting the anon key here produces a working client that
 * quietly runs every "admin" operation under RLS as an anonymous user — writes
 * vanish, reads come back empty, and nothing raises.
 */
export function getSupabaseServiceRoleKey(): string {
  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (isMissing(raw)) {
    fail("SUPABASE_SERVICE_ROLE_KEY", "is not set", "the project's service-role key (server-side only, never exposed to the browser)");
  }

  const value = raw!.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anon && value === anon) {
    fail(
      "SUPABASE_SERVICE_ROLE_KEY",
      "is set to the ANON key",
      "the service-role key — the anon key here would silently run privileged operations under RLS as an anonymous user, so writes would be dropped and reads would return empty with no error",
    );
  }

  return value;
}
