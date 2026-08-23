import { flipRectAround, rect, sign, type Rect } from "../core/math";
import { outlineRect, radialGlow, silhouette } from "../engine/draw";
import { fx } from "../engine/fx";
import { bodyRect, makeBody, moveBody, type Body } from "../engine/physics";
import { Tilemap } from "../engine/tilemap";
import { PAL } from "../content/palette";
import { HitResult, makeHit, Team, type Damageable, type Hit, type HitResolver } from "./combat";
import type { Player } from "./player";
import type { Projectile } from "./projectile";

export interface EnemyContext {
  map: Tilemap;
  resolver: HitResolver;
  player: Player;
  spawnProjectile(p: Projectile): void;
}

export interface EnemySpec {
  w: number;
  h: number;
  health: number;
  poise: number;
  tears: number;
  /** Frames spent stunned when the poise pool empties. */
  staggerFrames: number;
  gravity?: number;
  contactDamage?: number;
}

/**
 * Shared enemy behaviour: health, poise/stagger, knockback, death. Subclasses
 * implement `think` for movement and attack decisions.
 */
export abstract class Enemy implements Damageable {
  readonly team = Team.Enemy;
  readonly body: Body;
  readonly spec: EnemySpec;

  health: number;
  maxHealth: number;
  poise: number;
  facing = -1;
  dead = false;
  /** Counts up after death so the corpse can fade out before removal. */
  deathFrames = 0;
  removed = false;
  staggered = 0;
  hitFlash = 0;
  protected animTime = 0;
  protected hitSet = new Set<Damageable>();
  /** Set true once the player has been noticed; enemies idle until then. */
  protected aware = false;

  /** `feetY` is the world Y the actor stands on, not the top of its box. */
  constructor(x: number, feetY: number, spec: EnemySpec) {
    this.spec = spec;
    this.body = makeBody(x, feetY - spec.h, spec.w, spec.h);
    this.health = this.maxHealth = spec.health;
    this.poise = spec.poise;
  }

  get centerX(): number {
    return this.body.x + this.body.w / 2;
  }

  get centerY(): number {
    return this.body.y + this.body.h / 2;
  }

  hurtbox(): Rect {
    return bodyRect(this.body);
  }

  /** Subclasses override to add a guard that blocks frontal light attacks. */
  protected blocks(_hit: Hit): boolean {
    return false;
  }

  protected abstract think(ctx: EnemyContext): void;
  protected abstract draw(ctx: CanvasRenderingContext2D, px: number, py: number): void;

  update(ctx: EnemyContext): void {
    if (this.removed) return;
    this.animTime++;
    if (this.hitFlash > 0) this.hitFlash--;

    if (this.dead) {
      this.deathFrames++;
      this.body.vx *= 0.86;
      this.body.vy = Math.min(this.body.vy + 0.34, 6);
      moveBody(this.body, ctx.map);
      if (this.deathFrames > 40) this.removed = true;
      return;
    }

    if (this.staggered > 0) {
      this.staggered--;
      this.body.vx *= 0.84;
      this.applyGravity();
      moveBody(this.body, ctx.map);
      if (this.staggered === 0) this.poise = this.spec.poise;
      return;
    }

    this.think(ctx);
    this.applyGravity();
    moveBody(this.body, ctx.map);
    if (ctx.map.overlapsSpike(this.hurtbox())) this.kill(0);
  }

  protected applyGravity(): void {
    const g = this.spec.gravity ?? 0.34;
    if (g !== 0) this.body.vy = Math.min(this.body.vy + g, 6.2);
  }

  /** Distance to the player along X, signed toward the player. */
  protected toPlayer(player: Player): number {
    return player.centerX - this.centerX;
  }

  protected facePlayer(player: Player): void {
    const d = this.toPlayer(player);
    if (Math.abs(d) > 2) this.facing = sign(d);
  }

  protected sees(player: Player, range: number, vertical = 60): boolean {
    if (player.dead) return false;
    return (
      Math.abs(this.toPlayer(player)) < range && Math.abs(player.centerY - this.centerY) < vertical
    );
  }

  /** Build a melee hitbox authored facing right and mirrored to `facing`. */
  protected meleeHit(
    box: Rect,
    resolver: HitResolver,
    options: { damage: number; knockback: number; hitstop?: number; parryable?: boolean },
  ): void {
    let world = rect(this.body.x + box.x, this.body.y + box.y, box.w, box.h);
    if (this.facing < 0) world = flipRectAround(world, this.centerX);
    resolver.submit(
      makeHit(world, Team.Enemy, this.centerX, this.hitSet, {
        damage: options.damage,
        knockback: options.knockback,
        hitstop: options.hitstop ?? 7,
        parryable: options.parryable ?? true,
        onResolve: (result) => {
          // A parried swing leaves the attacker wide open -- the core loop.
          if (result === HitResult.Parried) this.stagger(this.spec.staggerFrames + 20);
        },
      }),
    );
  }

  protected resetSwing(): void {
    this.hitSet = new Set();
  }

  takeHit(hit: Hit): HitResult {
    if (this.dead) return HitResult.Ignored;

    if (this.blocks(hit)) {
      this.hitFlash = 3;
      fx.sparks(this.centerX + sign(hit.originX - this.centerX) * 8, this.centerY, 6);
      fx.hitstop(5);
      return HitResult.Blocked;
    }

    this.health -= hit.damage;
    this.poise -= hit.poise;
    this.hitFlash = 5;
    this.aware = true;

    const dir = sign(this.centerX - hit.originX) || 1;
    this.body.vx = dir * hit.knockback;
    if (hit.lift !== 0) this.body.vy = hit.lift;

    fx.hitstop(hit.hitstop);
    fx.blood(this.centerX, this.centerY, dir, 8 + hit.damage * 3);
    fx.popText(this.centerX, this.body.y - 4, `${hit.damage}`, PAL.bone);

    if (this.health <= 0) {
      this.kill(dir);
      return HitResult.Hit;
    }
    if (this.poise <= 0) this.stagger(this.spec.staggerFrames);
    return HitResult.Hit;
  }

  stagger(frames: number): void {
    if (this.dead) return;
    this.staggered = Math.max(this.staggered, frames);
    this.poise = 0;
    this.resetSwing();
    fx.popText(this.centerX, this.body.y - 12, "broken", PAL.goldPale);
  }

  kill(dir: number): void {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.body.vx = dir * 1.6;
    this.body.vy = -2.2;
    fx.blood(this.centerX, this.centerY, dir, 18);
    fx.souls(this.centerX, this.centerY, PAL.fervourPale, 10);
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (this.removed) return;
    const px = Math.round(this.body.x - camX);
    const py = Math.round(this.body.y - camY);

    ctx.save();
    if (this.dead) {
      ctx.globalAlpha = Math.max(0, 1 - this.deathFrames / 40);
      // Corpses topple over as they fade.
      ctx.translate(px + this.body.w / 2, py + this.body.h);
      ctx.rotate(sign(this.body.vx || 1) * Math.min(this.deathFrames / 40, 1) * 1.4);
      ctx.translate(-this.body.w / 2, -this.body.h);
      this.draw(ctx, 0, 0);
      ctx.restore();
      return;
    }
    ctx.restore();

    silhouette(ctx, px, py, this.body.w, this.body.h);
    this.draw(ctx, px, py);

    if (this.hitFlash > 0) {
      // Additive-ish white flash so hits register even in dark rooms.
      ctx.globalAlpha = this.hitFlash / 6;
      ctx.fillStyle = PAL.bone;
      ctx.fillRect(px, py, this.body.w, this.body.h);
      ctx.globalAlpha = 1;
    }
    if (this.staggered > 0) this.drawStaggerMark(ctx, px, py);
  }

  private drawStaggerMark(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    const bob = Math.sin(this.animTime * 0.3) * 1.5;
    ctx.fillStyle = PAL.goldPale;
    const cx = px + this.body.w / 2;
    const cy = py - 8 + bob;
    // A small broken-halo mark above staggered enemies.
    ctx.fillRect(cx - 4, cy, 8, 1);
    ctx.fillRect(cx - 1, cy - 3, 2, 2);
    ctx.fillRect(cx - 5, cy - 2, 1, 2);
    ctx.fillRect(cx + 4, cy - 2, 1, 2);
  }

  /** Telegraph tint used by every enemy so wind-ups read consistently. */
  protected telegraph(ctx: CanvasRenderingContext2D, px: number, py: number, t: number): void {
    const pulse = 0.5 + Math.sin(t * 0.6) * 0.35;
    radialGlow(ctx, px + this.body.w / 2, py + this.body.h / 2, this.body.w + 10, PAL.danger, pulse * 0.5);
    outlineRect(ctx, px - 2, py - 3, this.body.w + 4, this.body.h + 5, PAL.danger, pulse);
  }
}
