export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `v` toward `target` by at most `step`. */
export function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

export function sign(v: number): number {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectCenterX(r: Rect): number {
  return r.x + r.w * 0.5;
}

export function rectCenterY(r: Rect): number {
  return r.y + r.h * 0.5;
}

/**
 * Mirror a rect that was authored facing right so it faces left, pivoting
 * around `originX`. Used so attack hitboxes only need defining once.
 */
export function flipRectAround(r: Rect, originX: number): Rect {
  return { x: originX * 2 - (r.x + r.w), y: r.y, w: r.w, h: r.h };
}
