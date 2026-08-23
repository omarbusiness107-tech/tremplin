import { drawText, drawTextShadow } from "../../engine/font";
import { VIEW_H, VIEW_W } from "../../engine/canvas";
import { PAL } from "../../content/palette";
import type { Progression } from "../progression";

const CONTROLS: readonly (readonly [string, string])[] = [
  ["move", "a / d  or  arrows"],
  ["jump", "space   (again in air once earned)"],
  ["attack", "j      hold down + j midair to plunge"],
  ["heavy", "k      breaks guards"],
  ["parry", "l      time it against a red flash"],
  ["roll", "shift  invulnerable through the middle"],
  ["flask", "q      heal, only on the ground"],
  ["pray", "w / up at an altar"],
  ["map", "tab            pause: esc"],
];

function dim(ctx: CanvasRenderingContext2D, alpha = 0.86): void {
  ctx.fillStyle = `rgba(7,5,10,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function drawTitle(ctx: CanvasRenderingContext2D, hasSave: boolean, time: number): void {
  dim(ctx, 0.9);

  drawTextShadow(ctx, "penitence", VIEW_W / 2, 40, PAL.blood, 4, "center");
  drawText(ctx, "a pilgrimage of thorns", VIEW_W / 2, 78, PAL.uiDim, 1, "center");

  ctx.fillStyle = PAL.gold;
  ctx.fillRect(VIEW_W / 2 - 70, 92, 140, 1);

  const pulse = Math.sin(time * 0.07) > -0.3;
  const prompt = hasSave ? "press enter to continue your penance" : "press enter to begin";
  if (pulse) drawTextShadow(ctx, prompt, VIEW_W / 2, 106, PAL.goldPale, 1, "center");
  if (hasSave) drawText(ctx, "hold r on this screen to start anew", VIEW_W / 2, 120, PAL.uiDim, 1, "center");

  drawControls(ctx, 142);
}

export function drawControls(ctx: CanvasRenderingContext2D, top: number): void {
  let y = top;
  for (const [name, keys] of CONTROLS) {
    drawText(ctx, name, VIEW_W / 2 - 60, y, PAL.ui, 1, "right");
    drawText(ctx, keys, VIEW_W / 2 - 52, y, PAL.uiDim, 1, "left");
    y += 10;
  }
}

export function drawPause(ctx: CanvasRenderingContext2D): void {
  dim(ctx, 0.88);
  drawTextShadow(ctx, "paused", VIEW_W / 2, 26, PAL.ui, 2, "center");
  drawControls(ctx, 62);
  drawText(ctx, "esc to resume", VIEW_W / 2, VIEW_H - 18, PAL.uiDim, 1, "center");
}

export function drawDeath(
  ctx: CanvasRenderingContext2D,
  progression: Progression,
  ready: boolean,
  time: number,
): void {
  ctx.fillStyle = `rgba(40,4,10,${ready ? 0.78 : 0.5})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawTextShadow(ctx, "you have fallen", VIEW_W / 2, 92, PAL.bloodBright, 2, "center");

  const guilt = progression.guilt;
  if (guilt) {
    drawText(ctx, `your guilt remains in the ${roomLabel(guilt.room)}`, VIEW_W / 2, 118, PAL.guiltPale, 1, "center");
    if (guilt.tears > 0) {
      drawText(ctx, `${guilt.tears} tears lie with it`, VIEW_W / 2, 130, PAL.uiDim, 1, "center");
    }
    drawText(ctx, "fervour is bound until you reclaim it", VIEW_W / 2, 142, PAL.uiDim, 1, "center");
  }

  if (ready && Math.sin(time * 0.07) > -0.3) {
    drawTextShadow(ctx, "press enter to rise", VIEW_W / 2, 172, PAL.goldPale, 1, "center");
  }
}

export function drawVictory(ctx: CanvasRenderingContext2D, progression: Progression, time: number): void {
  dim(ctx, 0.9);
  drawTextShadow(ctx, "the wound is closed", VIEW_W / 2, 78, PAL.goldPale, 2, "center");
  drawText(ctx, "the abbot kneels, and is still", VIEW_W / 2, 104, PAL.ui, 1, "center");

  const d = progression.data;
  drawText(ctx, `deaths ${d.deaths}`, VIEW_W / 2, 128, PAL.uiDim, 1, "center");
  drawText(ctx, `tears gathered ${d.tears}`, VIEW_W / 2, 140, PAL.uiDim, 1, "center");

  if (Math.sin(time * 0.06) > -0.3) {
    drawText(ctx, "esc to return to the title", VIEW_W / 2, 176, PAL.goldPale, 1, "center");
  }
}

function roomLabel(id: string): string {
  return id.replace(/[-_]/g, " ");
}
