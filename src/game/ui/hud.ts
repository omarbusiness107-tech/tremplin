import { drawText, drawTextShadow } from "../../engine/font";
import { VIEW_H, VIEW_W } from "../../engine/canvas";
import { PAL } from "../../content/palette";
import type { Boss } from "../enemies/boss";
import type { Player } from "../player";
import { FERVOUR } from "../playerStats";

const PIP_W = 7;
const PIP_H = 8;
const ORIGIN_X = 8;
const ORIGIN_Y = 8;

/** In-world heads-up display: vigour, fervour, flasks, tears and guilt. */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  player: Player,
  options: { tears: number; hasGuilt: boolean; boss: Boss | null; bossName: string },
): void {
  drawHealth(ctx, player);
  drawFervour(ctx, player);
  drawFlasks(ctx, player);
  drawTears(ctx, options.tears);
  if (options.hasGuilt) drawGuiltMark(ctx);
  if (options.boss && !options.boss.defeated) drawBossBar(ctx, options.boss, options.bossName);
}

function drawHealth(ctx: CanvasRenderingContext2D, player: Player): void {
  for (let i = 0; i < player.maxHealth; i++) {
    const x = ORIGIN_X + i * (PIP_W + 1);
    const filled = i < player.health;
    ctx.fillStyle = PAL.void;
    ctx.fillRect(x - 1, ORIGIN_Y - 1, PIP_W + 2, PIP_H + 2);
    ctx.fillStyle = filled ? PAL.blood : PAL.stoneDark;
    ctx.fillRect(x, ORIGIN_Y, PIP_W, PIP_H);
    if (filled) {
      ctx.fillStyle = PAL.bloodBright;
      ctx.fillRect(x + 1, ORIGIN_Y + 1, PIP_W - 3, 2);
    }
  }
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(ORIGIN_X - 2, ORIGIN_Y - 2, 1, PIP_H + 4);
  ctx.fillRect(ORIGIN_X - 2, ORIGIN_Y - 2, player.maxHealth * (PIP_W + 1) + 2, 1);
}

function drawFervour(ctx: CanvasRenderingContext2D, player: Player): void {
  const y = ORIGIN_Y + PIP_H + 4;
  const fullW = 84;
  const capW = Math.round(fullW * (player.fervourCap / FERVOUR.max));
  const fillW = Math.round(capW * (player.fervour / Math.max(1, player.fervourCap)));

  ctx.fillStyle = PAL.void;
  ctx.fillRect(ORIGIN_X - 1, y - 1, fullW + 2, 6);
  // The greyed tail shows how much of the pool guilt has locked away.
  ctx.fillStyle = PAL.stoneDark;
  ctx.fillRect(ORIGIN_X, y, fullW, 4);
  ctx.fillStyle = PAL.guilt;
  ctx.fillRect(ORIGIN_X + capW, y, fullW - capW, 4);
  ctx.fillStyle = PAL.fervour;
  ctx.fillRect(ORIGIN_X, y, fillW, 4);
  ctx.fillStyle = PAL.fervourPale;
  ctx.fillRect(ORIGIN_X, y, fillW, 1);
}

function drawFlasks(ctx: CanvasRenderingContext2D, player: Player): void {
  const y = ORIGIN_Y + PIP_H + 13;
  for (let i = 0; i < player.maxFlasks; i++) {
    const x = ORIGIN_X + i * 9;
    const full = i < player.flasks;
    ctx.fillStyle = PAL.stoneLit;
    ctx.fillRect(x + 2, y, 3, 2);
    ctx.fillStyle = full ? PAL.blood : PAL.stoneDark;
    ctx.fillRect(x, y + 2, 7, 8);
    if (full) {
      ctx.fillStyle = PAL.bloodBright;
      ctx.fillRect(x + 1, y + 4, 2, 4);
    }
  }
}

function drawTears(ctx: CanvasRenderingContext2D, tears: number): void {
  const x = VIEW_W - 8;
  drawTextShadow(ctx, `${tears}`, x, ORIGIN_Y + 1, PAL.ui, 1, "right");
  ctx.fillStyle = PAL.fervourPale;
  const iconX = x - (`${tears}`.length * 6 + 8);
  ctx.fillRect(iconX, ORIGIN_Y + 2, 3, 4);
  ctx.fillRect(iconX + 1, ORIGIN_Y, 1, 2);
}

function drawGuiltMark(ctx: CanvasRenderingContext2D): void {
  const x = VIEW_W - 8;
  const y = ORIGIN_Y + 12;
  drawTextShadow(ctx, "guilt", x, y, PAL.guiltPale, 1, "right");
}

function drawBossBar(ctx: CanvasRenderingContext2D, boss: Boss, name: string): void {
  const w = 240;
  const x = Math.round((VIEW_W - w) / 2);
  const y = VIEW_H - 22;

  drawText(ctx, name, VIEW_W / 2, y - 11, PAL.boneDim, 1, "center");

  ctx.fillStyle = PAL.void;
  ctx.fillRect(x - 2, y - 2, w + 4, 10);
  ctx.fillStyle = PAL.stoneDark;
  ctx.fillRect(x, y, w, 6);
  ctx.fillStyle = boss.phase === 2 ? PAL.bloodBright : PAL.blood;
  ctx.fillRect(x, y, Math.round(w * boss.healthFraction), 6);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + 5, w, 1);

  // Phase-two marker sits at the halfway point.
  ctx.fillStyle = PAL.goldPale;
  ctx.fillRect(x + w / 2, y - 2, 1, 10);
}
