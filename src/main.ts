import { Game } from "./game/game";

const stage = document.getElementById("stage");
if (!stage) throw new Error("#stage not found");

const game = new Game(stage);
game.start();

// Handy in the browser console, and used by the headless smoke test.
(globalThis as unknown as { penitence?: Game }).penitence = game;
