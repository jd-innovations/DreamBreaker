// Renders review stills (with the 4:5 safe-area guide) at the same moments the
// reference script's "stills" mode used, plus a contact sheet.
//   node scripts/stills.mjs [outDir]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(process.argv[2] ?? path.join(root, "out", "stills"));

// [name, frame] — scene starts: s1 0, s2 150, s3 255 (panels every 60), s4 495, s5 585, s6 663.
const FRAMES = [
  ["a-intro-headline", 120],
  ["b-hub", 240],
  ["c-map", 312],
  ["c2-wipe", 320],
  ["d-open-play", 363],
  ["d2-partner", 423],
  ["e-tournament", 489],
  ["f-grid", 579],
  ["g-beats", 657],
  ["h-outro-lockup", 789],
  ["i-outro-line", 690],
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
