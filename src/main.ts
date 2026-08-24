import { Game } from "./game/game";

const stage = document.getElementById("stage");
if (!stage) throw new Error("#stage not found");

const game = new Game(stage);
game.start();

// Handy in the browser console, and used by the headless smoke tests.
(globalThis as unknown as { penitence?: Game }).penitence = game;

/**
 * Register the offline shell so the installed web app launches with no signal.
 * Skipped on file:// and inside the packaged app, where assets are already
 * local and a worker would only add a failure mode.
 */
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !location.host.startsWith("localhost:0")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Unsupported, blocked by settings, or served without HTTPS.
    });
  });
}
