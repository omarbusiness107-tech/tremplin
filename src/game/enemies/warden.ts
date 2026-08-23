import { approach, rect, sign } from "../../core/math";
import { floorAhead, wallAhead } from "../../engine/physics";
import { PAL } from "../../content/palette";
import { Enemy, type EnemyContext } from "../enemy";
import type { Hit } from "../combat";

const SPEC = { w: 16, h: 30, health: 7, poise: 6, tears: 14, staggerFrames: 78 };

/** Light attacks bounce off the guard; only this much damage breaks it. */
const GUARD_BREAK_DAMAGE = 3;

const BASH_WINDUP = 28;
const BASH_ACTIVE = 5;
const THRUST_WINDUP = 16;
const THRUST_ACTIVE = 6;
const RECOVER = 32;

type Mode = "idle" | "advance" | "bashWindup" | "bash" | "thrustWindup" | "thrust" | "recover";

/**
 * Shielded guard. Frontal light attacks are turned aside, so the intended
 * answers are: parry its swing and riposte, break the guard with a heavy, or
 * roll through and hit it in the back.
 */
export class Warden extends Enemy {
  private mode: Mode = "idle";
  private timer = 0;

  constructor(x: number, feetY: number) {
    super(x, feetY, SPEC);
  }

  private get guardUp(): boolean {
    return this.mode === "idle" || this.mode === "advance" || this.mode === "bashWindup";
  }

  protected override blocks(hit: Hit): boolean {
    if (!this.guardUp) return false;
    if (hit.damage >= GUARD_BREAK_DAMAGE) return false;
    // Only the shielded side is protected.
    return sign(hit.originX - this.centerX) === this.facing;
  }

  protected think(ctx: EnemyContext): void {
    const { player, map, resolver } = ctx;
    this.timer++;

    if (!this.aware && this.sees(player, 150, 56)) this.aware = true;
    const dist = Math.abs(this.toPlayer(player));

    switch (this.mode) {
      case "idle":
        this.body.vx = approach(this.body.vx, 0, 0.2);
        this.facePlayer(player);
        if (this.aware) this.enter("advance");
        break;

      case "advance": {
        this.facePlayer(player);
        const blocked = wallAhead(this.body, this.facing, map) || !floorAhead(this.body, this.facing, map);
        this.body.vx = blocked ? 0 : approach(this.body.vx, this.facing * 0.45, 0.07);
        if (dist < 32 && Math.abs(player.centerY - this.centerY) < 28) this.enter("bashWindup");
        else if (!this.sees(player, 210, 80)) this.enter("idle");
        break;
      }

      case "bashWindup":
        this.body.vx = approach(this.body.vx, 0, 0.2);
        if (this.timer < 6) this.facePlayer(player);
        if (this.timer >= BASH_WINDUP) {
          this.resetSwing();
          this.enter("bash");
        }
        break;

      case "bash":
        this.body.vx = approach(this.body.vx, this.facing * 1.5, 0.5);
        this.meleeHit(rect(12, 6, 20, 18), resolver, { damage: 1, knockback: 3.2, hitstop: 8 });
        if (this.timer >= BASH_ACTIVE) this.enter("thrustWindup");
        break;

      case "thrustWindup":
        this.body.vx = approach(this.body.vx, 0, 0.3);
        if (this.timer >= THRUST_WINDUP) {
          this.resetSwing();
          this.enter("thrust");
        }
        break;

      case "thrust":
        this.body.vx = approach(this.body.vx, this.facing * 1.1, 0.4);
        this.meleeHit(rect(12, 10, 26, 10), resolver, { damage: 2, knockback: 2.6, hitstop: 9 });
        if (this.timer >= THRUST_ACTIVE) this.enter("recover");
        break;

      case "recover":
        this.body.vx = approach(this.body.vx, 0, 0.18);
        if (this.timer >= RECOVER) this.enter("advance");
        break;
    }
  }

  private enter(mode: Mode): void {
    this.mode = mode;
    this.timer = 0;
  }

  protected draw(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    const winding = this.mode === "bashWindup" || this.mode === "thrustWindup";
    if (winding && this.timer > 6) this.telegraph(ctx, px, py, this.timer);

    const f = this.facing;
    const step = this.mode === "advance" ? (Math.sin(this.animTime * 0.13) > 0 ? 1 : 0) : 0;
    const y = py + step;

    // Armoured torso.
    ctx.fillStyle = PAL.stoneDark;
    ctx.fillRect(px + 2, y + 8, 12, 22);
    ctx.fillStyle = PAL.stone;
    ctx.fillRect(px + 3, y + 10, 10, 14);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(px + 3, y + 15, 10, 1);

    // Helm.
    ctx.fillStyle = PAL.stoneLit;
    ctx.fillRect(px + 4, y + 1, 8, 8);
    ctx.fillStyle = PAL.void;
    ctx.fillRect(px + 5 + (f > 0 ? 2 : 0), y + 4, 5, 2);
    ctx.fillStyle = PAL.blood;
    ctx.fillRect(px + 6, y - 2, 4, 3);

    this.drawShield(ctx, px, y, f);
    this.drawSpear(ctx, px, y, f);
  }

  private drawShield(ctx: CanvasRenderingContext2D, px: number, py: number, f: number): void {
    const raised = this.guardUp;
    const sx = px + (f > 0 ? 12 : -4) + (this.mode === "bash" ? f * 6 : 0);
    ctx.fillStyle = raised ? PAL.stoneLit : PAL.stone;
    ctx.fillRect(sx, py + (raised ? 6 : 12), 8, raised ? 20 : 14);
    ctx.fillStyle = raised ? PAL.gold : PAL.stoneDark;
    ctx.fillRect(sx + 2, py + (raised ? 12 : 16), 4, 5);
    if (raised) {
      ctx.fillStyle = PAL.stoneEdge;
      ctx.fillRect(sx, py + 6, 8, 1);
    }
  }

  private drawSpear(ctx: CanvasRenderingContext2D, px: number, py: number, f: number): void {
    if (this.mode !== "thrust" && this.mode !== "thrustWindup") return;
    const extend = this.mode === "thrust" ? 24 : 10;
    const ox = px + (f > 0 ? 10 : 6 - extend);
    ctx.fillStyle = PAL.boneDim;
    ctx.fillRect(ox, py + 14, extend, 2);
    ctx.fillStyle = PAL.bone;
    ctx.fillRect(f > 0 ? ox + extend - 4 : ox, py + 13, 4, 4);
  }
}
