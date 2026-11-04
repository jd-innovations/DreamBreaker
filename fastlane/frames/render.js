// node render.js <screenshot.png> <icon.svg> "<headline, | = line break>" <out.png>
// Renders at 2x (2640x5736); downscale.py brings it to 1320x2868 with Lanczos,
// which keeps text sharper than letting the browser shrink the screenshot.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { pathToFileURL } = require("url");
const [shot, icon, headline, out] = process.argv.slice(2);
(async () => {
  const html = fs.readFileSync(path.join(__dirname, "frame.html"), "utf8")
    .replace("{{SHOT}}", shot).replace("{{ICON}}", icon).replace("{{HEADLINE}}", headline.split("|").join("<br>"));
  const tmp = path.join(__dirname, "_frame.html");
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 2 });
  await p.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out });
  await b.close();
})();
