import type { Rect } from "../core/math";
import { overlaps } from "../core/math";

export const enum Team {
  Player = 0,
  Enemy = 1,
}

export const enum HitResult {
  /** Damage was applied normally. */
  Hit = 0,
  /** Target was invulnerable, rolling, or already dead. */
  Ignored = 1,
  /** Target parried: the attacker should stagger. */
  Parried = 2,
  /** Target blocked with a shield: reduced effect, attacker recoils. */
  Blocked = 3,
}

export interface Hit {
  box: Rect;
  team: Team;
  damage: number;
  /** Horizontal impulse applied to the victim, in the attack's direction. */
  knockback: number;
  /** Upward impulse applied to the victim. */
  lift: number;
  /** Freeze frames on a successful connection. */
  hitstop: number;
  /** Stagger damage; enemies break when their poise pool empties. */
  poise: number;
  /** Only parryable attacks can be turned back by the player's guard. */
  parryable: boolean;
  /** World X the attack came from, used to orient knockback and parry checks. */
  originX: number;
  /** Targets already struck by this attack instance. */
  hitSet: Set<Damageable>;
  /** Called back with the outcome so the attacker can react (stagger, recoil). */
  onResolve?: (result: HitResult, target: Damageable) => void;
}

export interface Damageable {
  readonly team: Team;
  dead: boolean;
  hurtbox(): Rect;
  takeHit(hit: Hit): HitResult;
}

export interface HitOptions {
  damage?: number;
  knockback?: number;
  lift?: number;
  hitstop?: number;
  poise?: number;
  parryable?: boolean;
  onResolve?: (result: HitResult, target: Damageable) => void;
}

export function makeHit(
  box: Rect,
  team: Team,
  originX: number,
  hitSet: Set<Damageable>,
  options: HitOptions = {},
): Hit {
  return {
    box,
    team,
    originX,
    hitSet,
    damage: options.damage ?? 1,
    knockback: options.knockback ?? 1.5,
    lift: options.lift ?? 0,
    hitstop: options.hitstop ?? 6,
    poise: options.poise ?? 1,
    parryable: options.parryable ?? true,
    onResolve: options.onResolve,
  };
}

/**
 * Collects every hitbox produced this frame and resolves it against opposing
 * hurtboxes once, after all entities have updated. Doing it in one pass keeps
 * trades symmetric regardless of entity update order.
 */
export class HitResolver {
  private pending: Hit[] = [];

  submit(hit: Hit): void {
    this.pending.push(hit);
  }

  resolve(targets: readonly Damageable[]): void {
    if (this.pending.length === 0) return;
    for (const hit of this.pending) {
      for (const target of targets) {
        if (target.dead || target.team === hit.team) continue;
        if (hit.hitSet.has(target)) continue;
        if (!overlaps(hit.box, target.hurtbox())) continue;

        const result = target.takeHit(hit);
        if (result === HitResult.Ignored) continue;
        hit.hitSet.add(target);
        hit.onResolve?.(result, target);
      }
    }
    this.pending.length = 0;
  }

  clear(): void {
    this.pending.length = 0;
  }
}

/** Frame data for a melee swing. Boxes are authored facing right. */
export interface AttackDef {
  name: string;
  startup: number;
  active: number;
  recovery: number;
  box: Rect;
  damage: number;
  knockback: number;
  lift: number;
  hitstop: number;
  poise: number;
  /** Forward impulse applied when the hitbox comes out. */
  lunge: number;
  /** Earliest frame the next combo step may be buffered from. */
  cancelFrom: number;
  /** Fervour granted when this attack connects. */
  fervour: number;
}

export function attackLength(def: AttackDef): number {
  return def.startup + def.active + def.recovery;
}
