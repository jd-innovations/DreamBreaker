#!/usr/bin/env node
// Regenerates the shared Supabase types.
//
//   node scripts/gen-db-types.mjs
//
// There is exactly one destination: packages/shared/src/database.types.ts.
// Before B2 this file was copied by hand into both apps — 275 KB, byte for
// byte identical, with nothing keeping them that way.
//
// ── Why a script instead of a documented command ──────────────────────────────
//
// The obvious one-liner is wrong on Windows:
//
//   supabase gen types typescript --project-id ... > database.types.ts
//
// PowerShell's `>` writes **UTF-16LE with a BOM**. TypeScript reads the file,
// sees mojibake or fails outright, and the failure looks like a broken
// generator rather than a broken redirect. That has cost time on this repo
// before. Capturing stdout and writing it with an explicit UTF-8 encoding
// removes the trap entirely, on every shell.
//
// This never writes a truncated or empty file: the CLI has to exit 0 and
// produce something that looks like the expected output before anything on
// disk is touched. A failed generation leaves the previous types in place,
// because a half-written 275 KB type file breaks every import in both apps.

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "packages", "shared", "src", "database.types.ts");
const PROJECT_ID = process.env.SUPABASE_PROJECT_ID ?? "fbzetvkbhneptvfruilw";

console.log(`[gen-db-types] project ${PROJECT_ID}`);
console.log(`[gen-db-types] -> ${OUT}`);

let generated;
try {
  // `shell: true` on Windows is required, not stylistic: Node 20+ refuses to
  // spawn a .cmd (which is what `npx` is there) without it and throws EINVAL.
  // Every argument here is a literal with no spaces or shell metacharacters,
  // so passing them through a shell is safe.
  generated = execFileSync(
    "npx",
    ["--yes", "supabase", "gen", "types", "typescript", "--project-id", PROJECT_ID, "--schema", "public"],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
      shell: process.platform === "win32",
    },
  );
} catch (err) {
  console.error("[gen-db-types] generation failed — existing types left untouched.");
  console.error(err.message);
  process.exit(1);
}

// Guard against a CLI that exits 0 having printed a login prompt, an error
// page, or nothing at all.
if (!generated || !generated.includes("export type Database")) {
  console.error(
    "[gen-db-types] output did not contain `export type Database` — refusing to write.\n" +
      "Check that the Supabase CLI is authenticated (`npx supabase login`).",
  );
  process.exit(1);
}

const previous = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
if (previous === generated) {
  console.log("[gen-db-types] no schema changes — file already current.");
  process.exit(0);
}

writeFileSync(OUT, generated, { encoding: "utf8" });
console.log(
  `[gen-db-types] wrote ${generated.length.toLocaleString()} chars ` +
    `(was ${previous.length.toLocaleString()}).`,
);
console.log("[gen-db-types] run `npx tsc --noEmit` in web/ before committing.");
