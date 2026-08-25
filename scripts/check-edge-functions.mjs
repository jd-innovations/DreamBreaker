#!/usr/bin/env node
/**
 * Type-checks every Supabase edge function with `deno check`.
 *
 * Why this exists: edge functions are Deno, and nothing in this repo was
 * type-checking them. `tsc -p web` does not see them and has been green
 * throughout. That gap hid a real defect for a while — the payment functions
 * imported stripe@18 (native API version 2025-08-27.basil) while passing a
 * dahlia `apiVersion`, so Stripe answered in dahlia against typings that
 * described basil. Nine of fifteen functions were failing `deno check` and
 * nobody knew, because nobody ran it. See TODO1.1_EXECUTION_PLAN.md 3.4.
 *
 * Deliberately a repo-level script rather than a `supabase/functions/deno.json`
 * task: a config file inside that directory is read by the Supabase CLI at
 * deploy time, and dev tooling has no business sitting in the deploy path of
 * live payment functions.
 *
 * Deno is invoked through `npx deno@2` so this needs no global install and
 * pins the major version — a `deno` on PATH could be anything.
 *
 * Usage:
 *   node scripts/check-edge-functions.mjs
 *   node scripts/check-edge-functions.mjs --quiet   # only print on failure
 */

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");
const quiet = process.argv.includes("--quiet");

/**
 * Every directory with an index.ts. `_shared` has no index.ts and is not
 * checked directly — it is pulled in by the functions that import it, so its
 * errors still surface, attributed to the importer.
 */
function findEntrypoints() {
  if (!existsSync(FUNCTIONS_DIR)) {
    console.error(`No such directory: ${FUNCTIONS_DIR}`);
    process.exit(1);
  }
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join("supabase", "functions", e.name, "index.ts"))
    .filter((p) => existsSync(join(ROOT, p)))
    .sort();
}

const entrypoints = findEntrypoints();

if (entrypoints.length === 0) {
  console.error("Found no edge function entrypoints. Refusing to pass vacuously.");
  process.exit(1);
}

if (!quiet) {
  console.log(`Type-checking ${entrypoints.length} edge functions with deno check...\n`);
}

// One invocation rather than one per function: the module graph is shared, so
// checking them together is several times faster than looping.
//
// shell:true on Windows because Node refuses to spawnSync a .cmd shim directly
// (EINVAL) since the 18.20/20.12 argument-injection fix.
//
// Passed as ONE command string rather than a command plus an args array:
// combining an args array with shell:true triggers DEP0190 on every run, and a
// deprecation warning printed by a checker is noise that teaches people to skim
// its output. Paths come from readdir on a repo directory, not from user input,
// and are quoted regardless.
const isWindows = process.platform === "win32";
const quoted = entrypoints.map((p) => `"${p}"`).join(" ");

const result = isWindows
  ? spawnSync(`npx --yes deno@2 check ${quoted}`, {
      cwd: ROOT,
      stdio: quiet ? "pipe" : "inherit",
      encoding: "utf8",
      shell: true,
    })
  : spawnSync("npx", ["--yes", "deno@2", "check", ...entrypoints], {
      cwd: ROOT,
      stdio: quiet ? "pipe" : "inherit",
      encoding: "utf8",
    });

if (result.error) {
  console.error(`Could not run deno: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  if (quiet) {
    process.stderr.write(result.stderr ?? "");
    process.stdout.write(result.stdout ?? "");
  }
  console.error(`\nedge function type check FAILED (deno exit ${result.status})`);
  process.exit(1);
}

console.log(`edge function type check passed (${entrypoints.length} functions)`);
