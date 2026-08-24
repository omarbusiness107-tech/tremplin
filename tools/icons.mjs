/**
 * Renders the app icons with Chromium rather than shipping binaries: the mark
 * is the pilgrim's capirote, drawn from the same palette as the game.
 * `maskable` variants keep the silhouette inside Android's safe circle.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const draw = (size, maskable) => `
  const c = document.createElement("canvas");
  c.width = c.height = ${size};
  const x = c.getContext("2d");
  const S = ${size};
  const pad = ${maskable ? 0.22 : 0.10};

  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, "#1a1020");
  g.addColorStop(1, "#07050a");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);

  // Candle glow behind the figure.
  const glow = x.createRadialGradient(S/2, S*0.55, 0, S/2, S*0.55, S*0.52);
  glow.addColorStop(0, "rgba(217,164,65,0.30)");
  glow.addColorStop(1, "rgba(217,164,65,0)");
  x.fillStyle = glow;
  x.fillRect(0, 0, S, S);

  // A 32-unit grid; the figure is drawn about 20 tall so it has air around it.
  const u = S * (1 - pad * 2) / 32;
  const ox = S / 2;
  const oy = S / 2;
  const r = (px, py, w, h, fill) => {
    x.fillStyle = fill;
    x.fillRect(Math.round(ox + px * u), Math.round(oy + py * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(h * u)));
  };

  // Robe: wide and squat, so the hood reads as a hood and not a spire.
  r(-7, -1, 14, 12, "#3a1620");
  r(-6, 0, 12, 10, "#6b2d3b");
  r(4, 0, 2, 10, "#8f4050");
  r(-7, 10, 14, 1, "#07050a");

  // Shoulders.
  r(-8, -3, 16, 3, "#3a1620");
  r(-7, -2, 14, 1, "#6b2d3b");

  // Gold sash.
  r(-7, 3, 14, 1, "#d9a441");

  // Capirote: a stepped cone from the shoulders to the point.
  const cone = [
    [-4, -7, 8, 4],
    [-3.5, -10, 7, 3],
    [-2.5, -13, 5, 3],
    [-1.5, -15, 3, 2],
    [-0.5, -16, 1, 1],
  ];
  for (const [cx, cy, cw, ch] of cone) r(cx, cy, cw, ch, "#3a1620");
  const inner = [
    [-3, -7, 6, 4],
    [-2.5, -10, 5, 3],
    [-1.5, -13, 3, 3],
    [-0.5, -15, 1, 2],
  ];
  for (const [cx, cy, cw, ch] of inner) r(cx, cy, cw, ch, "#6b2d3b");
  // Rim light down the leading edge.
  r(1.5, -10, 1, 3, "#8f4050");
  r(2, -7, 1, 4, "#8f4050");

  // Face slit, with a single lit eye.
  r(-3, -6, 6, 2, "#07050a");
  r(0.5, -5.5, 1.5, 1, "#f0d18a");

  return c.toDataURL("image/png");
`;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage();
await page.goto("about:blank");

const targets = [
  [192, false, "icon-192.png"],
  [512, false, "icon-512.png"],
  [512, true, "icon-maskable-512.png"],
  [1024, false, "icon-1024.png"],
];

for (const [size, maskable, name] of targets) {
  const dataUrl = await page.evaluate(new Function(draw(size, maskable)));
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(outDir, name), buf);
  console.log(`  ${name.padEnd(24)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}

await browser.close();
if (!existsSync(join(outDir, "icon-512.png"))) process.exit(1);
