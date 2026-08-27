#!/usr/bin/env node
// Writes web's design-token CSS from packages/shared/src/tokens.ts.
//
//   node scripts/gen-tokens.mjs           # rewrite the block
//   node scripts/gen-tokens.mjs --check   # fail if it would change anything
//
// Web is Tailwind v4 with CSS-first config, so its tokens are CSS custom
// properties rather than a JS config object. That makes them unreachable from
// TypeScript, and therefore unshareable with mobile — which is the whole reason
// the two platforms drifted into different palettes.
//
// The tokens module is canonical; this replaces the marked block in globals.css
// from it. Everything outside the markers is untouched, so hand-written CSS
// lives safely in the same file.
//
// `--check` is the guard that makes this safe to have: CI (and a human before
// committing) can prove the committed CSS still matches the tokens, so nobody
// edits the generated block by hand and has it silently reverted later.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = join(ROOT, "web", "src", "app", "globals.css");
const TOKENS_TS = join(ROOT, "packages", "shared", "src", "tokens.ts");
const OUT_DIR = join(ROOT, "node_modules", ".cache", "gen-tokens");

const BEGIN = "/* BEGIN GENERATED TOKENS — edit packages/shared/src/tokens.ts, then run scripts/gen-tokens.mjs */";
const END = "/* END GENERATED TOKENS */";

// The tokens file is TypeScript; compile it to something node can import.
// web/ owns the only tsc in the repo.
execFileSync(
  join(ROOT, "web", "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"),
  [TOKENS_TS, "--outDir", OUT_DIR, "--module", "es2020", "--target", "es2020", "--skipLibCheck"],
  { stdio: "inherit", shell: process.platform === "win32" },
);

const t = await import(`file://${join(OUT_DIR, "tokens.js")}`);

function block() {
  const lines = [BEGIN];
  // padEnd alone is not enough: "  --destructive-foreground:" is exactly 27
  // characters, so padding to 27 leaves NO space before the value and emits
  // `--destructive-foreground:0 0% 98%`, which is not valid CSS. Always keep at
  // least one separator.
  const pad = (name) => {
    const head = `  ${name}:`;
    return head + " ".repeat(Math.max(1, 27 - head.length));
  };

  lines.push(":root {");
  for (const role of t.COLOR_ROLE_ORDER) {
    lines.push(`${pad(t.CSS_VAR_NAMES[role])}${t.toCssTriplet(t.light[role])};`);
  }
  lines.push(`${pad("--radius")}${t.radius.base};`);
  lines.push("}");
  lines.push("");
  lines.push(".dark {");
  for (const role of t.COLOR_ROLE_ORDER) {
    lines.push(`${pad(t.CSS_VAR_NAMES[role])}${t.toCssTriplet(t.dark[role])};`);
  }
  lines.push("}");
  lines.push(END);
  return lines.join("\n");
}

const css = readFileSync(CSS, "utf8");
const start = css.indexOf(BEGIN);
const finish = css.indexOf(END);

if (start === -1 || finish === -1) {
  console.error(
    "[gen-tokens] markers not found in globals.css.\n" +
      "Wrap the :root and .dark token blocks with:\n  " +
      BEGIN +
      "\n  ...\n  " +
      END,
  );
  process.exit(1);
}

const next = css.slice(0, start) + block() + css.slice(finish + END.length);

if (process.argv.includes("--check")) {
  if (next === css) {
    console.log("[gen-tokens] globals.css matches tokens.ts");
    process.exit(0);
  }
  console.error(
    "[gen-tokens] globals.css does NOT match tokens.ts.\n" +
      "Either the generated block was hand-edited, or tokens.ts changed without\n" +
      "regenerating. Run: node scripts/gen-tokens.mjs",
  );
  process.exit(1);
}

if (next === css) {
  console.log("[gen-tokens] no change — globals.css already matches tokens.ts");
} else {
  writeFileSync(CSS, next, "utf8");
  console.log("[gen-tokens] rewrote the token block in globals.css");
}
