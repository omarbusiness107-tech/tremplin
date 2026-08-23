/**
 * Build the artifact page: the designed shell in artifact/page.html with the
 * compiled game inlined. Emits a fragment (no doctype/html/head/body) because
 * the Artifact host supplies that wrapper.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gamePath = join(root, "dist", "game.js");
const shellPath = join(root, "artifact", "page.html");

if (!existsSync(gamePath)) {
  console.error("dist/game.js not found -- run `npm run build` first.");
  process.exit(1);
}

const shell = readFileSync(shellPath, "utf8");
const game = readFileSync(gamePath, "utf8");

if (!shell.includes("<!--GAME_SCRIPT-->")) {
  console.error("artifact/page.html is missing the <!--GAME_SCRIPT--> placeholder.");
  process.exit(1);
}

const html = shell.replace("<!--GAME_SCRIPT-->", `<script type="module">\n${game}\n</script>`);
const out = join(root, "dist", "artifact.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} kB)`);
