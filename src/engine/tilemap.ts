import type { Rect } from "../core/math";
import { PAL } from "../content/palette";

export const TILE = 16;

export const enum Tile {
  Empty = 0,
  Solid = 1,
  Platform = 2,
  Spike = 3,
  /** Ability-gated gate; solid until the matching flag is set. */
  Gate = 4,
}

/** Characters that describe terrain in a room's ASCII map. */
export const TERRAIN_CHARS: Record<string, Tile> = {
  ".": Tile.Empty,
  " ": Tile.Empty,
  "#": Tile.Solid,
  "=": Tile.Platform,
  "^": Tile.Spike,
  "|": Tile.Gate,
};

/** Deterministic per-tile noise so stone looks textured without assets. */
function tileHash(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Tilemap {
  readonly cols: number;
  readonly rows: number;
  readonly widthPx: number;
  readonly heightPx: number;
  private readonly tiles: Uint8Array;
  /** Gates dissolve once their ability is owned; tracked separately from tiles. */
  private openGates = false;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.widthPx = cols * TILE;
    this.heightPx = rows * TILE;
    this.tiles = new Uint8Array(cols * rows);
  }

  set(tx: number, ty: number, tile: Tile): void {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return;
    this.tiles[ty * this.cols + tx] = tile;
  }

  at(tx: number, ty: number): Tile {
    // Out of bounds is solid at the sides/bottom so actors cannot leave the
    // room except through doors, but open at the top for tall jumps.
    if (tx < 0 || tx >= this.cols || ty >= this.rows) return Tile.Solid;
    if (ty < 0) return Tile.Empty;
    return this.tiles[ty * this.cols + tx] as Tile;
  }

  setGatesOpen(open: boolean): void {
    this.openGates = open;
  }

  isSolidTile(tile: Tile): boolean {
    if (tile === Tile.Solid) return true;
    if (tile === Tile.Gate) return !this.openGates;
    return false;
  }

  isSolidAt(tx: number, ty: number): boolean {
    return this.isSolidTile(this.at(tx, ty));
  }

  /** Solid terrain overlap test for an axis-aligned box in world pixels. */
  overlapsSolid(r: Rect): boolean {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 1) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolidAt(tx, ty)) return true;
      }
    }
    return false;
  }

  /**
   * One-way platforms only collide when the actor is falling and its feet
   * started above the platform surface, so you can jump up through them.
   */
  platformBelow(r: Rect, prevBottom: number): boolean {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 1) / TILE);
    const bottom = r.y + r.h;
    const ty = Math.floor((bottom - 1) / TILE);
    const surface = ty * TILE;
    if (prevBottom > surface + 1) return false;
    for (let tx = x0; tx <= x1; tx++) {
      if (this.at(tx, ty) === Tile.Platform) return true;
    }
    return false;
  }

  overlapsSpike(r: Rect): boolean {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 1) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.at(tx, ty) === Tile.Spike) return true;
      }
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number): void {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const x1 = Math.min(this.cols - 1, Math.floor((camX + viewW) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const y1 = Math.min(this.rows - 1, Math.floor((camY + viewH) / TILE));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = this.at(tx, ty);
        if (tile === Tile.Empty) continue;
        const px = tx * TILE - camX;
        const py = ty * TILE - camY;
        switch (tile) {
          case Tile.Solid:
            this.drawStone(ctx, px, py, tx, ty);
            break;
          case Tile.Platform:
            this.drawPlatform(ctx, px, py, tx, ty);
            break;
          case Tile.Spike:
            this.drawSpikes(ctx, px, py);
            break;
          case Tile.Gate:
            this.drawGate(ctx, px, py, tx, ty);
            break;
        }
      }
    }
  }

  private drawStone(ctx: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number): void {
    const n = tileHash(tx, ty);
    ctx.fillStyle = n > 0.72 ? PAL.stone : PAL.stoneDark;
    ctx.fillRect(px, py, TILE, TILE);

    // Lit cap wherever the tile is exposed to the air above.
    if (!this.isSolidAt(tx, ty - 1)) {
      ctx.fillStyle = PAL.stoneLit;
      ctx.fillRect(px, py, TILE, 3);
      ctx.fillStyle = PAL.stoneEdge;
      ctx.fillRect(px, py, TILE, 1);
    }
    // Subtle side shading where the tile faces open space.
    if (!this.isSolidAt(tx - 1, ty)) {
      ctx.fillStyle = PAL.stone;
      ctx.fillRect(px, py, 1, TILE);
    }
    if (!this.isSolidAt(tx + 1, ty)) {
      ctx.fillStyle = PAL.void;
      ctx.fillRect(px + TILE - 1, py, 1, TILE);
    }
    // Sparse mortar seams. Kept to single dim pixels; anything bolder reads
    // as debris scattered over the floor.
    if (n > 0.93) {
      ctx.fillStyle = PAL.void;
      const cx = px + 3 + Math.floor(n * 9);
      ctx.fillRect(cx, py + 7, 1, 4);
    } else if (n > 0.88) {
      ctx.fillStyle = PAL.stoneDark;
      ctx.fillRect(px + 4 + Math.floor(n * 7), py + 9, 2, 1);
    }
  }

  private drawPlatform(ctx: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number): void {
    ctx.fillStyle = PAL.stone;
    ctx.fillRect(px, py, TILE, 5);
    ctx.fillStyle = PAL.stoneEdge;
    ctx.fillRect(px, py, TILE, 1);
    ctx.fillStyle = PAL.void;
    ctx.fillRect(px, py + 5, TILE, 1);
    if (tileHash(tx, ty) > 0.5) {
      ctx.fillStyle = PAL.stoneDark;
      ctx.fillRect(px + 4, py + 6, 2, 3);
      ctx.fillRect(px + 11, py + 6, 2, 2);
    }
  }

  private drawSpikes(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = PAL.stoneDark;
    ctx.fillRect(px, py + TILE - 4, TILE, 4);
    ctx.fillStyle = PAL.boneDim;
    for (let i = 0; i < 4; i++) {
      const sx = px + i * 4;
      // Each spike is a stepped triangle drawn with 1px rows.
      ctx.fillRect(sx + 1, py + 4, 2, 8);
      ctx.fillRect(sx + 1, py + 2, 1, 2);
    }
    ctx.fillStyle = PAL.bone;
    for (let i = 0; i < 4; i++) ctx.fillRect(px + i * 4 + 1, py + 2, 1, 4);
  }

  private drawGate(ctx: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number): void {
    if (this.openGates) {
      // Remnants of a dissolved seal, so the player can see what opened.
      ctx.fillStyle = PAL.guilt;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = PAL.guilt;
    const n = tileHash(tx, ty);
    ctx.fillRect(px + 2, py + 2, TILE - 4, 1);
    ctx.fillRect(px + 2, py + TILE - 3, TILE - 4, 1);
    ctx.fillStyle = PAL.guiltPale;
    ctx.fillRect(px + 6 + Math.floor(n * 3), py + 6, 3, 3);
  }
}
