#!/usr/bin/env node
// Applies design-standard roles to one screen's styles.
//
//   node scripts/migrate-styles.mjs --collisions <file>     # ALWAYS run first
//   node scripts/migrate-styles.mjs <file> <mapping.json>
//
// Why this exists: hand-written exact-match anchors are fragile. They break on
// whitespace and multi-line objects, and reconstructing them from a normalised
// dump means guessing at source text — which failed three times on stats.tsx
// before this tool replaced it. This edits the parsed style block, so the
// mapping is `styleName -> role` and nothing depends on formatting.
//
// Sheet scoping, and why --collisions is not optional:
//
//   The first version of this tool matched style names globally. stats.tsx has
//   three styles named `title` in three stylesheets — two card headings at
//   22/900 and one modal title at 20/900 — so all three took `modalTitle` and
//   the card headings silently shrank. That shipped before it was caught.
//
//   Keys may now be bare (`cardName`) or sheet-scoped (`ab.label`). A bare key
//   maps every sheet, which is correct only when the name means one thing in
//   the file. `--collisions` lists the names where it does not, and the tool
//   REFUSES to apply a bare key to a name that appears in more than one sheet.
//
// mapping.json:
//   { "type":  { "cardName": "cardTitle", "ab.label": "controlLabel" },
//     "shape": { "card": "card", "tab": "cta" },
//     "allow": ["10", "9"] }        // raw sizes that stay, each one a
//                                   // documented exemption
//
// Asserts every mapped key was found and that no unmapped raw size survives —
// rule 12, enforced rather than remembered.

import { readFileSync, writeFileSync } from "node:fs";

const ROLE_WEIGHT = {
  pageTitle: "900", heroTitle: "800", statNumber: "900", cardTitle: "800",
  modalTitle: "900", statValueSm: "900", sectionTitle: "900", actionLarge: "800",
  titleSm: "800", body: "500", rowTitle: "700", rowValue: "800",
  fieldLabel: "800", action: "800", link: "700", controlLabel: "700",
  sectionLabel: "800", chipValue: "800", caption: "500", cardLabel: "800",
};

// Roles that carry letterSpacing carry it when applied, so a role lands whole
// rather than in pieces.
const ROLE_LETTERSPACING = new Set(["sectionLabel", "cardLabel"]);

// One level of nesting, because RN styles routinely hold `shadowOffset: {...}`.
// A flat `[^{}]*` stops at the inner brace, so those styles were invisible to
// an earlier version of this tool — `bs.card` on nearby.tsx and two others were
// silently skipped, and the rule-12 check does not cover raw borderRadius, so
// nothing complained.
const BLOCK = /([A-Za-z_]\w*)\s*:\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const SHEET = /const (\w+)\s*(?::[^=]*)?=\s*(?:\([^)]*\)\s*=>\s*)?StyleSheet\.create/g;

function sheetsOf(src) {
  const out = [];
  for (const m of src.matchAll(SHEET)) out.push([m.index, m[1]]);
  return out;
}

function sheetAt(sheets, pos) {
  let name = null;
  for (const [start, s] of sheets) {
    if (start <= pos) name = s;
    else break;
  }
  return name;
}

/** Style names that appear in more than one stylesheet, with their values. */
function collisions(src) {
  const sheets = sheetsOf(src);
  const byName = new Map();
  for (const m of src.matchAll(BLOCK)) {
    if (!/fontSize|borderRadius/.test(m[2])) continue;
    const list = byName.get(m[1]) ?? [];
    list.push([sheetAt(sheets, m.index), m[2].replace(/\s+/g, " ").trim()]);
    byName.set(m[1], list);
  }
  return [...byName.entries()].filter(([, v]) => v.length > 1);
}

const args = process.argv.slice(2);

if (args[0] === "--collisions") {
  const src = readFileSync(args[1], "utf8");
  const hits = collisions(src);
  if (!hits.length) {
    console.log("[migrate-styles] no repeated style names — bare keys are safe here");
    process.exit(0);
  }
  console.log("[migrate-styles] these names appear in more than one stylesheet.");
  console.log("Use sheet-scoped keys (sheet.name) for each, or the tool will refuse.\n");
  for (const [name, uses] of hits) {
    for (const [sheet, props] of uses) {
      console.log(`  ${name.padEnd(20)} ${String(sheet).padEnd(14)} ${props.slice(0, 78)}`);
    }
    console.log("");
  }
  process.exit(0);
}

const [file, mappingPath] = args;
if (!file || !mappingPath) {
  console.error("usage: migrate-styles.mjs <file> <mapping.json>  |  --collisions <file>");
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(mappingPath, "utf8"));
const typeMap = cfg.type ?? {};
const shapeMap = cfg.shape ?? {};
const expand = new Set(cfg.expand ?? []);
const allow = (cfg.allow ?? []).map(String).sort();

// The legacy `typography` presets, read from their source rather than copied
// here, so this cannot drift from what the app actually renders.
//
// Why the tool needs them: a style that stays exempt — below the 11pt floor,
// or a decision-14 display size — has no role to swap the spread for, but the
// tool refuses to leave `typography.` behind. That combination is a dead end
// the tool used to hand back, and writing those values out by hand took four
// rounds on PlayerCredentialCard. `expand` resolves it in the tool instead.
const LEGACY = (() => {
  const src = readFileSync(new URL("../apps/mobile/src/theme/typography.ts", import.meta.url), "utf8");
  const body = /export const typography = \{([\s\S]*?)\n\} as const;/.exec(src);
  const out = {};
  for (const m of body[1].matchAll(/(\w+):\s*\{\s*fontSize:\s*(\d+),\s*fontWeight:\s*'(\d+)'/g)) {
    out[m[1]] = { size: Number(m[2]), weight: m[3] };
  }
  return out;
})();

let src = readFileSync(file, "utf8");
const sheets = sheetsOf(src);

// Refuse a bare key that covers a name living in several sheets — the bug that
// shipped on stats.tsx.
const ambiguous = new Set(collisions(src).map(([n]) => n));
for (const table of [typeMap, shapeMap]) {
  for (const key of Object.keys(table)) {
    if (!key.includes(".") && ambiguous.has(key)) {
      console.error(
        `[migrate-styles] "${key}" appears in more than one stylesheet in ${file}.\n` +
          "Use sheet-scoped keys for it. Run --collisions to see them.",
      );
      process.exit(1);
    }
  }
}

const seen = new Set();

function lookup(table, sheet, name) {
  const scoped = `${sheet}.${name}`;
  if (sheet && scoped in table) { seen.add(scoped); return table[scoped]; }
  if (name in table) { seen.add(name); return table[name]; }
  return null;
}

// Only ever edit inside a StyleSheet.create(...) body.
//
// Without this the block regex matches any `name: { ... }` anywhere in the
// file, including JSX. On marketplace/[id].tsx it matched
// `Asking price: {formatPriceCents(...)}` and injected style props into a JSX
// expression. tsc caught it, but the tool should not be able to write it.
function styleSheetRegions(text) {
  const out = [];
  for (const m of text.matchAll(/StyleSheet\.create\(/g)) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (c === "(" || c === "{" || c === "[") depth += 1;
      else if (c === ")" || c === "}" || c === "]") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push([m.index, i + 1]);
  }
  return out;
}

function applyRoles(name, props, offset) {
  const sheet = sheetAt(sheets, offset);
  let out = props;

  const role = lookup(typeMap, sheet, name);
  if (role) {
    if (!(role in ROLE_WEIGHT)) {
      console.error(`[migrate-styles] unknown role "${role}"`);
      process.exit(1);
    }
    // A `...typography.X` spread supplied size and weight; the role does both.
    // Optional trailing comma: a spread written last in the block
    // (`{ color: x, ...typography.metadata }`) has none, and requiring one left
    // it in place — which the leftover-spread check then refused, on four files.
    out = out.replace(/\.\.\.typography\.\w+\s*,?\s*/g, "");
    const size = `fontSize: text.${role}.size`;
    const weight = `fontWeight: '${ROLE_WEIGHT[role]}'`;

    if (/fontSize:\s*\d+/.test(out)) {
      out = out.replace(/fontSize:\s*\d+/, size);
    } else if (/fontSize:\s*text\.\w+\.size/.test(out)) {
      // Already migrated. Re-point it rather than inject a second fontSize —
      // running twice used to produce duplicate keys and a TS1117 error.
      out = out.replace(/fontSize:\s*text\.\w+\.size/, size);
    } else {
      out = ` ${size},${out}`;                    // size came from the spread
    }

    if (/fontWeight:\s*'\d+'/.test(out)) out = out.replace(/fontWeight:\s*'\d+'/, weight);
    else out = out.replace(size, `${size}, ${weight}`);

    if (ROLE_LETTERSPACING.has(role)) {
      const ls = `letterSpacing: text.${role}.letterSpacing`;
      if (/letterSpacing:\s*-?[\d.]+/.test(out)) {
        out = out.replace(/letterSpacing:\s*-?[\d.]+/, ls);
      } else if (/letterSpacing:\s*text\.\w+\.letterSpacing/.test(out)) {
        out = out.replace(/letterSpacing:\s*text\.\w+\.letterSpacing/, ls);
      } else {
        out = out.replace(weight, `${weight}, ${ls}`);
      }
    }
  }

  // An exempt style keeps its own size but must not keep the spread. Write out
  // only what the spread actually contributed: these styles routinely set
  // fontSize (and sometimes fontWeight) right after it, in which case the
  // preset supplied nothing and expanding it would duplicate a key.
  if (!role && expand.has(name) && /\.\.\.typography\.(\w+)/.test(out)) {
    const preset = LEGACY[/\.\.\.typography\.(\w+)/.exec(out)[1]];
    if (!preset) {
      console.error(`[migrate-styles] ${name}: unknown typography preset`);
      process.exit(1);
    }
    const add = [];
    if (!/fontSize:/.test(out)) add.push(`fontSize: ${preset.size}`);
    if (!/fontWeight:/.test(out)) add.push(`fontWeight: '${preset.weight}'`);
    out = out.replace(/\.\.\.typography\.\w+\s*,?\s*/, add.length ? `${add.join(", ")}, ` : "");
    seen.add(name);
  }

  const shape = lookup(shapeMap, sheet, name);
  if (shape) {
    out = out.replace(/borderRadius:\s*(?:radius\.\w+|[\d.]+)/, `borderRadius: shape.${shape}`);
  }

  return `${name}: {${out}}`;
}

const regions = styleSheetRegions(src);
if (!regions.length) {
  console.error(`[migrate-styles] ${file}: no StyleSheet.create found`);
  process.exit(1);
}

// Rebuild the file, running the block replacement only inside each region.
let rebuilt = "";
let cursor = 0;
for (const [start, end] of regions) {
  rebuilt += src.slice(cursor, start);
  rebuilt += src
    .slice(start, end)
    .replace(BLOCK, (whole, name, props, inner) => applyRoles(name, props, start + inner));
  cursor = end;
}
rebuilt += src.slice(cursor);
src = rebuilt;

// Legacy radius tokens also appear in arithmetic the shape mapping never sees:
// three bottom sheets set `borderTopLeftRadius: radius.card + 8` for their top
// corners. Renaming the token is safe wherever the number is unchanged, so the
// equivalences are checked against both scales rather than trusted. `button`
// (14) has no value-identical partner — decision 2 moved CTAs to 10 — so it is
// deliberately absent and must be mapped by hand.
{
  const scale = (path, re) => {
    const body = re.exec(readFileSync(new URL(path, import.meta.url), "utf8"))[1];
    return Object.fromEntries([...body.matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], +m[2]]));
  };
  const legacy = scale("../apps/mobile/src/theme/radius.ts", /export const radius = \{([\s\S]*?)\n\} as const;/);
  const shared = scale("../packages/shared/src/tokens.ts", /export const radius = \{([\s\S]*?)\n\} as const;/);
  for (const [from, to] of [["card", "card"], ["chip", "pill"], ["sm", "cta"], ["md", "panel"]]) {
    if (legacy[from] !== shared[to]) {
      console.error(`[migrate-styles] radius.${from} (${legacy[from]}) != shape.${to} (${shared[to]}) — not a rename`);
      process.exit(1);
    }
    src = src.replace(new RegExp(`\\bradius\\.${from}\\b`, "g"), `shape.${to}`);
  }
}

const missing = [...new Set([...Object.keys(typeMap), ...Object.keys(shapeMap)])]
  .filter((k) => !seen.has(k));
if (missing.length) {
  console.error(`[migrate-styles] keys not found in ${file}: ${missing.join(", ")}`);
  process.exit(1);
}

if (!src.includes("@shared/tokens")) {
  // Either quote style. ContextMenu.tsx uses double quotes, and a single-quote
  // anchor made it look like a file with no @/theme import at all — which would
  // have been "fixed" by adding one by hand.
  const m = /^import \{([^}]*)\} from ["']@\/theme["'];$/m.exec(src);
  if (!m) {
    console.error(`[migrate-styles] ${file}: no @/theme import to anchor onto`);
    process.exit(1);
  }
  const kept = m[1].split(",").map((x) => x.trim())
    .filter((x) => x && x !== "radius" && x !== "typography");
  // Import what the rewritten file actually references, not what the mapping
  // declared. A file can gain `shape.` from the value-identical rename above
  // without having a single shape mapping, and importing `shape` where nothing
  // uses it leaves an unused import and a lint warning.
  const wanted = [];
  if (/\bshape\.\w+/.test(src)) wanted.push("radius as shape");
  if (/\btext\.\w+\.(?:size|letterSpacing)/.test(src)) wanted.push("text");
  src = src.replace(
    m[0],
    `import { ${kept.join(", ")} } from '@/theme';\n` +
      "// Design standard, from the shared token source. See DESIGN_STANDARD.md.\n" +
      `import { ${wanted.join(", ")} } from '@shared/tokens';`,
  );
}

const left = [...src.matchAll(/fontSize: (\d+)/g)].map((m) => m[1]).sort();
if (JSON.stringify(left) !== JSON.stringify(allow)) {
  console.error(
    `[migrate-styles] rule 12: ${file} has unmapped raw sizes [${left}].\n` +
      `Declared exemptions were [${allow}]. Map them or declare them.`,
  );
  process.exit(1);
}

const stale = src.match(/\bradius\.(?:button|card|chip|sm|md)\b/g);
if (stale) {
  console.error(`[migrate-styles] ${file}: ${stale.length} leftover @/theme radius`);
  process.exit(1);
}
if (src.includes("typography.")) {
  console.error(`[migrate-styles] ${file}: leftover typography spread`);
  process.exit(1);
}

writeFileSync(file, src, "utf8");
console.log(`[migrate-styles] ${file} — ${seen.size} keys mapped, ${left.length} exempt`);

// Raw radii are legitimate for icon circles (half their own size), dots and
// handles, so this is a report rather than a failure. It exists because a
// silently-skipped radius has no other way of being noticed: the rule-12 check
// covers fontSize only.
const rawRadii = [...src.matchAll(/([A-Za-z_]\w*)\s*:\s*\{(?:[^{}]|\{[^{}]*\})*?borderRadius:\s*(\d+)/g)]
  .map((m) => `${m[1]}:${m[2]}`);
if (rawRadii.length) {
  console.log(`  raw radii left (check each is geometry, not a shape role): ${rawRadii.join(", ")}`);
}
