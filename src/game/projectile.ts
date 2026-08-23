import { rect, type Rect } from "../core/math";
import { fx } from "../engine/fx";
import { Tilemap } from "../engine/tilemap";
import { PAL } from "../content/palette";
import { HitResult, makeHit, Team, type Damageable, type HitResolver } from "./combat";

export interface ProjectileOptions {
  damage?: number;
  gravity?: number;
  life?: number;
  radius?: number;
  color?: string;
  trail?: string;
  /** Parryable projectiles are destroyed by a well-timed guard. */
  parryable?: boolean;
}

/**
 * Enemy shot. Submits a parryable hitbox each frame; the first thing it
 * connects with (or terrain) ends it.
 */
export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dead = false;
  private life: number;
  private readonly gravity: number;
  private readonly radius: number;
  private readonly damage: number;
  private readonly color: string;
  private readonly trail: string;
  private readonly parryable: boolean;
  private readonly hitSet = new Set<Damageable>();
  private spin = 0;

  constructor(x: number, y: number, vx: number, vy: number, options: ProjectileOptions = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = options.damage ?? 1;
    this.gravity = options.gravity ?? 0.12;
    this.life = options.life ?? 200;
    this.radius = options.radius ?? 3;
    this.color = options.color ?? PAL.ember;
    this.trail = options.trail ?? PAL.gold;
    this.parryable = options.parryable ?? true;
  }

  box(): Rect {
    return rect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
  }

  update(map: Tilemap, resolver: HitResolver): void {
    if (this.dead) return;
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.spin += 0.3;

    if (--this.life <= 0 || map.overlapsSolid(this.box())) {
      this.burst();
      return;
    }

    resolver.submit(
      makeHit(this.box(), Team.Enemy, this.x, this.hitSet, {
        damage: this.damage,
        knockback: 1.8,
        hitstop: 6,
        poise: 1,
        parryable: this.parryable,
        onResolve: (result) => {
          if (result === HitResult.Parried) {
            fx.sparks(this.x, this.y, 14);
            fx.hitstop(8);
          }
          this.burst();
        },
      }),
    );

    if (Math.random() > 0.55) fx.embers(this.x, this.y, 1);
  }

  private burst(): void {
    this.dead = true;
    fx.blood(this.x, this.y, 0, 4);
    fx.embers(this.x, this.y, 6);
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (this.dead) return;
    const px = Math.round(this.x - camX);
    const py = Math.round(this.y - camY);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = this.trail;
    ctx.fillRect(px - this.radius - 1, py - this.radius - 1, this.radius * 2 + 2, this.radius * 2 + 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color;
    ctx.fillRect(px - this.radius, py - this.radius, this.radius * 2, this.radius * 2);
    ctx.fillStyle = PAL.goldPale;
    const wobble = Math.sin(this.spin) > 0 ? 1 : -1;
    ctx.fillRect(px - 1, py - 1 + wobble, 2, 2);
  }
}
