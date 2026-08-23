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
    // Size to the host element's content box when it has one, so the game can
    // be embedded in a page with chrome around it; fall back to the viewport.
    const availW = parent.clientWidth || window.innerWidth;
    const availH = parent.clientHeight || window.innerHeight;

    const fit = Math.min(availW / VIEW_W, availH / VIEW_H);
    // Snap *down* to a whole-number scale when we are barely above one, so an
    // exact multiple stays perfectly square. Never snap up: that would overflow
    // the host box. Otherwise fill the box -- flooring to an integer would
    // strand the game at 1x inside a nearly-2x frame.
    const floor = Math.floor(fit);
    const scale = floor >= 1 && fit - floor < 0.02 ? floor : fit;
    const w = `${Math.round(VIEW_W * scale)}px`;
    const h = `${Math.round(VIEW_H * scale)}px`;
    // Guard against a resize loop if the host sizes itself from its children.
    if (canvas.style.width === w && canvas.style.height === h) return;
    canvas.style.width = w;
    canvas.style.height = h;
  };
  resize();
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(parent);

  canvas.focus();
  canvas.addEventListener("pointerdown", () => canvas.focus());

  return { canvas, ctx };
}

export function clear(ctx: CanvasRenderingContext2D, color: string = PAL.void): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
