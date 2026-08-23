import { rng } from "../core/rng";
import { PAL } from "../content/palette";

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
  size: number;
  color: string;
  fade: boolean;
}

interface FloatingText {
  alive: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}

const MAX_PARTICLES = 320;
const MAX_TEXTS = 24;

/**
 * Impact feedback: freeze frames, particles, floating text and a full-screen
 * flash. Hitstop is the single biggest contributor to how a hit "lands", so it
 * lives here rather than being scattered through combat code.
 */
export class Fx {
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private hitstopFrames = 0;
  private flashFrames = 0;
  private flashMax = 1;
  private flashColor = "#ffffff";

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        gravity: 0,
        size: 1,
        color: PAL.bone,
        fade: true,
      });
    }
    for (let i = 0; i < MAX_TEXTS; i++) {
      this.texts.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, text: "", color: PAL.ui });
    }
  }

  /** Freeze gameplay for `frames`; the longest request wins. */
  hitstop(frames: number): void {
    this.hitstopFrames = Math.max(this.hitstopFrames, frames);
  }

  get frozen(): boolean {
    return this.hitstopFrames > 0;
  }

  flash(color: string, frames: number): void {
    this.flashColor = color;
    this.flashFrames = frames;
    this.flashMax = frames;
  }

  private spawn(p: Partial<Particle>): void {
    const slot = this.particles.find((q) => !q.alive);
    if (!slot) return;
    slot.alive = true;
    slot.x = p.x ?? 0;
    slot.y = p.y ?? 0;
    slot.vx = p.vx ?? 0;
    slot.vy = p.vy ?? 0;
    slot.maxLife = slot.life = p.life ?? 20;
    slot.gravity = p.gravity ?? 0.12;
    slot.size = p.size ?? 1;
    slot.color = p.color ?? PAL.bone;
    slot.fade = p.fade ?? true;
  }

  blood(x: number, y: number, dir: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x,
        y,
        vx: dir * rng.range(0.4, 2.6) + rng.range(-0.5, 0.5),
        vy: rng.range(-1.8, 0.6),
        life: rng.int(14, 30),
        gravity: 0.16,
        size: rng.next() > 0.7 ? 2 : 1,
        color: rng.next() > 0.35 ? PAL.blood : PAL.bloodBright,
      });
    }
  }

  /** Bright radial sparks: the visual signature of a successful parry. */
  sparks(x: number, y: number, count = 16): void {
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const speed = rng.range(1.2, 3.4);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: rng.int(10, 22),
        gravity: 0.04,
        size: rng.next() > 0.6 ? 2 : 1,
        color: rng.next() > 0.5 ? PAL.goldPale : PAL.gold,
      });
    }
  }

  dust(x: number, y: number, dir = 0, count = 6): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + rng.range(-3, 3),
        y,
        vx: dir * rng.range(0.2, 1.0) + rng.range(-0.4, 0.4),
        vy: rng.range(-0.9, -0.1),
        life: rng.int(12, 22),
        gravity: 0.02,
        size: 1,
        color: PAL.stoneLit,
      });
    }
  }

  embers(x: number, y: number, count = 4): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + rng.range(-6, 6),
        y: y + rng.range(-4, 4),
        vx: rng.range(-0.25, 0.25),
        vy: rng.range(-0.6, -0.15),
        life: rng.int(40, 80),
        gravity: -0.004,
        size: 1,
        color: rng.next() > 0.4 ? PAL.ember : PAL.gold,
      });
    }
  }

  souls(x: number, y: number, color: string = PAL.fervourPale, count = 12): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + rng.range(-6, 6),
        y: y + rng.range(-8, 8),
        vx: rng.range(-0.6, 0.6),
        vy: rng.range(-1.4, -0.4),
        life: rng.int(26, 50),
        gravity: -0.012,
        size: rng.next() > 0.7 ? 2 : 1,
        color,
      });
    }
  }

  popText(x: number, y: number, text: string, color: string): void {
    const slot = this.texts.find((t) => !t.alive);
    if (!slot) return;
    slot.alive = true;
    slot.x = x;
    slot.y = y;
    slot.vy = -0.7;
    slot.life = 46;
    slot.text = text;
    slot.color = color;
  }

  /** Advances flash and particles. Runs even during hitstop so sparks read. */
  update(): void {
    if (this.hitstopFrames > 0) this.hitstopFrames--;
    if (this.flashFrames > 0) this.flashFrames--;

    for (const p of this.particles) {
      if (!p.alive) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.97;
      if (--p.life <= 0) p.alive = false;
    }
    for (const t of this.texts) {
      if (!t.alive) continue;
      t.y += t.vy;
      t.vy *= 0.94;
      if (--t.life <= 0) t.alive = false;
    }
  }

  clear(): void {
    for (const p of this.particles) p.alive = false;
    for (const t of this.texts) t.alive = false;
    this.hitstopFrames = 0;
    this.flashFrames = 0;
  }

  renderParticles(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const p of this.particles) {
      if (!p.alive) continue;
      ctx.globalAlpha = p.fade ? Math.min(1, p.life / (p.maxLife * 0.6)) : 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  /** Floating combat text lives above the world but below the HUD. */
  eachText(fn: (x: number, y: number, text: string, color: string, alpha: number) => void, camX: number, camY: number): void {
    for (const t of this.texts) {
      if (!t.alive) continue;
      fn(Math.round(t.x - camX), Math.round(t.y - camY), t.text, t.color, Math.min(1, t.life / 20));
    }
  }

  renderFlash(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.flashFrames <= 0) return;
    ctx.globalAlpha = (this.flashFrames / this.flashMax) * 0.55;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

export const fx = new Fx();
