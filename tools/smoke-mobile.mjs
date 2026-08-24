/**
 * Phone checks. Playwright cannot drive two fingers at once, so multi-touch is
 * exercised by dispatching real PointerEvents with distinct pointerIds -- which
 * is exactly the path the touch layer listens on.
 *
 * Run with `npm run smoke:mobile`.
 */
import { chromium, devices } from "playwright";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = join(root, "dist", "shots");
mkdirSync(shotDir, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// ES modules and service workers are both blocked over file://, so the build is
// served the way a phone would actually load it.
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};
const dist = join(root, "dist");
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(dist, path === "/" ? "index.html" : path);
  if (!file.startsWith(dist) || !existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const failures = [];
function check(name, ok, detail = "") {
  console.log(ok ? `  pass  ${name}` : `  FAIL  ${name} ${detail}`);
  if (!ok) failures.push(name);
}

const browser = await chromium.launch({
  ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: ["--autoplay-policy=no-user-gesture-required"],
});

// A phone held sideways: the orientation the game is designed for.
const context = await browser.newContext({
  ...devices["Pixel 7"],
  viewport: { width: 915, height: 412 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/manifest|sw\.js|service worker/i.test(m.text())) errors.push(m.text());
});

await page.goto(origin);
await page.waitForFunction(() => Boolean(globalThis.penitence), null, { timeout: 10000 });
await page.waitForTimeout(300);

console.log("\nlayout");
check("touch controls appear on a phone", await page.locator(".pnt-touch").isVisible());
const fits = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  canvasW: document.querySelector("canvas").clientWidth,
  canvasH: document.querySelector("canvas").clientHeight,
  stageH: document.getElementById("stage").clientHeight,
}));
check("no horizontal page scroll", fits.scrollW <= fits.innerW, JSON.stringify(fits));
const aspect = fits.canvasW / fits.canvasH;
check(
  "canvas fills the height at 16:9",
  fits.canvasH === fits.stageH && Math.abs(aspect - 16 / 9) < 0.02,
  JSON.stringify({ ...fits, aspect: aspect.toFixed(3) }),
);

// Controls must not sit under the notch or off-screen.
const offscreen = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll(".pnt-btn, .pnt-pad, .pnt-chip")) {
    const r = el.getBoundingClientRect();
    if (r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) {
      bad.push(`${el.dataset.key ?? "pad"} ${Math.round(r.left)},${Math.round(r.top)}`);
    }
  }
  return bad;
});
check("every control is on-screen", offscreen.length === 0, offscreen.join(" | "));

// Buttons must be big enough to hit under a thumb.
const small = await page.evaluate(() =>
  [...document.querySelectorAll(".pnt-btn")]
    .map((el) => ({ k: el.dataset.key, w: Math.round(el.getBoundingClientRect().width) }))
    .filter((b) => b.w < 44),
);
check("buttons meet the 44px touch target", small.length === 0, JSON.stringify(small));

await page.screenshot({ path: join(shotDir, "m1-title.png") });

// -- synthetic multi-touch -------------------------------------------------
await page.evaluate(() => {
  globalThis.__finger = (type, id, sel, dx = 0, dy = 0) => {
    const layer = document.querySelector(".pnt-touch");
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 + dx;
    const y = r.top + r.height / 2 + dy;
    layer.dispatchEvent(
      new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 }),
    );
  };
});
const finger = (type, id, sel, dx = 0, dy = 0) =>
  page.evaluate(([t, i, s, a, b]) => globalThis.__finger(t, i, s, a, b), [type, id, sel, dx, dy]);

// Start the run with the jump button, which doubles as confirm on menus.
await finger("pointerdown", 1, '[data-key="jump"]');
await finger("pointerup", 1, '[data-key="jump"]');
await page.waitForTimeout(500);
const state = () =>
  page.evaluate(() => {
    const { scene, world } = globalThis.penitence.debug;
    return { scene, x: Math.round(world.player.x), y: Math.round(world.player.y), st: world.player.state };
  });
check("a touch starts the run", (await state()).scene === "playing", (await state()).scene);

console.log("\nmulti-touch");
const before = await state();
// One finger holds right on the pad while another attacks: the exact
// combination that a naive per-element listener gets wrong.
await finger("pointerdown", 1, ".pnt-pad", 60, 0);
await page.waitForTimeout(500);
await finger("pointerdown", 2, '[data-key="attack"]');
await page.waitForTimeout(120);
const during = await state();
check("holding the pad moves the pilgrim", during.x > before.x + 20, `${before.x} -> ${during.x}`);
check("attacking while moving works", during.st === "attack", `state ${during.st}`);

// Slide the second finger from attack onto parry without lifting.
await finger("pointermove", 2, '[data-key="parry"]');
await page.waitForTimeout(60);
const held = await page.evaluate(() => document.querySelector('[data-key="parry"]').dataset.on);
check("sliding a thumb onto parry registers", held === "1", `data-on=${held}`);

await finger("pointerup", 2, '[data-key="parry"]');
await finger("pointerup", 1, ".pnt-pad", 60, 0);
await page.waitForTimeout(200);
const released = await page.evaluate(() => globalThis.penitence.debug.world.player.body.vx);
check("lifting both fingers stops input", Math.abs(released) < 1.4, `vx ${released.toFixed(2)}`);
await page.screenshot({ path: join(shotDir, "m2-playing.png") });

console.log("\nrobustness");
// A cancelled pointer (a system gesture, a call) must not leave a key stuck on.
await finger("pointerdown", 3, ".pnt-pad", 60, 0);
await page.waitForTimeout(120);
await finger("pointercancel", 3, ".pnt-pad", 60, 0);
await page.waitForTimeout(400);
const stuck = await page.evaluate(() => globalThis.penitence.debug.world.player.body.vx);
check("a cancelled touch does not stick", Math.abs(stuck) < 0.6, `vx ${stuck.toFixed(2)}`);

console.log("\norientation");
await page.setViewportSize({ width: 412, height: 915 });
await page.waitForTimeout(400);
check("portrait shows the rotate prompt", await page.locator(".pnt-rotate").isVisible());
check("portrait pauses the game", (await state()).scene === "paused", (await state()).scene);
await page.screenshot({ path: join(shotDir, "m3-portrait.png") });
await page.setViewportSize({ width: 915, height: 412 });
await page.waitForTimeout(400);
check("landscape hides the prompt", !(await page.locator(".pnt-rotate").isVisible()));

console.log("\nweb app install");
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return null;
  const res = await fetch(link.href);
  return res.json();
});
check("the manifest is valid and landscape", manifest?.orientation === "landscape" && manifest.icons.length >= 3);
check("a maskable icon is declared", manifest?.icons.some((i) => i.purpose === "maskable") === true);

check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
server.close();
console.log(`\n${failures.length === 0 ? "ALL MOBILE CHECKS PASSED" : `${failures.length} FAILED: ${failures.join(", ")}`}`);
process.exit(failures.length === 0 ? 0 : 1);
