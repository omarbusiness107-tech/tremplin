import { rect, sign } from "../core/math";
import { Tilemap } from "./tilemap";

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** Sub-pixel movement carried between frames so slow speeds still move. */
  remX: number;
  remY: number;
  /** When true the body falls through one-way platforms. */
  dropThrough: boolean;
  /** Set by the last move; useful for wall-slides and turn-around AI. */
  hitWall: boolean;
  hitCeiling: boolean;
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return {
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    grounded: false,
    remX: 0,
    remY: 0,
    dropThrough: false,
    hitWall: false,
    hitCeiling: false,
  };
}

export function bodyRect(b: Body): { x: number; y: number; w: number; h: number } {
  return rect(b.x, b.y, b.w, b.h);
}

/** Move on X in 1px steps, stopping at solid terrain. */
function moveX(b: Body, amount: number, map: Tilemap): void {
  b.remX += amount;
  let step = Math.round(b.remX);
  if (step === 0) return;
  b.remX -= step;
  const dir = sign(step);
  step = Math.abs(step);
  while (step > 0) {
    const probe = rect(b.x + dir, b.y, b.w, b.h);
    if (map.overlapsSolid(probe)) {
      b.hitWall = true;
      b.vx = 0;
      b.remX = 0;
      return;
    }
    b.x += dir;
    step--;
  }
}

/** Move on Y in 1px steps, honouring one-way platforms when falling. */
function moveY(b: Body, amount: number, map: Tilemap): void {
  b.remY += amount;
  let step = Math.round(b.remY);
  if (step === 0) return;
  b.remY -= step;
  const dir = sign(step);
  step = Math.abs(step);
  while (step > 0) {
    const prevBottom = b.y + b.h;
    const probe = rect(b.x, b.y + dir, b.w, b.h);
    if (map.overlapsSolid(probe)) {
      if (dir > 0) b.grounded = true;
      else b.hitCeiling = true;
      b.vy = 0;
      b.remY = 0;
      return;
    }
    if (dir > 0 && !b.dropThrough && map.platformBelow(probe, prevBottom)) {
      b.grounded = true;
      b.vy = 0;
      b.remY = 0;
      return;
    }
    b.y += dir;
    step--;
  }
}

/**
 * Integrate one fixed step. X moves first so that running into a wall while
 * falling still resolves the landing cleanly.
 */
export function moveBody(b: Body, map: Tilemap): void {
  b.hitWall = false;
  b.hitCeiling = false;
  b.grounded = false;
  moveX(b, b.vx, map);
  moveY(b, b.vy, map);
  if (!b.grounded) {
    // A 1px probe keeps `grounded` true while standing still.
    const probe = rect(b.x, b.y + 1, b.w, b.h);
    if (map.overlapsSolid(probe) || map.platformBelow(probe, b.y + b.h)) b.grounded = true;
  }
}

/** True when there is floor immediately ahead -- used so walkers do not step off ledges. */
export function floorAhead(b: Body, dir: number, map: Tilemap): boolean {
  const probeX = dir > 0 ? b.x + b.w + 1 : b.x - 2;
  const probe = rect(probeX, b.y + b.h, 2, 4);
  return map.overlapsSolid(probe) || map.platformBelow(probe, b.y + b.h);
}

/** True when solid terrain blocks the path ahead at body height. */
export function wallAhead(b: Body, dir: number, map: Tilemap): boolean {
  const probeX = dir > 0 ? b.x + b.w : b.x - 2;
  return map.overlapsSolid(rect(probeX, b.y + 2, 2, b.h - 4));
}
