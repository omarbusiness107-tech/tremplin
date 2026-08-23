/**
 * Collapse the Vite build into one self-contained HTML file, so the game can
 * be opened from disk or hosted anywhere without a server.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const htmlPath = join(dist, "index.html");

if (!existsSync(htmlPath)) {
  console.error("dist/index.html not found -- run `npm run build` first.");
  process.exit(1);
}

let html = readFileSync(htmlPath, "utf8");

html = html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (match, src) => {
  const assetPath = join(dist, src.replace(/^\.?\//, ""));
  if (!existsSync(assetPath)) return match;
  return `<script type="module">\n${readFileSync(assetPath, "utf8")}\n</script>`;
});

html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (match, href) => {
  const assetPath = join(dist, href.replace(/^\.?\//, ""));
  if (!existsSync(assetPath)) return match;
  return `<style>\n${readFileSync(assetPath, "utf8")}\n</style>`;
});

const out = join(dist, "penitence.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} kB)`);
