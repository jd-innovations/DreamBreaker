#!/usr/bin/env node
// Writes the derived sections of DESIGN_STANDARD.md.
//
//   node scripts/gen-design-standard.mjs           # rewrite the blocks
//   node scripts/gen-design-standard.mjs --check   # fail if anything drifted
//
// Why this exists: the standard's type and shape tables were written by hand
// alongside packages/shared/src/tokens.ts, which is the same data twice. It
// drifted exactly the way two copies always do — on 2026-09-03 the type table
// still listed sectionLabel as 11/700 while decision 6 had changed it to
// 13/800, so the table and the decision contradicted each other and anyone
// following the table would have migrated it wrong.
//
// The tables are now generated from the tokens, and the progress counts are
// measured from the tree at generation time. What stays hand-written is the
// prose — the decisions and the reasoning — which is append-only and does not
// drift.
//
// Same contract as gen-tokens.mjs: `--check` is what makes this safe to have.
// It proves the committed document still matches the code.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = join(ROOT, "DESIGN_STANDARD.md");
const TOKENS_TS = join(ROOT, "packages", "shared", "src", "tokens.ts");
const OUT_DIR = join(ROOT, "node_modules", ".cache", "gen-tokens");
const MOBILE_SRC = join(ROOT, "apps", "mobile", "src");

// web/ owns the only tsc in the repo, same as gen-tokens.mjs.
execFileSync(
  join(ROOT, "web", "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"),
  [TOKENS_TS, "--outDir", OUT_DIR, "--module", "es2020", "--target", "es2020", "--skipLibCheck"],
  { stdio: "inherit", shell: process.platform === "win32" },
);
const t = await import(`file://${join(OUT_DIR, "tokens.js")}?v=${Date.now()}`);

// ── the scan ────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Occurrences and distinct files, because they differ and the difference
 *  changes how big a job something is. */
function count(files, re) {
  let occ = 0;
  let hit = 0;
  for (const { body } of files) {
    const m = body.match(re);
    if (m) {
      occ += m.length;
      hit += 1;
    }
  }
  return { occ, files: hit };
}

const files = walk(MOBILE_SRC).map((p) => ({ p, body: readFileSync(p, "utf8") }));
const withStyles = files.filter((f) => /fontSize|borderRadius/.test(f.body));
const migrated = files.filter((f) => /from ['"]@shared\/tokens['"]/.test(f.body));

const rawSizes = count(withStyles, /fontSize: \d+/g);
const oldRadius = count(withStyles, /borderRadius: radius\.\w+/g);
const r30 = count(withStyles, /borderRadius: 30\b/g);
const r999 = count(withStyles, /borderRadius: 999\b/g);

// ── the blocks ──────────────────────────────────────────────────────────────

function typeTable() {
  const rows = Object.entries(t.text).map(([name, v]) => {
    const bits = [`${v.size} / ${v.weight}`];
    if (v.lineHeight) bits.push(`lh ${v.lineHeight}`);
    if (v.letterSpacing) bits.push(`ls ${v.letterSpacing}`);
    if (v.uppercase) bits.push("uppercase");
    return `| \`${name}\` | ${bits.join(", ")} |`;
  });
  const sizes = [...new Set(Object.values(t.text).map((v) => v.size))].sort((a, b) => b - a);
  const weights = [...new Set(Object.values(t.text).map((v) => v.weight))].sort((a, b) => b - a);
  return [
    `${Object.keys(t.text).length} roles, generated from \`packages/shared/src/tokens.ts\`.`,
    "",
    "| Role | Value |",
    "| --- | --- |",
    ...rows,
    "",
    `Sizes: **${sizes.join(" · ")}**. Weights: **${weights.join(" · ")}**.`,
  ].join("\n");
}

function scaleTables() {
  const rad = Object.entries(t.radius).map(([k, v]) => `| \`${k}\` | ${v} |`);
  const sp = Object.entries(t.space).map(([k, v]) => `| \`${k}\` | ${v} |`);
  return [
    "**Radius**",
    "",
    "| Role | px |",
    "| --- | ---: |",
    ...rad,
    "",
    "**Spacing**",
    "",
    "| Role | px |",
    "| --- | ---: |",
    ...sp,
    "",
    "Icon circles are half their own size and take no role.",
  ].join("\n");
}

function progress() {
  const pct = Math.round((migrated.length / withStyles.length) * 100);
  return [
    `Measured from the tree when this was generated — ${withStyles.length} \`.tsx\` files`,
    `under \`apps/mobile/src\` carry a \`fontSize\` or \`borderRadius\`.`,
    "",
    "| | Occurrences | Files |",
    "| --- | ---: | ---: |",
    `| Files importing \`@shared/tokens\` (migrated) | — | **${migrated.length} of ${withStyles.length}** (${pct}%) |`,
    `| Raw \`fontSize: N\` remaining | ${rawSizes.occ} | ${rawSizes.files} |`,
    `| \`borderRadius: radius.*\` from \`@/theme\` remaining | ${oldRadius.occ} | ${oldRadius.files} |`,
    `| \`borderRadius: 30\` → \`shape.cta\` | ${r30.occ} | ${r30.files} |`,
    `| \`borderRadius: 999\` → \`shape.cta\` | ${r999.occ} | ${r999.files} |`,
    "",
    "Raw sizes include the deliberate exemptions (below the 11pt floor, and",
    "avatar initials sized to their container), so the remaining count will not",
    "reach zero.",
  ].join("\n");
}

const BLOCKS = {
  "type-scale": typeTable,
  "scales": scaleTables,
  "progress": progress,
};

// ── splice ──────────────────────────────────────────────────────────────────

let doc = readFileSync(DOC, "utf8");
const eol = doc.includes("\r\n") ? "\r\n" : "\n";
let flat = doc.split("\r\n").join("\n");

for (const [name, build] of Object.entries(BLOCKS)) {
  const begin = `<!-- BEGIN GENERATED: ${name} — edit packages/shared/src/tokens.ts, then run scripts/gen-design-standard.mjs -->`;
  const end = `<!-- END GENERATED: ${name} -->`;
  const a = flat.indexOf(begin);
  const b = flat.indexOf(end);
  if (a === -1 || b === -1) {
    console.error(`[gen-design-standard] markers for "${name}" not found in DESIGN_STANDARD.md.\nExpected:\n  ${begin}\n  ...\n  ${end}`);
    process.exit(1);
  }
  flat = flat.slice(0, a) + begin + "\n\n" + build() + "\n\n" + flat.slice(b);
}

const next = flat.split("\n").join(eol);

if (process.argv.includes("--check")) {
  if (next === doc) {
    console.log("[gen-design-standard] DESIGN_STANDARD.md matches tokens.ts and the tree");
    process.exit(0);
  }
  console.error(
    "[gen-design-standard] DESIGN_STANDARD.md is STALE.\n" +
      "Either a generated block was hand-edited, or tokens.ts / the codebase changed.\n" +
      "Run: node scripts/gen-design-standard.mjs",
  );
  process.exit(1);
}

if (next === doc) console.log("[gen-design-standard] no change");
else {
  writeFileSync(DOC, next, "utf8");
  console.log("[gen-design-standard] rewrote the generated blocks");
}
