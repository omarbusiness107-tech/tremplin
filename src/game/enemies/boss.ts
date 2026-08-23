import { clamp, rect } from "../../core/math";
import { fx } from "../../engine/fx";
import { wallAhead } from "../../engine/physics";
import { rng } from "../../core/rng";
import { PAL } from "../../content/palette";
import { playSfx } from "../../content/sfx";
import { HitResult, type Hit } from "../combat";
import { Enemy, type EnemyContext } from "../enemy";
import { Projectile } from "../projectile";

const SPEC = { w: 28, h: 44, health: 42, poise: 26, tears: 120, staggerFrames: 84 };

export const BOSS_NAME = "abbot of the seventh wound";

type Move = "wait" | "walk" | "sweep" | "slam" | "toll" | "charge" | "phaseShift";

const SWEEP = { windup: 32, gap: 14, active: 6, swings: 3, recover: 30 };
const SLAM = { windup: 24, recover: 34 };
const TOLL = { windup: 46, recover: 40 };
const CHARGE = { windup: 22, maxDash: 50, recover: 26 };

/**
 * Two-phase arena boss. Every offensive move is parryable and telegraphed;
 * breaking its poise (or parrying a swing) opens a riposte window, which is
 * the intended way to out-damage it.
 */
export class Boss extends Enemy {
  readonly name = BOSS_NAME;
  phase = 1;
  defeated = false;

  private move: Move = "wait";
  private timer = 0;
  private cooldown = 60;
  private swingsDone = 0;
  private dashFrames = 0;
  private hasLanded = false;

  constructor(x: number, feetY: number, private readonly onDefeated: () => void) {
    super(x, feetY, SPEC);
    this.facing = -1;
    this.deathSfx = "bossDeath";
  }

  get healthFraction(): number {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  private get invulnerable(): boolean {
    return this.move === "phaseShift";
  }

  override takeHit(hit: Hit): HitResult {
    if (this.invulnerable || this.defeated) return HitResult.Ignored;
    const result = super.takeHit(hit);
    if (result === HitResult.Hit && !this.dead) {
      // Bosses shrug off knockback; only stagger moves them.
      this.body.vx = 0;
      if (this.phase === 1 && this.health <= this.maxHealth * 0.5) this.enter("phaseShift");
    }
    return result;
  }

  override kill(dir: number): void {
    if (this.dead) return;
    this.defeated = true;
    super.kill(dir);
    fx.flash(PAL.goldPale, 30);
    fx.souls(this.centerX, this.centerY, PAL.goldPale, 40);
    this.onDefeated();
  }

  protected think(ctx: EnemyContext): void {
    const { map, resolver } = ctx;
    this.timer++;
    this.aware = true;

    switch (this.move) {
      case "wait":
      case "walk":
        this.updateApproach(ctx);
        break;

      case "sweep": {
        this.body.vx *= 0.86;
        const t = this.timer - SWEEP.windup;
        if (t >= 0) {
          const slot = Math.floor(t / SWEEP.gap);
          const local = t % SWEEP.gap;
          if (slot < SWEEP.swings) {
            if (local === 0) this.resetSwing();
            if (local < SWEEP.active) {
              this.swingsDone = slot + 1;
              this.body.vx = this.facing * 1.4;
              this.meleeHit(rect(24, 6, 34, 26), resolver, { damage: 1, knockback: 3.0, hitstop: 8 });
            }
          } else if (t >= SWEEP.swings * SWEEP.gap + SWEEP.recover) {
            this.finishMove();
          }
        }
        break;
      }

      case "slam":
        this.updateSlam(ctx);
        break;

      case "toll":
        this.body.vx *= 0.8;
        if (this.timer === TOLL.windup) this.emitToll(ctx);
        if (this.timer >= TOLL.windup + TOLL.recover) this.finishMove();
        break;

      case "charge":
        this.updateCharge(map, resolver);
        break;

      case "phaseShift":
        this.body.vx *= 0.7;
        if (this.timer === 1) {
          fx.flash(PAL.blood, 22);
          fx.hitstop(24);
          playSfx("bossPhase");
          fx.popText(this.centerX, this.body.y - 14, "the wound opens", PAL.bloodBright);
        }
        if (this.timer % 6 === 0) fx.souls(this.centerX, this.centerY, PAL.bloodBright, 6);
        if (this.timer >= 70) {
          this.phase = 2;
          this.poise = this.spec.poise;
          this.finishMove();
        }
        break;
    }
  }

  private updateApproach(ctx: EnemyContext): void {
    const { player, map } = ctx;
    this.facePlayer(player);
    const dist = Math.abs(this.toPlayer(player));

    if (this.cooldown > 0) {
      this.cooldown--;
      // Drift toward the player between moves rather than standing still.
      const walkSpeed = this.phase === 2 ? 0.85 : 0.6;
      const blocked = wallAhead(this.body, this.facing, map);
      this.body.vx = blocked || dist < 40 ? this.body.vx * 0.85 : this.facing * walkSpeed;
      this.move = "walk";
      return;
    }

    this.body.vx *= 0.8;
    this.enter(this.chooseMove(dist));
  }

  private chooseMove(dist: number): Move {
    const roll = rng.next();
    if (this.phase === 2) {
      if (dist > 120) return roll > 0.4 ? "charge" : "slam";
      if (dist < 52) return roll > 0.45 ? "sweep" : "toll";
      return roll > 0.6 ? "toll" : roll > 0.3 ? "slam" : "charge";
    }
    if (dist > 110) return "slam";
    if (dist < 54) return "sweep";
    return roll > 0.5 ? "slam" : "sweep";
  }

  private updateSlam(ctx: EnemyContext): void {
    const { player, resolver } = ctx;
    if (this.timer < SLAM.windup) {
      this.body.vx *= 0.85;
      if (this.timer < 8) this.facePlayer(player);
      return;
    }
    if (this.timer === SLAM.windup) {
      this.body.vy = -6.4;
      this.body.vx = clamp(this.toPlayer(player) / 26, -3.6, 3.6);
      this.hasLanded = false;
      this.resetSwing();
      return;
    }
    if (!this.hasLanded) {
      if (this.body.grounded && this.timer > SLAM.windup + 6) {
        this.hasLanded = true;
        this.timer = SLAM.windup + 6;
        this.body.vx = 0;
        fx.hitstop(10);
        playSfx("bossSlam");
        fx.dust(this.centerX, this.body.y + this.body.h, 0, 18);
        this.spawnShockwaves(ctx);
      }
      return;
    }
    // Ground-level impact box on the landing frames.
    if (this.timer < SLAM.windup + 14) {
      this.meleeHit(rect(-14, 30, 56, 16), resolver, { damage: 2, knockback: 3.6, hitstop: 10 });
    }
    if (this.timer >= SLAM.windup + 14 + SLAM.recover) this.finishMove();
  }

  private spawnShockwaves(ctx: EnemyContext): void {
    const y = this.body.y + this.body.h - 5;
    for (const dir of [-1, 1]) {
      ctx.spawnProjectile(
        new Projectile(this.centerX + dir * 16, y, dir * 2.1, 0, {
          damage: 1,
          gravity: 0,
          radius: 4,
          life: 110,
          color: PAL.blood,
          trail: PAL.bloodBright,
        }),
      );
    }
  }

  private emitToll(ctx: EnemyContext): void {
    fx.flash(PAL.guiltPale, 10);
    fx.sparks(this.centerX, this.centerY, 24);
    playSfx("bossToll");
    const count = 12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      ctx.spawnProjectile(
        new Projectile(this.centerX, this.centerY, Math.cos(a) * 1.5, Math.sin(a) * 1.5, {
          damage: 1,
          gravity: 0,
          radius: 3,
          life: 130,
          color: PAL.guilt,
          trail: PAL.guiltPale,
        }),
      );
    }
  }

  private updateCharge(map: EnemyContext["map"], resolver: EnemyContext["resolver"]): void {
    if (this.timer < CHARGE.windup) {
      this.body.vx *= 0.8;
      return;
    }
    if (this.timer === CHARGE.windup) {
      this.dashFrames = 0;
      this.resetSwing();
      playSfx("bossCharge");
    }
    if (this.dashFrames < CHARGE.maxDash) {
      this.dashFrames++;
      this.body.vx = this.facing * 4.4;
      this.meleeHit(rect(2, 4, 34, 34), resolver, { damage: 2, knockback: 4.0, hitstop: 10 });
      fx.dust(this.centerX, this.body.y + this.body.h, -this.facing, 2);
      if (wallAhead(this.body, this.facing, map)) {
        // Crashing into the wall is a free punish window.
        this.dashFrames = CHARGE.maxDash;
        this.stagger(70);
        fx.hitstop(12);
        fx.dust(this.centerX + this.facing * 14, this.centerY, -this.facing, 14);
      }
      return;
    }
    this.body.vx *= 0.8;
    if (this.timer >= CHARGE.windup + CHARGE.maxDash + CHARGE.recover) this.finishMove();
  }

  private enter(move: Move): void {
    this.move = move;
    this.timer = 0;
    this.swingsDone = 0;
    this.resetSwing();
  }

  private finishMove(): void {
    this.move = "wait";
    this.timer = 0;
    this.cooldown = this.phase === 2 ? 26 : 46;
  }

  private get winding(): boolean {
    if (this.move === "sweep") return this.timer < SWEEP.windup;
    if (this.move === "slam") return this.timer < SLAM.windup;
    if (this.move === "toll") return this.timer < TOLL.windup;
    if (this.move === "charge") return this.timer < CHARGE.windup;
    return false;
  }

  protected draw(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    if (this.winding && this.timer > 6) this.telegraph(ctx, px, py, this.timer);
    if (this.move === "phaseShift") {
      ctx.globalAlpha = 0.4 + Math.sin(this.timer * 0.4) * 0.25;
      ctx.fillStyle = PAL.bloodBright;
      ctx.fillRect(px - 4, py - 6, this.body.w + 8, this.body.h + 8);
      ctx.globalAlpha = 1;
    }

    const f = this.facing;
    const sway = Math.sin(this.animTime * 0.06) > 0 ? 1 : 0;
    const y = py + sway;
    const wounded = this.phase === 2;

    // Heavy vestments.
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(px + 2, y + 14, 24, 30);
    ctx.fillStyle = wounded ? PAL.blood : PAL.cloth;
    ctx.fillRect(px + 4, y + 16, 20, 24);
    ctx.fillStyle = PAL.void;
    ctx.fillRect(px + 2, y + 43, 24, 1);

    // Mitre and shoulders.
    ctx.fillStyle = PAL.stoneDark;
    ctx.fillRect(px, y + 12, 28, 5);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(px, y + 12, 28, 1);
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(px + 8, y - 4, 12, 16);
    ctx.fillStyle = wounded ? PAL.bloodBright : PAL.cloth;
    ctx.fillRect(px + 10, y - 2, 8, 12);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(px + 13, y - 8, 2, 6);
    ctx.fillRect(px + 11, y - 6, 6, 2);

    // Hollow face.
    ctx.fillStyle = PAL.void;
    ctx.fillRect(px + 9 + (f > 0 ? 3 : 0), y + 4, 7, 4);
    ctx.fillStyle = wounded ? PAL.bloodBright : PAL.goldPale;
    ctx.fillRect(px + 10 + (f > 0 ? 3 : 0), y + 5, 2, 2);
    ctx.fillRect(px + 13 + (f > 0 ? 3 : 0), y + 5, 2, 2);

    // The seventh wound, bleeding through the chest in phase two.
    if (wounded) {
      ctx.fillStyle = PAL.void;
      ctx.fillRect(px + 12, y + 22, 4, 8);
      ctx.fillStyle = PAL.bloodBright;
      ctx.fillRect(px + 13, y + 23, 2, 6);
      if (this.animTime % 8 === 0) fx.blood(this.centerX, y + 30, 0, 1);
    }

    this.drawCensorMace(ctx, px, y, f);
  }

  private drawCensorMace(ctx: CanvasRenderingContext2D, px: number, py: number, f: number): void {
    const anchorX = px + (f > 0 ? 24 : 4);
    const anchorY = py + 20;

    let tipX = anchorX + f * 10;
    let tipY = anchorY + 6;

    if (this.move === "sweep") {
      const t = this.timer - SWEEP.windup;
      if (t < 0) {
        tipX = anchorX - f * Math.min(14, (this.timer / SWEEP.windup) * 14);
        tipY = anchorY - 12;
      } else {
        const local = (t % SWEEP.gap) / SWEEP.gap;
        tipX = anchorX + f * (-10 + local * 44);
        tipY = anchorY - 6 + local * 10;
      }
    } else if (this.move === "slam") {
      tipY = this.timer < SLAM.windup ? anchorY - 22 : anchorY + 20;
      tipX = anchorX + f * 4;
    } else if (this.move === "toll") {
      tipX = anchorX + f * 6;
      tipY = anchorY - 16 - Math.round(Math.sin(this.timer * 0.2) * 3);
    }

    ctx.strokeStyle = PAL.boneDim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.lineWidth = 1;

    // The bell head.
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(Math.round(tipX) - 4, Math.round(tipY) - 4, 8, 8);
    ctx.fillStyle = this.phase === 2 ? PAL.bloodBright : PAL.goldPale;
    ctx.fillRect(Math.round(tipX) - 2, Math.round(tipY) - 2, 4, 4);

    if (this.swingsDone > 0 && this.move === "sweep") {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = PAL.goldPale;
      ctx.fillRect(px + (f > 0 ? 20 : -30), py + 8, 40, 24);
      ctx.globalAlpha = 1;
    }
  }
}
