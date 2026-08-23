import { approach } from "../../core/math";
import { floorAhead, wallAhead } from "../../engine/physics";
import { PAL } from "../../content/palette";
import { Enemy, type EnemyContext } from "../enemy";
import { Projectile } from "../projectile";

const SPEC = { w: 14, h: 28, health: 3, poise: 2, tears: 8, staggerFrames: 60 };

const WINDUP = 36;
const RECOVER = 40;
const PREFERRED_MIN = 62;
const PREFERRED_MAX = 150;

type Mode = "idle" | "reposition" | "windup" | "recover";

/**
 * Censer-bearer. Holds mid-range and lobs burning incense in an arc, so the
 * player has to close distance through fire -- or parry the shot away.
 */
export class Thurifer extends Enemy {
  private mode: Mode = "idle";
  private timer = 0;

  constructor(x: number, feetY: number) {
    super(x, feetY, SPEC);
  }

  protected think(ctx: EnemyContext): void {
    const { player, map } = ctx;
    this.timer++;

    if (!this.aware && this.sees(player, 175, 70)) this.aware = true;
    if (!this.aware) {
      this.body.vx = approach(this.body.vx, 0, 0.2);
      return;
    }

    const dist = Math.abs(this.toPlayer(player));

    switch (this.mode) {
      case "idle":
        this.facePlayer(player);
        this.body.vx = approach(this.body.vx, 0, 0.2);
        if (dist < PREFERRED_MIN || dist > PREFERRED_MAX) this.enter("reposition");
        else if (this.timer > 26) this.enter("windup");
        break;

      case "reposition": {
        this.facePlayer(player);
        // Back away when crowded, close in when the player is too far.
        const dir = dist < PREFERRED_MIN ? -this.facing : this.facing;
        const blocked = wallAhead(this.body, dir, map) || !floorAhead(this.body, dir, map);
        this.body.vx = blocked ? 0 : approach(this.body.vx, dir * 0.62, 0.1);
        if (blocked || (dist >= PREFERRED_MIN && dist <= PREFERRED_MAX) || this.timer > 90) this.enter("idle");
        break;
      }

      case "windup":
        this.body.vx = approach(this.body.vx, 0, 0.25);
        if (this.timer < 10) this.facePlayer(player);
        if (this.timer >= WINDUP) {
          this.throwCenser(ctx);
          this.enter("recover");
        }
        break;

      case "recover":
        this.body.vx = approach(this.body.vx, 0, 0.2);
        if (this.timer >= RECOVER) this.enter("idle");
        break;
    }
  }

  private throwCenser(ctx: EnemyContext): void {
    const { player } = ctx;
    const ox = this.centerX + this.facing * 8;
    const oy = this.centerY - 4;
    const dx = player.centerX - ox;
    const dy = player.centerY - oy;
    // Solve a lobbed arc for a fixed flight time so the shot always leads.
    const flight = 42;
    const gravity = 0.1;
    ctx.spawnProjectile(
      new Projectile(ox, oy, dx / flight, dy / flight - 0.5 * gravity * flight, {
        damage: 1,
        gravity,
        radius: 3,
        life: 150,
        color: PAL.ember,
      }),
    );
  }

  private enter(mode: Mode): void {
    this.mode = mode;
    this.timer = 0;
  }

  protected draw(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    if (this.mode === "windup" && this.timer > 10) this.telegraph(ctx, px, py, this.timer);

    const sway = Math.sin(this.animTime * 0.05) > 0 ? 1 : 0;
    const y = py + sway;
    const f = this.facing;

    // Tall thin cassock.
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(px + 2, y + 9, 10, 19);
    ctx.fillStyle = PAL.stoneDark;
    ctx.fillRect(px + 3, y + 11, 8, 15);

    // Wide brimmed hat.
    ctx.fillStyle = PAL.void;
    ctx.fillRect(px - 1, y + 6, 16, 2);
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(px + 3, y + 1, 8, 6);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(px + 3, y + 5, 8, 1);
    ctx.fillStyle = PAL.bloodBright;
    ctx.fillRect(px + 5 + (f > 0 ? 2 : 0), y + 8, 2, 1);

    this.drawCenser(ctx, px, y, f);
  }

  private drawCenser(ctx: CanvasRenderingContext2D, px: number, py: number, f: number): void {
    const swing = this.mode === "windup" ? Math.min(1, this.timer / WINDUP) : 0;
    const cx = px + (f > 0 ? 13 : 1) + f * Math.round(swing * 6);
    const cy = py + 14 - Math.round(swing * 8);

    ctx.strokeStyle = PAL.boneDim;
    ctx.beginPath();
    ctx.moveTo(px + (f > 0 ? 11 : 3), py + 12);
    ctx.lineTo(cx, cy);
    ctx.stroke();

    ctx.fillStyle = PAL.gold;
    ctx.fillRect(cx - 2, cy, 4, 4);
    ctx.fillStyle = swing > 0.4 ? PAL.bloodBright : PAL.ember;
    ctx.fillRect(cx - 1, cy + 1, 2, 2);
  }
}
