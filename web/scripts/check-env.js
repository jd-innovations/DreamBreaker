#!/usr/bin/env node
/**
 * Build-time Supabase environment validation (TODO1.1_EXECUTION_PLAN.md 2.3).
 *
 * Runs as `prebuild`, so `npm run build` cannot produce a bundle with missing or
 * malformed Supabase configuration.
 *
 * Why this exists in addition to the runtime checks in src/lib/supabase/env.ts:
 * `NEXT_PUBLIC_*` variables are inlined into the client bundle at BUILD time. If
 * they are wrong when the build runs, the runtime guard cannot fire until a user
 * opens a page — the deploy itself looks completely healthy. This check moves
 * that failure to the build, where CI and Vercel will surface it before anyone
 * ships. It is the same lesson, and the same shape, as
 * apps/mobile/scripts/validate-eas-env.js from item 0.1.
 *
 * Deliberately dependency-free and CommonJS so it runs before any build step.
 *
 * Usage:
 *   node scripts/check-env.js
 *   node scripts/check-env.js --self-test   # verify the checker itself
 */

/**
 * Load the same .env files `next build` will, in the same precedence order, so
 * this check sees exactly the environment the build sees. Without this the
 * script would only observe real process env vars and would fail every local
 * build, where the values live in .env.local.
 *
 * `@next/env` is Next's own loader and ships as one of its dependencies. If it
 * is ever unavailable, fall through to process.env rather than crash — the
 * runtime guards in src/lib/supabase/env.ts still hold the line.
 */
function loadNextEnv() {
  try {
    const path = require("path");
    require("@next/env").loadEnvConfig(path.resolve(__dirname, ".."), false, {
      info: () => {},
      error: () => {},
    });
  } catch {
    // Deliberately silent — see above.
  }
}

const EMPTY_VALUES = new Set(["", "undefined", "null"]);

function isMissing(value) {
  return value === undefined || EMPTY_VALUES.has(String(value).trim());
}

function redact(value) {
  if (value.startsWith("eyJ") || value.startsWith("sb_")) {
    return `${value.slice(0, 8)}…[redacted, ${value.length} chars]`;
  }
  return JSON.stringify(value);
}

/**
 * Returns an array of human-readable problems. Empty means the environment is
 * usable. Kept pure and env-injected so --self-test can exercise it.
 */
function validate(env) {
  const problems = [];

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (isMissing(url)) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL is not set. Expected https://<project-ref>.supabase.co");
  } else {
    const value = String(url).trim();
    let parsed = null;
    try {
      parsed = new URL(value);
    } catch {
      problems.push(
        `NEXT_PUBLIC_SUPABASE_URL is not a valid URL (got ${redact(value)}). ` +
          "A value starting 'eyJ' means the ANON KEY was pasted into the URL variable.",
      );
    }
    if (
      parsed &&
      parsed.protocol !== "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      problems.push(`NEXT_PUBLIC_SUPABASE_URL must use https (got ${parsed.protocol}//).`);
    }
  }

  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isMissing(anon)) {
    problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Expected 'eyJ…' or 'sb_publishable_…'");
  } else {
    const value = String(anon).trim();
    if (!value.startsWith("eyJ") && !value.startsWith("sb_publishable_")) {
      problems.push(
        `NEXT_PUBLIC_SUPABASE_ANON_KEY does not look like a Supabase anon key (got ${redact(value)}). ` +
          "A value starting 'https://' means the PROJECT URL was pasted into the key variable.",
      );
    }
  }

  // Server-side only. Absent in a browser-only preview build, so a missing value
  // is a warning path rather than an error here — but the anon-key mixup is
  // always an error, because it produces a client that silently does nothing.
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isMissing(service) && !isMissing(anon) && String(service).trim() === String(anon).trim()) {
    problems.push(
      "SUPABASE_SERVICE_ROLE_KEY is set to the ANON key. Privileged operations would run under " +
        "RLS as an anonymous user — writes dropped, reads empty, no error raised.",
    );
  }

  return problems;
}

function selfTest() {
  const ok = {
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiJ9.a.b",
    SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiJ9.svc.c",
  };
  const cases = [
    ["valid", ok, 0],
    ["valid, no service key (browser-only build)", { ...ok, SUPABASE_SERVICE_ROLE_KEY: undefined }, 0],
    ["valid publishable key", { ...ok, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc" }, 0],
    ["valid local stack", { ...ok, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }, 0],
    ["url unset", { ...ok, NEXT_PUBLIC_SUPABASE_URL: undefined }, 1],
    ['url is the string "undefined"', { ...ok, NEXT_PUBLIC_SUPABASE_URL: "undefined" }, 1],
    // The exact misconfiguration this project actually shipped with.
    ["url holds the anon key", { ...ok, NEXT_PUBLIC_SUPABASE_URL: ok.NEXT_PUBLIC_SUPABASE_ANON_KEY }, 1],
    ["url is plain http", { ...ok, NEXT_PUBLIC_SUPABASE_URL: "http://example.com" }, 1],
    ["anon key unset", { ...ok, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }, 1],
    ["anon key holds the url", { ...ok, NEXT_PUBLIC_SUPABASE_ANON_KEY: "https://abc.supabase.co" }, 1],
    ["service key equals anon key", { ...ok, SUPABASE_SERVICE_ROLE_KEY: ok.NEXT_PUBLIC_SUPABASE_ANON_KEY }, 1],
  ];

  let failed = 0;
  for (const [name, env, expected] of cases) {
    const got = validate(env).length;
    const pass = got === expected;
    if (!pass) failed++;
    console.log(`${pass ? "  ok  " : "  FAIL"}  ${name} — expected ${expected} problem(s), got ${got}`);
  }
  console.log(failed === 0 ? "\nself-test passed" : `\nself-test FAILED (${failed})`);
  return failed === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes("--self-test")) {
    process.exit(selfTest());
  }

  loadNextEnv();
  const problems = validate(process.env);
  if (problems.length === 0) {
    console.log("[check-env] Supabase environment OK");
    return;
  }

  console.error("\n[check-env] Supabase environment is misconfigured:\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    "\nSet these in web/.env.local for local development, or in the Vercel project's\n" +
      "Environment Variables for the deployed environment. There is deliberately no\n" +
      "fallback — a wrong value used to be masked by hardcoded production credentials,\n" +
      "which meant preview deploys silently read and wrote the production database.\n",
  );
  process.exit(1);
}

main();
