/** Small drawing helpers shared by the world and its actors. */

/**
 * Soft radial glow. Used instead of a flat translucent rect, which reads as an
 * obvious box against the dark backgrounds.
 */
export function radialGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0 || radius <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

/** 1px outline drawn as four rects, so it stays crisp at pixel scale. */
export function outlineRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha = 1,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.globalAlpha = 1;
}

/**
 * Dark halo behind an actor. The palette is deliberately low-contrast, so
 * characters need this to separate from the backdrop.
 */
export function silhouette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color = "rgba(6,4,8,0.55)",
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
}
