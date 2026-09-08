#!/usr/bin/env node
/*
  Builds the notification-email shell assets into supabase/email-assets/.

  Email clients strip inline SVG (Gmail, Outlook, Yahoo), so every glyph in the
  email shell has to ship as a raster image on a public URL. This script is the
  reproducible source of those files — regenerate rather than hand-editing, and
  bump the -vN suffix when artwork changes so CDN caches are never fought.

  Icons are Ionicons logo glyphs (the app's own icon set, see DESIGN_TOKENS.md),
  drawn white inside the gold ring on a TRANSPARENT background so they composite
  onto the navy footer. The ring is baked into the PNG because a CSS-bordered
  circle does not render reliably across email clients.

  Requires `sharp` (not a repo dependency — install it ad hoc):
    npm install sharp

  Usage from repo root:
    node scripts/build-email-assets.mjs
    node scripts/build-email-assets.mjs --contact-sheet   # adds a review sheet
*/

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('This script needs sharp for SVG rasterizing.\n  npm install sharp');
  process.exit(1);
}

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'supabase', 'email-assets');
const SRC_LOGO = path.join(ROOT, 'apps', 'mobile', 'assets', 'images', 'pickleballapp-logo-light.png');

// Ionicons SVG source. The copy bundled with the app is a TTF, so the vectors
// come from the npm package instead.
const ICON_SVG_DIRS = [
  path.join(ROOT, 'node_modules', 'ionicons', 'dist', 'svg'),
  path.join(ROOT, 'apps', 'mobile', 'node_modules', 'ionicons', 'dist', 'svg'),
];

const GOLD = '#C9A84C';
const RING_OPACITY = 0.35;   // matches rgba(201,168,76,0.35) in the design
const SIZE = 64;             // 2x of the 32px display size
const RING_STROKE = 2;       // 2x of 1px

// Per-glyph optical sizing. Ionicons' logo marks differ in visual weight —
// facebook is a solid disc, instagram an outline, youtube wide and short.
// Sizing them all to the same box makes the solid ones dominate, so each is
// tuned to read evenly inside the ring. facebook is 27, not 30: at 30 the disc
// crowds the ring and visually merges with it.
const ICONS = [
  { name: 'facebook',  file: 'logo-facebook.svg',  glyph: 27 },
  { name: 'instagram', file: 'logo-instagram.svg', glyph: 31 },
  { name: 'youtube',   file: 'logo-youtube.svg',   glyph: 32 },
  { name: 'tiktok',    file: 'logo-tiktok.svg',    glyph: 28 },
];

function iconSvgDir() {
  const found = ICON_SVG_DIRS.find((d) => fs.existsSync(d));
  if (!found) {
    console.error(
      'Could not find ionicons SVG source. Install it:\n  npm install ionicons\n' +
        'Looked in:\n  ' + ICON_SVG_DIRS.join('\n  '),
    );
    process.exit(1);
  }
  return found;
}

function innerSvg(dir, file) {
  const s = fs.readFileSync(path.join(dir, file), 'utf8');
  return s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
}

async function buildIcon(dir, { name, file, glyph }) {
  const scale = glyph / 512;                 // Ionicons viewBox is 0 0 512 512
  const offset = (SIZE - glyph) / 2;
  const r = SIZE / 2 - RING_STROKE / 2;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${r}" fill="none" stroke="${GOLD}" ` +
    `stroke-opacity="${RING_OPACITY}" stroke-width="${RING_STROKE}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="#FFFFFF">${innerSvg(dir, file)}</g>` +
    `</svg>`;

  const out = path.join(OUT_DIR, `social-${name}-v1.png`);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
  console.log(`  social-${name}-v1.png`.padEnd(28) + `${SIZE}x${SIZE}  ${fs.statSync(out).size} B`);
  return out;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dir = iconSvgDir();

  const built = [];
  for (const icon of ICONS) built.push(await buildIcon(dir, icon));

  // Wordmark. Already 920x172, which is >=2x the largest use (380px in the
  // header), so this is a recompress only — never an upscale.
  if (!fs.existsSync(SRC_LOGO)) {
    console.error(`Missing source wordmark: ${SRC_LOGO}`);
    process.exit(1);
  }
  const meta = await sharp(SRC_LOGO).metadata();
  const logoOut = path.join(OUT_DIR, 'logo-light-v1.png');
  await sharp(SRC_LOGO).png({ compressionLevel: 9, palette: true }).toFile(logoOut);
  console.log(
    '  logo-light-v1.png'.padEnd(28) +
      `${meta.width}x${meta.height}  ${fs.statSync(SRC_LOGO).size} B -> ${fs.statSync(logoOut).size} B`,
  );

  if (process.argv.includes('--contact-sheet')) {
    const navy = { r: 10, g: 18, b: 40, alpha: 1 };
    const gap = 24, pad = 28;
    const composites = [];
    for (let i = 0; i < built.length; i += 1) {
      composites.push({
        input: await sharp(built[i]).resize(32, 32).toBuffer(),
        left: pad + i * (32 + gap),
        top: pad,
      });
    }
    const w = pad * 2 + built.length * 32 + (built.length - 1) * gap;
    const sheet = path.join(OUT_DIR, '_contact-sheet.png');
    await sharp({ create: { width: w, height: 32 + pad * 2, channels: 4, background: navy } })
      .composite(composites).png().toFile(sheet);
    console.log(`\n  _contact-sheet.png — icons at true 32px on navy (review only, do not upload)`);
  }

  console.log(`\nWrote ${built.length + 1} assets to supabase/email-assets/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
