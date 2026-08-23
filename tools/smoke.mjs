/**
 * Headless play-through check: boots the built game, drives it with real key
 * events, and asserts the things a broken build would get wrong.
 * Run with `npm run smoke` after `npm run bundle`.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page_url = `file://${join(root, "dist", "penitence.html")}`;
const shotDir = join(root, "dist", "shots");

const bundlePath = join(root, "dist", "penitence.html");
if (!existsSync(bundlePath)) {
  console.error("dist/penitence.html missing -- run `npm run bundle` first.");
  process.exit(1);
}
// Testing a stale bundle silently reports on code that is no longer there.
const newestSource = Math.max(
  ...["src", "index.html"].flatMap((entry) => {
    const walk = (p) =>
      statSync(p).isDirectory() ? readdirSync(p).flatMap((c) => walk(join(p, c))) : [statSync(p).mtimeMs];
    return walk(join(root, entry));
  }),
);
if (newestSource > statSync(bundlePath).mtimeMs) {
  console.error("dist/penitence.html is older than src -- run `npm run smoke` (which rebuilds first).");
  process.exit(1);
}
mkdirSync(shotDir, { recursive: true });

const failures = [];
function check(name, condition, detail = "") {
  if (condition) console.log(`  pass  ${name}`);
  else {
    console.log(`  FAIL  ${name} ${detail}`);
    failures.push(name);
  }
}

// The image ships a pinned Chromium; point at it rather than downloading one.
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// Headless Chromium withholds audio until a gesture; the flag makes the audio
// assertions below deterministic rather than dependent on gesture plumbing.
const launchArgs = { args: ["--autoplay-policy=no-user-gesture-required"] };
const browser = await chromium.launch(
  existsSync(CHROME) ? { executablePath: CHROME, ...launchArgs } : launchArgs,
);
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

await page.goto(page_url);
await page.waitForFunction(() => Boolean(globalThis.penitence), null, { timeout: 10000 });
await page.locator("canvas").click();

const state = () =>
  page.evaluate(() => {
    const { scene, world } = globalThis.penitence.debug;
    return {
      scene,
      room: world.room.id,
      x: world.player.x,
      y: world.player.y,
      health: world.player.health,
      maxHealth: world.player.maxHealth,
      enemies: world.room.enemies.length,
      doubleJump: world.player.abilities.doubleJump,
      deaths: world.progression.data.deaths,
      guilt: world.progression.guilt ? world.progression.guilt.room : null,
    };
  });

const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};

console.log("\nboot");
await page.screenshot({ path: join(shotDir, "1-title.png") });
check("title scene is active", (await state()).scene === "title");

await page.keyboard.press("Enter");
await page.waitForTimeout(400);
let s = await state();
check("enter starts the run", s.scene === "playing", `got ${s.scene}`);
check("starts in the cell", s.room === "cell", `got ${s.room}`);
check("spawns with full health", s.health === s.maxHealth);
await page.screenshot({ path: join(shotDir, "2-cell.png") });

console.log("\nmovement");
const beforeX = (await state()).x;
await hold("ArrowRight", 700);
await page.waitForTimeout(100);
const afterX = (await state()).x;
check("running moves the pilgrim right", afterX > beforeX + 40, `${beforeX} -> ${afterX}`);

const groundY = (await state()).y;
await page.keyboard.press("Space");
await page.waitForTimeout(180);
const airY = (await state()).y;
check("jump leaves the ground", airY < groundY - 10, `${groundY} -> ${airY}`);
await page.waitForTimeout(700);
check("gravity returns the pilgrim to the floor", Math.abs((await state()).y - groundY) < 4);

console.log("\ncombat");
await page.keyboard.press("KeyJ");
await page.waitForTimeout(120);
await page.keyboard.press("KeyJ");
await page.waitForTimeout(120);
await page.keyboard.press("KeyL");
await page.waitForTimeout(120);
await page.keyboard.press("ShiftLeft");
await page.waitForTimeout(400);
check("no errors after attack / parry / roll", consoleErrors.length === 0, consoleErrors.join(" | "));

// Walk into range, then swing. A blind hold would just run past the enemy.
const foe = () =>
  page.evaluate(() => {
    const { world } = globalThis.penitence.debug;
    const target = world.room.enemies.find((e) => !e.dead);
    return target ? { gap: target.centerX - world.player.centerX, health: target.health } : null;
  });

let killed = false;
let lowestHealth = Infinity;
for (let i = 0; i < 90; i++) {
  const target = await foe();
  if (!target) {
    killed = true;
    break;
  }
  lowestHealth = Math.min(lowestHealth, target.health);
  if (Math.abs(target.gap) > 22) await hold(target.gap > 0 ? "ArrowRight" : "ArrowLeft", 140);
  else {
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(150);
  }
}
await page.screenshot({ path: join(shotDir, "3-combat.png") });
check("the shambler can be killed", killed, `lowest health seen: ${lowestHealth}`);
check("the pilgrim survives the exchange", (await state()).health > 0);

console.log("\nroom transition");
await hold("ArrowRight", 3000);
await page.waitForTimeout(600);
s = await state();
check("east door leads to the cloister", s.room === "cloister", `got ${s.room}`);
await page.screenshot({ path: join(shotDir, "4-cloister.png") });

console.log("\nmap screen");
await page.keyboard.press("Tab");
await page.waitForTimeout(250);
check("tab opens the map", (await state()).scene === "map");
await page.screenshot({ path: join(shotDir, "5-map.png") });
await page.keyboard.press("Tab");
await page.waitForTimeout(200);
check("tab closes the map", (await state()).scene === "playing");

console.log("\ndeath and guilt");
// Invulnerability from the fight above would swallow the blow, so wait it out.
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => globalThis.penitence.debug.world.player.takeEnvironmentDamage(999));
  await page.waitForTimeout(400);
  if ((await state()).scene === "dead") break;
}
await page.waitForTimeout(2200);
s = await state();
check("death switches to the fallen screen", s.scene === "dead", `got ${s.scene}`);
check("guilt is left where you fell", s.guilt === "cloister", `got ${s.guilt}`);
check("the death is recorded", s.deaths >= 1);
await page.screenshot({ path: join(shotDir, "6-death.png") });

await page.keyboard.press("Enter");
await page.waitForTimeout(600);
s = await state();
check("rising returns you to the altar room", s.scene === "playing" && s.room === "cell", `${s.scene}/${s.room}`);
check("respawn restores health", s.health === s.maxHealth);


console.log("\naudio");
// Measure the master bus: "no errors thrown" is not evidence that a synthesised
// soundtrack actually makes a sound.
const measureOutput = async (ms) =>
  page.evaluate(async (duration) => {
    const { audio } = globalThis.penitence.debug;
    const analyser = (globalThis.__analyser ??= audio.attachAnalyser());
    if (!analyser) return null;
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    const started = performance.now();
    while (performance.now() - started < duration) {
      analyser.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      await new Promise((r) => setTimeout(r, 16));
    }
    return peak;
  }, ms);

const audioState = await page.evaluate(() => {
  const { audio } = globalThis.penitence.debug;
  return { state: audio.context()?.state ?? "none", muted: audio.muted };
});
check("the audio context is running", audioState.state === "running", `state ${audioState.state}`);

// Wait for the crossfade to finish, not merely for the state to change --
// measuring mid-fade reads as silence.
await page
  .waitForFunction(
    () => {
      const { music } = globalThis.penitence.debug;
      return music.current !== "silence" && music.intensity > 0.85;
    },
    null,
    { timeout: 12000 },
  )
  .catch(() => undefined);
const musicState = await page.evaluate(() => globalThis.penitence.debug.music.current);
check("the score starts playing", musicState !== "silence", `music is "${musicState}"`);

await page.waitForTimeout(1200);
const playingPeak = await measureOutput(2600);
check("the game produces sound", playingPeak !== null && playingPeak > 0.02, `peak ${playingPeak?.toFixed(4)}`);

// Every sound in the library must be playable without throwing.
const sfxErrors = await page.evaluate(() => {
  const { playSfx, sfxNames } = globalThis.penitence.debug;
  const failed = [];
  for (const name of sfxNames) {
    try {
      playSfx(name, { throttle: 0 });
    } catch (e) {
      failed.push(`${name}: ${e}`);
    }
  }
  return failed;
});
check("every sound in the library plays", sfxErrors.length === 0, sfxErrors.slice(0, 2).join(" | "));

await page.evaluate(() => globalThis.penitence.debug.audio.setMuted(true));
await page.waitForTimeout(400);
const mutedPeak = await measureOutput(1200);
check("muting silences the output", mutedPeak !== null && mutedPeak < 0.005, `peak ${mutedPeak?.toFixed(4)}`);
await page.evaluate(() => globalThis.penitence.debug.audio.setMuted(false));

console.log("\nprogression gate");
// The route to the reliquary must be impossible without the double jump and
// comfortably possible with it. This is the one gate the whole map hangs on.
const attemptClimb = async (withDoubleJump) => {
  await page.evaluate((enabled) => {
    const { world } = globalThis.penitence.debug;
    world.progression.data.checkpoint = { room: "gallery", altar: 0 };
    world.respawn();
    world.room.enemies.length = 0;
    world.progression.data.abilities.doubleJump = enabled;
    world.player.abilities.doubleJump = enabled;
    // Stand on the last platform below the gate.
    world.player.placeAt(40 * 16, 128 - world.player.body.h, 1);
  }, withDoubleJump);
  await page.waitForTimeout(150);
  await page.keyboard.press("Space");
  await page.waitForTimeout(160);
  await page.keyboard.press("Space");
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const { world } = globalThis.penitence.debug;
    return { feet: world.player.y + world.player.body.h, room: world.room.id };
  });
};

const without = await attemptClimb(false);
check("the gate is closed without the second breath", without.feet > 100, `feet at ${Math.round(without.feet)}`);
const withIt = await attemptClimb(true);
check("the gate opens with the second breath", withIt.feet <= 66, `feet at ${Math.round(withIt.feet)}`);
await page.screenshot({ path: join(shotDir, "7-gate.png") });

console.log("\nboss arena");
await page.evaluate(() => {
  const { world } = globalThis.penitence.debug;
  world.progression.data.abilities.doubleJump = true;
  world.progression.data.abilities.sealBreaker = true;
  world.player.abilities.doubleJump = true;
  world.player.abilities.sealBreaker = true;
  world.progression.data.checkpoint = { room: "sanctum", altar: 0 };
  world.respawn();
});
await page.waitForTimeout(500);
await hold("ArrowRight", 2500);
await page.waitForTimeout(400);
s = await state();
check("the boss arena loads", s.room === "sanctum", `got ${s.room}`);
const bossAlive = await page.evaluate(() => Boolean(globalThis.penitence.debug.world.boss));
check("the boss is present", bossAlive);
await page.screenshot({ path: join(shotDir, "8-boss.png") });

await page.waitForTimeout(2500);
await page.screenshot({ path: join(shotDir, "9-boss-fight.png") });

check("no console errors across the whole session", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();

console.log(`\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILED: ${failures.join(", ")}`}`);
process.exit(failures.length === 0 ? 0 : 1);
