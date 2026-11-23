// Renders review stills (with the 4:5 safe-area guide) at the same moments the
// reference script's "stills" mode used, plus a contact sheet.
//   node scripts/stills.mjs [outDir]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(process.argv[2] ?? path.join(root, "out", "stills"));

// [name, frame] — scene starts: s1 0, s2 150, s3 255, s4 435, s5 525, s6 603.
const FRAMES = [
  ["a-intro-headline", 120],
  ["b-hub", 240],
  ["c-map", 312],
  ["c2-wipe", 320],
  ["d-open-play", 363],
  ["e-tournament", 429],
  ["f-grid", 519],
  ["g-beats", 597],
  ["h-outro-lockup", 729],
  ["i-outro-line", 630],
  ["j-intro-icons", 30],
];

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts") });
const inputProps = { showSafeArea: process.env.NO_GUIDE ? false : true };
const composition = await selectComposition({ serveUrl, id: "PromoAd", inputProps });
for (const [name, frame] of FRAMES) {
  const output = path.join(outDir, `${name}.png`);
  await renderStill({ composition, serveUrl, frame, output, inputProps });
  console.log("wrote", output);
}
