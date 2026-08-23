import { approach, rect } from "../../core/math";
import { floorAhead, wallAhead } from "../../engine/physics";
import { PAL } from "../../content/palette";
import { Enemy, type EnemyContext } from "../enemy";

const SPEC = { w: 14, h: 26, health: 4, poise: 3, tears: 6, staggerFrames: 54 };

const WINDUP = 30;
const ACTIVE = 6;
const RECOVER = 26;
const REACH = 30;

type Mode = "idle" | "walk" | "windup" | "strike" | "recover";

/**
 * The basic penitent: shuffles toward you and telegraphs a heavy overhead
 * swing. Slow enough that its wind-up is the game's parry tutorial.
 */
export class Shambler extends Enemy {
  private mode: Mode = "idle";
  private timer = 0;
  private patrolDir = -1;

  constructor(x: number, feetY: number) {
    super(x, feetY, SPEC);
  }

  protected think(ctx: EnemyContext): void {
    const { player, map, resolver } = ctx;
    this.timer++;

    if (!this.aware && this.sees(player, 130, 48)) this.aware = true;

    switch (this.mode) {
      case "idle": {
        this.body.vx = approach(this.body.vx, 0, 0.2);
        if (this.aware) this.enter("walk");
        else if (this.timer > 70) {
          this.patrolDir *= -1;
          this.facing = this.patrolDir;
          this.timer = 0;
        }
        break;
      }
      case "walk": {
        this.facePlayer(player);
        const dist = Math.abs(this.toPlayer(player));
        const blocked = wallAhead(this.body, this.facing, map) || !floorAhead(this.body, this.facing, map);
        this.body.vx = blocked ? 0 : approach(this.body.vx, this.facing * 0.55, 0.09);
        if (dist < REACH && Math.abs(player.centerY - this.centerY) < 26) this.enter("windup");
        else if (!this.sees(player, 190, 70)) this.enter("idle");
        break;
      }
      case "windup": {
        this.body.vx = approach(this.body.vx, 0, 0.16);
        // Commit to a facing at the start of the wind-up so it can be baited.
        if (this.timer < 8) this.facePlayer(player);
        if (this.timer >= WINDUP) {
          this.resetSwing();
          this.enter("strike");
        }
        break;
      }
      case "strike": {
        this.body.vx = approach(this.body.vx, this.facing * 0.8, 0.4);
        this.meleeHit(rect(10, 2, 24, 20), resolver, { damage: 1, knockback: 2.4, hitstop: 8 });
        if (this.timer >= ACTIVE) this.enter("recover");
        break;
      }
      case "recover": {
        this.body.vx = approach(this.body.vx, 0, 0.2);
        if (this.timer >= RECOVER) this.enter("walk");
        break;
      }
    }
  }

  private enter(mode: Mode): void {
    this.mode = mode;
    this.timer = 0;
  }

  protected draw(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    if (this.mode === "windup" && this.timer > 8) this.telegraph(ctx, px, py, this.timer);

    const shuffle = this.mode === "walk" ? (Math.sin(this.animTime * 0.16) > 0 ? 1 : 0) : 0;
    const y = py + shuffle;
    const f = this.facing;

    // Hunched robe.
    ctx.fillStyle = PAL.stoneDark;
    ctx.fillRect(px + 1, y + 10, 12, 16);
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(px + 2, y + 11, 10, 13);

    // Bowed head with a rusted mask.
    ctx.fillStyle = PAL.flesh;
    ctx.fillRect(px + 3 + (f > 0 ? 2 : 0), y + 3, 8, 8);
    ctx.fillStyle = PAL.void;
    ctx.fillRect(px + 4 + (f > 0 ? 3 : 0), y + 6, 5, 2);
    ctx.fillStyle = PAL.boneDim;
    ctx.fillRect(px + 3 + (f > 0 ? 2 : 0), y + 2, 8, 1);

    this.drawWeapon(ctx, px, y, f);
  }

  private drawWeapon(ctx: CanvasRenderingContext2D, px: number, py: number, f: number): void {
    const handX = px + (f > 0 ? 12 : 2);
    if (this.mode === "windup") {
      // Raised overhead: the readable "now or never" pose.
      const lift = Math.min(1, this.timer / WINDUP);
      ctx.fillStyle = PAL.boneDim;
      ctx.fillRect(handX - 1, py - Math.round(lift * 10), 2, 14);
      ctx.fillStyle = PAL.blood;
      ctx.fillRect(handX - 3, py - Math.round(lift * 10) - 2, 6, 3);
      return;
    }
    if (this.mode === "strike") {
      ctx.fillStyle = PAL.bone;
      ctx.fillRect(px + (f > 0 ? 10 : -10), py + 8, 16, 3);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = PAL.boneDim;
      ctx.fillRect(px + (f > 0 ? 8 : -12), py + 2, 20, 12);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = PAL.boneDim;
    ctx.fillRect(handX - 1, py + 12, 2, 12);
  }
}
