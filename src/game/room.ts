import { overlaps, rect, type Rect } from "../core/math";
import { radialGlow } from "../engine/draw";
import { fx } from "../engine/fx";
import { TERRAIN_CHARS, Tile, TILE, Tilemap } from "../engine/tilemap";
import type { Mood } from "../engine/backdrop";
import { PAL } from "../content/palette";
import { MARKER_CHARS, type DoorDef, type RoomDef } from "../content/rooms";
import type { HitResolver } from "./combat";
import { Enemy, type EnemyContext } from "./enemy";
import { Boss } from "./enemies/boss";
import { Shambler } from "./enemies/shambler";
import { Thurifer } from "./enemies/thurifer";
import { Warden } from "./enemies/warden";
import type { Player } from "./player";
import { PLAYER_H } from "./playerStats";
import { Projectile } from "./projectile";
import type { Progression } from "./progression";

export type ItemKind = "doubleJump" | "sealBreaker" | "flask" | "heart" | "tears";

export interface ItemInstance {
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  taken: boolean;
}

export interface AltarInstance {
  index: number;
  x: number;
  y: number;
}

interface SpawnMarker {
  char: string;
  tx: number;
  ty: number;
}

const ITEM_KINDS: Record<string, ItemKind> = {
  D: "doubleJump",
  K: "sealBreaker",
  F: "flask",
  H: "heart",
  $: "tears",
};

/**
 * A live room: terrain plus everything standing in it. Enemies are rebuilt
 * from the original markers whenever the player prays or re-enters, which is
 * what makes altars feel like a real reset point.
 */
export class Room {
  readonly def: RoomDef;
  readonly map: Tilemap;
  readonly mood: Mood;
  readonly doors: readonly DoorDef[];
  readonly playerSpawn: { x: number; y: number };
  readonly altars: AltarInstance[] = [];

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  items: ItemInstance[] = [];
  boss: Boss | null = null;

  private readonly markers: SpawnMarker[] = [];
  private bossTriggered = false;

  constructor(def: RoomDef, private readonly progression: Progression) {
    this.def = def;
    this.mood = def.mood ?? "cloister";
    this.doors = def.doors;

    const rows = def.rows;
    const width = rows[0].length;
    for (const row of rows) {
      if (row.length !== width) {
        throw new Error(`Room "${def.id}" has ragged rows (${row.length} vs ${width})`);
      }
    }

    this.map = new Tilemap(width, rows.length);
    let spawn = { x: 2 * TILE, y: 3 * TILE - PLAYER_H };
    let altarIndex = 0;

    for (let ty = 0; ty < rows.length; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const ch = rows[ty][tx];
        if (MARKER_CHARS.has(ch)) {
          this.map.set(tx, ty, Tile.Empty);
          if (ch === "@") {
            spawn = { x: tx * TILE, y: (ty + 1) * TILE - PLAYER_H };
          } else if (ch === "A") {
            this.altars.push({ index: altarIndex++, x: tx * TILE + TILE / 2, y: (ty + 1) * TILE });
          } else {
            this.markers.push({ char: ch, tx, ty });
          }
          continue;
        }
        const tile = TERRAIN_CHARS[ch];
        if (tile === undefined) throw new Error(`Room "${def.id}" has unknown tile '${ch}' at ${tx},${ty}`);
        this.map.set(tx, ty, tile);
      }
    }

    this.playerSpawn = spawn;
    this.map.setGatesOpen(progression.data.abilities.sealBreaker);
    this.buildItems();
    this.respawnEnemies();
  }

  get id(): string {
    return this.def.id;
  }

  get name(): string {
    return this.def.name;
  }

  get isBossRoom(): boolean {
    return this.def.boss === true;
  }

  /** True while the fight is live: the arena is sealed and the music changes. */
  get bossAwake(): boolean {
    return this.bossTriggered && this.boss !== null && !this.boss.defeated;
  }

  /** Boss arenas seal shut until the fight is over. */
  get exitsSealed(): boolean {
    return this.isBossRoom && this.bossAwake;
  }

  private buildItems(): void {
    this.items = this.markers
      .filter((m) => ITEM_KINDS[m.char])
      .map((m) => ({
        id: `${this.def.id}:${m.tx},${m.ty}`,
        kind: ITEM_KINDS[m.char],
        x: m.tx * TILE + TILE / 2,
        y: m.ty * TILE + TILE / 2,
        taken: false,
      }))
      .filter((item) => !this.progression.hasCollected(item.id));
  }

  refreshGates(): void {
    this.map.setGatesOpen(this.progression.data.abilities.sealBreaker);
  }

  respawnEnemies(): void {
    this.enemies = [];
    this.projectiles = [];
    this.boss = null;
    this.bossTriggered = false;

    for (const m of this.markers) {
      const x = m.tx * TILE;
      // Markers name the tile an actor stands in; its feet go on that tile's floor.
      const feetY = (m.ty + 1) * TILE;
      switch (m.char) {
        case "s":
          this.enemies.push(new Shambler(x, feetY));
          break;
        case "t":
          this.enemies.push(new Thurifer(x, feetY));
          break;
        case "w":
          this.enemies.push(new Warden(x, feetY));
          break;
        case "B":
          if (!this.progression.data.bossDefeated) {
            // The boss is wider than a tile, so centre it on its marker.
            this.boss = new Boss(x - 6, feetY, () => this.onBossDefeated());
            this.enemies.push(this.boss);
          }
          break;
      }
    }
  }

  private onBossDefeated(): void {
    this.progression.data.bossDefeated = true;
    this.progression.save();
  }

  /** Called each frame with the player so the arena can lock behind them. */
  private updateBossTrigger(player: Player): void {
    if (!this.boss || this.bossTriggered || this.boss.defeated) return;
    if (Math.abs(player.centerX - this.boss.centerX) < 170) {
      this.bossTriggered = true;
      fx.flash(PAL.blood, 12);
    }
  }

  update(player: Player, resolver: HitResolver): void {
    this.updateBossTrigger(player);

    const ctx: EnemyContext = {
      map: this.map,
      resolver,
      player,
      spawnProjectile: (p) => this.projectiles.push(p),
    };

    for (const enemy of this.enemies) enemy.update(ctx);
    this.enemies = this.enemies.filter((e) => !e.removed);
    if (this.boss?.removed) this.boss = null;

    for (const p of this.projectiles) p.update(this.map, resolver);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  /** Returns the item the player is standing on, if any. */
  itemAt(box: Rect): ItemInstance | null {
    for (const item of this.items) {
      if (item.taken) continue;
      if (overlaps(box, rect(item.x - 8, item.y - 8, 16, 16))) return item;
    }
    return null;
  }

  altarNear(box: Rect): AltarInstance | null {
    for (const altar of this.altars) {
      if (overlaps(box, rect(altar.x - 16, altar.y - 26, 32, 28))) return altar;
    }
    return null;
  }

  doorAt(box: Rect): DoorDef | null {
    if (this.exitsSealed) return null;
    for (const door of this.doors) {
      const area = rect(door.tx * TILE, door.ty * TILE, door.tw * TILE, door.th * TILE);
      if (overlaps(box, area)) return door;
    }
    return null;
  }

  // -- rendering -----------------------------------------------------------

  renderBehind(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void {
    for (const altar of this.altars) this.drawAltar(ctx, altar, camX, camY, time);
  }

  renderFront(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void {
    for (const item of this.items) {
      if (!item.taken) this.drawItem(ctx, item, camX, camY, time);
    }
    for (const enemy of this.enemies) enemy.render(ctx, camX, camY);
    for (const p of this.projectiles) p.render(ctx, camX, camY);
    if (this.exitsSealed) this.drawSeals(ctx, camX, camY, time);
  }

  private drawAltar(
    ctx: CanvasRenderingContext2D,
    altar: AltarInstance,
    camX: number,
    camY: number,
    time: number,
  ): void {
    const px = Math.round(altar.x - camX);
    const py = Math.round(altar.y - camY);

    radialGlow(ctx, px, py - 18, 40, PAL.gold, 0.2 + Math.sin(time * 0.04) * 0.05);

    ctx.fillStyle = PAL.stoneDark;
    ctx.fillRect(px - 8, py - 14, 16, 14);
    ctx.fillStyle = PAL.stone;
    ctx.fillRect(px - 7, py - 13, 14, 8);
    ctx.fillStyle = PAL.stoneEdge;
    ctx.fillRect(px - 9, py - 16, 18, 2);

    // Candles.
    for (const dx of [-6, 0, 6]) {
      ctx.fillStyle = PAL.bone;
      ctx.fillRect(px + dx - 1, py - 24, 2, 8);
      const flicker = Math.sin(time * 0.2 + dx) > 0 ? 1 : 0;
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(px + dx - 1, py - 26 - flicker, 2, 2);
      ctx.fillStyle = PAL.goldPale;
      ctx.fillRect(px + dx, py - 26 - flicker, 1, 1);
    }
    if (time % 14 === 0) fx.embers(altar.x, altar.y - 24, 1);
  }

  private drawItem(
    ctx: CanvasRenderingContext2D,
    item: ItemInstance,
    camX: number,
    camY: number,
    time: number,
  ): void {
    const bob = Math.round(Math.sin(time * 0.06 + item.x) * 2);
    const px = Math.round(item.x - camX);
    const py = Math.round(item.y - camY) + bob;

    radialGlow(ctx, px, py, 18, PAL.goldPale, 0.3 + Math.sin(time * 0.08) * 0.1);

    switch (item.kind) {
      case "doubleJump":
        // Winged reliquary.
        ctx.fillStyle = PAL.goldPale;
        ctx.fillRect(px - 2, py - 5, 4, 10);
        ctx.fillStyle = PAL.bone;
        ctx.fillRect(px - 7, py - 3, 5, 3);
        ctx.fillRect(px + 2, py - 3, 5, 3);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(px - 1, py - 7, 2, 2);
        break;
      case "sealBreaker":
        // A key shaped like a nail.
        ctx.fillStyle = PAL.guiltPale;
        ctx.fillRect(px - 1, py - 6, 2, 12);
        ctx.fillStyle = PAL.guilt;
        ctx.fillRect(px - 4, py - 7, 8, 3);
        ctx.fillRect(px + 1, py + 2, 3, 2);
        break;
      case "flask":
        ctx.fillStyle = PAL.stoneLit;
        ctx.fillRect(px - 3, py - 6, 6, 3);
        ctx.fillStyle = PAL.blood;
        ctx.fillRect(px - 4, py - 3, 8, 9);
        ctx.fillStyle = PAL.bloodBright;
        ctx.fillRect(px - 2, py - 1, 3, 5);
        break;
      case "heart":
        ctx.fillStyle = PAL.blood;
        ctx.fillRect(px - 5, py - 4, 10, 7);
        ctx.fillRect(px - 3, py + 3, 6, 2);
        ctx.fillStyle = PAL.bloodBright;
        ctx.fillRect(px - 3, py - 2, 3, 3);
        break;
      case "tears":
        ctx.fillStyle = PAL.fervourPale;
        ctx.fillRect(px - 2, py - 4, 4, 6);
        ctx.fillRect(px - 1, py - 6, 2, 2);
        break;
    }
  }

  private drawSeals(ctx: CanvasRenderingContext2D, camX: number, camY: number, time: number): void {
    for (const door of this.doors) {
      const x = Math.round(door.tx * TILE - camX);
      const y = Math.round(door.ty * TILE - camY);
      ctx.globalAlpha = 0.5 + Math.sin(time * 0.12) * 0.15;
      ctx.fillStyle = PAL.blood;
      ctx.fillRect(x, y, door.tw * TILE, door.th * TILE);
      ctx.globalAlpha = 1;
      ctx.fillStyle = PAL.bloodBright;
      ctx.fillRect(x, y, door.tw * TILE, 1);
      ctx.fillRect(x, y + door.th * TILE - 1, door.tw * TILE, 1);
    }
  }
}
