import { PAL } from "../content/palette";

/** Internal render resolution. Everything is authored in these pixels. */
export const VIEW_W = 480;
export const VIEW_H = 270;

export interface Screen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function createScreen(parent: HTMLElement): Screen {
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.tabIndex = 0;
  parent.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.imageSmoothingEnabled = false;

  const resize = (): void => {
    // Integer scale keeps pixels square; fall back to fractional on tiny
    // viewports so the game is never cropped.
    const sx = window.innerWidth / VIEW_W;
    const sy = window.innerHeight / VIEW_H;
    const fit = Math.min(sx, sy);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    canvas.style.width = `${Math.round(VIEW_W * scale)}px`;
    canvas.style.height = `${Math.round(VIEW_H * scale)}px`;
  };
  resize();
  window.addEventListener("resize", resize);

  canvas.focus();
  canvas.addEventListener("pointerdown", () => canvas.focus());

  return { canvas, ctx };
}

export function clear(ctx: CanvasRenderingContext2D, color: string = PAL.void): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
