import type { AttackDef } from "./combat";

export const PLAYER_W = 12;
export const PLAYER_H = 26;

/** Movement tuning, all in pixels-per-frame at a fixed 60Hz. */
export const MOVE = {
  runSpeed: 1.62,
  accelGround: 0.42,
  accelAir: 0.24,
  frictionGround: 0.5,
  frictionAir: 0.08,
  gravity: 0.34,
  gravityApex: 0.24,
  apexThreshold: 1.1,
  maxFall: 6.2,
  jumpVel: -5.45,
  doubleJumpVel: -4.85,
  /** Releasing jump early clips the arc; this is what makes height variable. */
  jumpCutFactor: 0.42,
  coyoteFrames: 6,
  jumpBufferFrames: 7,
  rollSpeed: 3.1,
  rollFrames: 26,
  rollIFrameStart: 4,
  rollIFrameEnd: 19,
  rollCooldown: 10,
  hurtFrames: 16,
  hurtKnockback: 2.2,
  invulnFrames: 52,
  healFrames: 44,
  healAtFrame: 26,
} as const;

/** Parry timing. A tight window that rewards reading telegraphs. */
export const PARRY = {
  activeFrames: 8,
  totalFrames: 26,
  /** Frames after a success during which attacks become ripostes. */
  riposteWindow: 40,
  riposteMultiplier: 3,
  fervourGain: 20,
  hitstop: 14,
  cooldown: 6,
} as const;

export const FERVOUR = {
  max: 100,
  onHit: 5,
  /** Cost of the fervour-powered heavy finisher. */
  strikeCost: 35,
} as const;

/** Three-hit ground combo: two quick cuts into a heavier finisher. */
export const COMBO: readonly AttackDef[] = [
  {
    name: "cut",
    sfx: "swing1",
    startup: 5,
    active: 4,
    recovery: 11,
    box: { x: 9, y: 3, w: 22, h: 14 },
    damage: 1,
    knockback: 1.6,
    lift: 0,
    hitstop: 5,
    poise: 1,
    lunge: 0.9,
    cancelFrom: 9,
    fervour: FERVOUR.onHit,
  },
  {
    name: "backcut",
    sfx: "swing2",
    startup: 5,
    active: 4,
    recovery: 12,
    box: { x: 9, y: 1, w: 24, h: 16 },
    damage: 1,
    knockback: 1.9,
    lift: 0,
    hitstop: 6,
    poise: 1,
    lunge: 1.1,
    cancelFrom: 9,
    fervour: FERVOUR.onHit,
  },
  {
    name: "finisher",
    sfx: "swing3",
    startup: 9,
    active: 6,
    recovery: 19,
    box: { x: 7, y: -3, w: 29, h: 23 },
    damage: 2,
    knockback: 3.4,
    lift: -1.1,
    hitstop: 10,
    poise: 3,
    lunge: 1.8,
    cancelFrom: 999,
    fervour: FERVOUR.onHit * 2,
  },
];

/** Slow, committed heavy swing. Breaks guard. */
export const HEAVY: AttackDef = {
  name: "heavy",
  sfx: "heavy",
  startup: 15,
  active: 6,
  recovery: 22,
  box: { x: 6, y: -5, w: 32, h: 27 },
  damage: 3,
  knockback: 4.2,
  lift: -1.4,
  hitstop: 13,
  poise: 5,
  lunge: 2.4,
  cancelFrom: 999,
  fervour: FERVOUR.onHit * 2,
};

/** Downward stab performed in the air while holding down. */
export const PLUNGE: AttackDef = {
  name: "plunge",
  sfx: "plunge",
  startup: 4,
  active: 30,
  recovery: 10,
  box: { x: 1, y: 22, w: 14, h: 16 },
  damage: 2,
  knockback: 1.2,
  lift: 0,
  hitstop: 9,
  poise: 3,
  lunge: 0,
  cancelFrom: 999,
  fervour: FERVOUR.onHit,
};
