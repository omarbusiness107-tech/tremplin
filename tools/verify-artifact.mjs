/**
 * Checks the artifact page: wraps the fragment the way the Artifact host does,
 * confirms the canvas fills its frame without overflowing the page at both
 * desktop and phone widths, and plays a few frames to be sure the game is live
 * inside the page chrome.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

// Simulate the Artifact host wrapper: it supplies doctype/html/head/body.
const fragment = readFileSync("dist/artifact.html", "utf8");
writeFileSync("dist/artifact-preview.html", `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0}</style></head><body>${fragment}</body></html>`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ignorable = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED/.test(t);
page.on("console", (m) => { if (m.type() === "error" && !ignorable(m.text())) errors.push(m.text()); });

await page.goto(`file://${process.cwd()}/dist/artifact-preview.html`);
await page.waitForFunction(() => Boolean(globalThis.penitence), null, { timeout: 10000 });
await page.waitForTimeout(600);

const box = await page.evaluate(() => {
  const c = document.querySelector("#stage canvas");
  const stage = document.getElementById("stage");
  return {
    canvas: { w: c.clientWidth, h: c.clientHeight },
    stage: { w: Math.round(stage.clientWidth), h: Math.round(stage.clientHeight) },
    bodyScrollW: document.body.scrollWidth,
    innerW: window.innerWidth,
    title: document.title,
  };
});
console.log("layout:", JSON.stringify(box));
console.log("canvas fits stage:", box.canvas.w <= box.stage.w && box.canvas.h <= box.stage.h, `canvas ${box.canvas.w}x${box.canvas.h} in ${box.stage.w}x${box.stage.h}`);
console.log("no horizontal page scroll:", box.bodyScrollW <= box.innerW);

await page.screenshot({ path: "dist/shots/artifact-top.png" });

// Play a little to confirm the game is live inside the page chrome.
await page.locator("#stage canvas").click();
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(600);
await page.keyboard.up("ArrowRight");
await page.keyboard.press("KeyJ");
await page.waitForTimeout(300);
const scene = await page.evaluate(() => globalThis.penitence.debug.scene);
console.log("scene after Enter:", scene);
await page.screenshot({ path: "dist/shots/artifact-playing.png" });

// Narrow viewport: the page must not scroll sideways.
await page.setViewportSize({ width: 420, height: 800 });
await page.waitForTimeout(400);
const narrow = await page.evaluate(() => ({ scrollW: document.body.scrollWidth, innerW: window.innerWidth }));
console.log("narrow: no horizontal scroll:", narrow.scrollW <= narrow.innerW, JSON.stringify(narrow));
await page.screenshot({ path: "dist/shots/artifact-narrow.png" });

console.log("errors:", errors.length ? errors.slice(0, 3) : "none");
await browser.close();
process.exit(errors.length === 0 && scene === "playing" ? 0 : 1);
