import { approach, clamp, flipRectAround, rect, sign, type Rect } from "../core/math";
import { hapticHeavy, hapticHurt, hapticParry } from "../core/haptics";
import { input } from "../core/input";
import { outlineRect, radialGlow, silhouette } from "../engine/draw";
import { fx } from "../engine/fx";
import { bodyRect, floorAhead, makeBody, moveBody, type Body } from "../engine/physics";
import { Tilemap } from "../engine/tilemap";
import { PAL } from "../content/palette";
import { playSfx, playSfxVaried } from "../content/sfx";
import {
  attackLength,
  HitResult,
  makeHit,
  Team,
  type AttackDef,
  type Damageable,
  type Hit,
  type HitResolver,
} from "./combat";
import { COMBO, FERVOUR, HEAVY, MOVE, PARRY, PLAYER_H, PLAYER_W, PLUNGE } from "./playerStats";

/** How long the kneeling pose at an altar lasts. */
const PRAY_FRAMES = 46;

export type PlayerState =
  | "idle"
  | "run"
  | "jump"
  | "fall"
  | "roll"
  | "attack"
  | "parry"
  | "hurt"
  | "heal"
  | "pray"
  | "dead";

export interface PlayerAbilities {
  doubleJump: boolean;
  sealBreaker: boolean;
}

export interface PlayerEvents {
  onDeath(): void;
  onParrySuccess(): void;
  onHealUsed(): void;
}

export class Player implements Damageable {
  readonly team = Team.Player;
  readonly body: Body;

  maxHealth = 6;
  health = 6;
  fervour = 0;
  /** Guilt shrinks the usable fervour pool until it is reclaimed. */
  fervourCap: number = FERVOUR.max;
  maxFlasks = 3;
  flasks = 3;
  flaskHeal = 3;
  tears = 0;

  facing = 1;
  dead = false;
  abilities: PlayerAbilities = { doubleJump: false, sealBreaker: false };

  state: PlayerState = "idle";
  stateFrame = 0;
  /** Set while an external system owns the player (transitions, cutscenes). */
  locked = false;

  private invuln = 0;
  private coyote = 0;
  private airJumpsLeft = 0;
  private rollCooldown = 0;
  private parryCooldown = 0;
  private riposte = 0;
  private parriedThisSwing = false;
  private comboIndex = 0;
  private comboQueued = false;
  private currentAttack: AttackDef | null = null;
  private attackIsRiposte = false;
  private hitSet = new Set<Damageable>();
  private animTime = 0;
  private wasGrounded = false;

  constructor(x: number, y: number, private readonly events: PlayerEvents) {
    this.body = makeBody(x, y, PLAYER_W, PLAYER_H);
  }

  get x(): number {
    return this.body.x;
  }

  get y(): number {
    return this.body.y;
  }

  get centerX(): number {
    return this.body.x + this.body.w / 2;
  }

  get centerY(): number {
    return this.body.y + this.body.h / 2;
  }

  get grounded(): boolean {
    return this.body.grounded;
  }

  get invulnerable(): boolean {
    return this.invuln > 0 || this.isRollInvulnerable();
  }

  get riposteReady(): boolean {
    return this.riposte > 0;
  }

  hurtbox(): Rect {
    // Crouched profile while rolling, which is half the reason rolls work.
    if (this.state === "roll") return rect(this.body.x, this.body.y + 12, this.body.w, this.body.h - 12);
    return bodyRect(this.body);
  }

  placeAt(x: number, y: number, facing = this.facing): void {
    this.body.x = x;
    this.body.y = y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.body.remX = 0;
    this.body.remY = 0;
    this.facing = facing;
    this.setState("idle");
  }

  /** Kneel at an altar: a short, uninterruptible recovery pose. */
  setPraying(): void {
    this.setState("pray");
    this.body.vx = 0;
  }

  fullRestore(): void {
    this.health = this.maxHealth;
    this.flasks = this.maxFlasks;
    this.fervour = 0;
    this.dead = false;
    this.invuln = 0;
    this.setState("idle");
  }

  private setState(next: PlayerState): void {
    this.state = next;
    this.stateFrame = 0;
  }

  private isRollInvulnerable(): boolean {
    return (
      this.state === "roll" &&
      this.stateFrame >= MOVE.rollIFrameStart &&
      this.stateFrame <= MOVE.rollIFrameEnd
    );
  }

  update(map: Tilemap, resolver: HitResolver): void {
    if (this.dead) {
      this.stateFrame++;
      this.applyGravity();
      this.body.vx = approach(this.body.vx, 0, MOVE.frictionGround);
      moveBody(this.body, map);
      return;
    }

    this.animTime++;
    if (this.invuln > 0) this.invuln--;
    if (this.rollCooldown > 0) this.rollCooldown--;
    if (this.parryCooldown > 0) this.parryCooldown--;
    if (this.riposte > 0) this.riposte--;
    if (this.fervour > this.fervourCap) this.fervour = this.fervourCap;

    if (this.locked) {
      this.body.vx = approach(this.body.vx, 0, MOVE.frictionGround);
      this.applyGravity();
      moveBody(this.body, map);
      return;
    }

    this.stateFrame++;

    if (this.body.grounded) {
      this.coyote = MOVE.coyoteFrames;
      this.airJumpsLeft = this.abilities.doubleJump ? 1 : 0;
    } else if (this.coyote > 0) {
      this.coyote--;
    }

    switch (this.state) {
      case "attack":
        this.updateAttack(resolver);
        break;
      case "parry":
        this.updateParry();
        break;
      case "roll":
        this.updateRoll(map);
        break;
      case "hurt":
        this.updateHurt();
        break;
      case "heal":
        this.updateHeal();
        break;
      case "pray":
        this.body.vx = approach(this.body.vx, 0, MOVE.frictionGround);
        if (this.stateFrame >= PRAY_FRAMES) this.setState("idle");
        break;
      default:
        this.updateFree();
        break;
    }

    this.applyGravity();
    moveBody(this.body, map);
    this.postMove(map);
  }

  // -- free movement -------------------------------------------------------

  private updateFree(): void {
    const dir = input.moveX;
    if (dir !== 0) this.facing = dir;

    const accel = this.body.grounded ? MOVE.accelGround : MOVE.accelAir;
    const friction = this.body.grounded ? MOVE.frictionGround : MOVE.frictionAir;
    if (dir !== 0) this.body.vx = approach(this.body.vx, dir * MOVE.runSpeed, accel);
    else this.body.vx = approach(this.body.vx, 0, friction);

    this.tryJump();
    // Each of these can take over the state machine; if one does, the
    // locomotion state below must not overwrite it.
    if (this.tryRoll() || this.tryAttack() || this.tryParry() || this.tryHeal()) return;

    const next: PlayerState = this.body.grounded
      ? Math.abs(this.body.vx) > 0.1
        ? "run"
        : "idle"
      : this.body.vy < 0
        ? "jump"
        : "fall";
    if (this.state !== next) this.setState(next);
  }

  private tryJump(): void {
    const canGround = this.coyote > 0;
    const canAir = !canGround && this.airJumpsLeft > 0;
    if (!canGround && !canAir) {
      this.applyJumpCut();
      return;
    }
    if (!input.consume("jump", MOVE.jumpBufferFrames)) {
      this.applyJumpCut();
      return;
    }

    if (canGround) {
      this.body.vy = MOVE.jumpVel;
      this.coyote = 0;
      fx.dust(this.centerX, this.body.y + this.body.h, 0, 5);
      playSfxVaried("jump");
    } else {
      this.body.vy = MOVE.doubleJumpVel;
      this.airJumpsLeft--;
      // The second jump is the traversal unlock, so it gets its own flourish.
      fx.souls(this.centerX, this.body.y + this.body.h - 4, PAL.goldPale, 8);
      playSfx("doubleJump");
    }
    this.setState("jump");
  }

  private applyJumpCut(): void {
    if (input.released("jump") && this.body.vy < 0) this.body.vy *= MOVE.jumpCutFactor;
  }

  private applyGravity(): void {
    const rising = Math.abs(this.body.vy) < MOVE.apexThreshold;
    // Lighter gravity near the apex gives the arc a floaty, readable peak.
    const g = rising ? MOVE.gravityApex : MOVE.gravity;
    this.body.vy = Math.min(this.body.vy + g, MOVE.maxFall);
  }

  private tryRoll(): boolean {
    if (this.rollCooldown > 0 || !this.body.grounded) return false;
    if (!input.consume("roll")) return false;
    this.setState("roll");
    this.body.vx = this.facing * MOVE.rollSpeed;
    fx.dust(this.centerX, this.body.y + this.body.h, -this.facing, 7);
    playSfxVaried("roll");
    return true;
  }

  private updateRoll(map: Tilemap): void {
    // Decelerate across the roll so it ends in a controlled recovery.
    const t = this.stateFrame / MOVE.rollFrames;
    this.body.vx = this.facing * MOVE.rollSpeed * (1 - t * 0.75);
    this.body.dropThrough = input.down("down");

    if (this.stateFrame >= MOVE.rollFrames) {
      this.body.dropThrough = false;
      this.rollCooldown = MOVE.rollCooldown;
      this.setState("idle");
      return;
    }
    // Cancel the tail of a roll into an attack for aggressive play.
    if (this.stateFrame > MOVE.rollIFrameEnd && input.consume("attack")) {
      this.rollCooldown = MOVE.rollCooldown;
      this.startAttack(COMBO[0], 0);
      return;
    }
    if (!floorAhead(this.body, this.facing, map) && this.stateFrame > MOVE.rollIFrameEnd) {
      this.body.vx *= 0.5;
    }
  }

  // -- attacks -------------------------------------------------------------

  private tryAttack(): boolean {
    if (input.consume("attack")) {
      // Holding down in the air converts the swing into a downward stab.
      this.startAttack(!this.body.grounded && input.down("down") ? PLUNGE : COMBO[0], this.body.grounded ? 0 : -1);
      return true;
    }
    if (input.consume("heavy")) {
      this.startAttack(HEAVY, -1);
      return true;
    }
    return false;
  }

  private startAttack(def: AttackDef, comboIndex: number): void {
    this.currentAttack = def;
    this.comboIndex = comboIndex;
    this.comboQueued = false;
    this.hitSet = new Set();
    this.attackIsRiposte = this.riposte > 0;
    if (this.attackIsRiposte) this.riposte = 0;
    this.setState("attack");
    if (input.moveX !== 0) this.facing = input.moveX;
    playSfxVaried(def.sfx, 0.07);
  }

  private updateAttack(resolver: HitResolver): void {
    const def = this.currentAttack;
    if (!def) {
      this.setState("idle");
      return;
    }
    const f = this.stateFrame - 1;
    const total = attackLength(def);

    // Steering is heavily damped mid-swing: attacks are commitments.
    if (this.body.grounded) {
      this.body.vx = approach(this.body.vx, 0, def.name === "plunge" ? 0.2 : 0.34);
    } else {
      this.body.vx = approach(this.body.vx, input.moveX * MOVE.runSpeed * 0.6, MOVE.accelAir * 0.6);
    }

    if (f === def.startup) {
      this.body.vx += this.facing * def.lunge;
      if (def.name === "plunge") this.body.vy = 5.4;
    }

    const activeUntil = def.startup + def.active;
    if (f >= def.startup && f < activeUntil) {
      resolver.submit(this.buildHit(def));
    }

    if (f >= def.cancelFrom && this.comboIndex >= 0 && input.consume("attack", 8)) this.comboQueued = true;

    // The plunge stays out until it lands or touches ground.
    if (def.name === "plunge" && this.body.grounded) {
      fx.dust(this.centerX, this.body.y + this.body.h, 0, 10);
      this.setState("idle");
      this.currentAttack = null;
      return;
    }

    if (f >= total - 1) {
      if (this.comboQueued && this.comboIndex >= 0 && this.comboIndex + 1 < COMBO.length) {
        this.startAttack(COMBO[this.comboIndex + 1], this.comboIndex + 1);
        return;
      }
      this.currentAttack = null;
      this.setState("idle");
    }
  }

  private buildHit(def: AttackDef): Hit {
    const originX = this.centerX;
    let box = rect(this.body.x + def.box.x, this.body.y + def.box.y, def.box.w, def.box.h);
    if (this.facing < 0) {
      const mirrored = flipRectAround(box, originX);
      box = rect(mirrored.x, mirrored.y, mirrored.w, mirrored.h);
    }
    const mult = this.attackIsRiposte ? PARRY.riposteMultiplier : 1;
    return makeHit(box, Team.Player, originX, this.hitSet, {
      damage: def.damage * mult,
      knockback: def.knockback * (this.attackIsRiposte ? 1.5 : 1),
      lift: def.lift,
      hitstop: def.hitstop + (this.attackIsRiposte ? 8 : 0),
      poise: def.poise * mult,
      parryable: false,
      onResolve: (result) => this.onAttackConnected(def, result),
    });
  }

  private onAttackConnected(def: AttackDef, result: HitResult): void {
    if (result === HitResult.Blocked) {
      // Guarded hits bounce the player back: shields must be opened, not ground down.
      this.body.vx = -this.facing * 1.8;
      fx.sparks(this.centerX + this.facing * 16, this.centerY, 8);
      return;
    }
    this.fervour = clamp(this.fervour + def.fervour, 0, this.fervourCap);
    if (this.attackIsRiposte) {
      fx.flash(PAL.goldPale, 6);
      fx.popText(this.centerX, this.body.y - 6, "riposte", PAL.gold);
      playSfx("riposte");
      this.attackIsRiposte = false;
    }
  }

  // -- parry ---------------------------------------------------------------

  private tryParry(): boolean {
    if (this.parryCooldown > 0) return false;
    if (!input.consume("parry")) return false;
    this.parriedThisSwing = false;
    this.setState("parry");
    this.body.vx *= 0.3;
    return true;
  }

  private updateParry(): void {
    this.body.vx = approach(this.body.vx, 0, this.body.grounded ? 0.35 : 0.05);
    if (this.stateFrame >= PARRY.totalFrames) {
      this.parryCooldown = PARRY.cooldown;
      this.setState("idle");
    }
  }

  private get parryActive(): boolean {
    return this.state === "parry" && this.stateFrame <= PARRY.activeFrames && !this.parriedThisSwing;
  }

  // -- healing -------------------------------------------------------------

  private tryHeal(): boolean {
    if (!input.consume("flask")) return false;
    if (this.flasks <= 0 || this.health >= this.maxHealth || !this.body.grounded) return false;
    this.flasks--;
    this.setState("heal");
    this.events.onHealUsed();
    return true;
  }

  private updateHeal(): void {
    this.body.vx = approach(this.body.vx, 0, MOVE.frictionGround);
    if (this.stateFrame === MOVE.healAtFrame) {
      this.health = clamp(this.health + this.flaskHeal, 0, this.maxHealth);
      fx.souls(this.centerX, this.centerY, PAL.bloodBright, 14);
      fx.popText(this.centerX, this.body.y - 8, `+${this.flaskHeal}`, PAL.bloodBright);
      playSfx("flask");
    }
    if (this.stateFrame >= MOVE.healFrames) this.setState("idle");
  }

  // -- damage --------------------------------------------------------------

  takeHit(hit: Hit): HitResult {
    if (this.dead || this.locked) return HitResult.Ignored;
    if (this.invuln > 0 || this.isRollInvulnerable()) return HitResult.Ignored;

    if (this.parryActive && hit.parryable) {
      const side = sign(hit.originX - this.centerX);
      // You must be facing the blow. Turning your back is punished.
      if (side === 0 || side === this.facing) {
        this.parrySuccess(hit);
        return HitResult.Parried;
      }
    }

    this.health -= hit.damage;
    const dir = sign(this.centerX - hit.originX) || -this.facing;
    this.body.vx = dir * MOVE.hurtKnockback;
    this.body.vy = Math.min(this.body.vy, -1.6);
    this.invuln = MOVE.invulnFrames;
    this.currentAttack = null;

    fx.hitstop(hit.hitstop + 4);
    fx.blood(this.centerX, this.centerY, dir, 12);
    fx.flash(PAL.blood, 6);
    playSfx("playerHurt");
    hapticHurt();

    if (this.health <= 0) {
      this.health = 0;
      this.die();
    } else {
      this.setState("hurt");
    }
    return HitResult.Hit;
  }

  private parrySuccess(hit: Hit): void {
    this.parriedThisSwing = true;
    this.riposte = PARRY.riposteWindow;
    this.fervour = clamp(this.fervour + PARRY.fervourGain, 0, this.fervourCap);
    this.body.vx = sign(this.centerX - hit.originX) * 0.9;

    fx.hitstop(PARRY.hitstop);
    fx.sparks(this.centerX + this.facing * 12, this.centerY - 2, 20);
    fx.flash(PAL.goldPale, 5);
    fx.popText(this.centerX, this.body.y - 4, "parry", PAL.goldPale);
    playSfx("parry");
    hapticParry();
    this.events.onParrySuccess();
  }

  /** Spikes and pits bypass parry and armour entirely. */
  takeEnvironmentDamage(amount: number): void {
    if (this.dead || this.invuln > 0) return;
    this.health -= amount;
    this.invuln = MOVE.invulnFrames;
    fx.blood(this.centerX, this.centerY, 0, 14);
    fx.flash(PAL.blood, 8);
    fx.hitstop(8);
    playSfx("playerHurt");
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    } else {
      this.setState("hurt");
      this.body.vy = -3.2;
    }
  }

  private updateHurt(): void {
    this.body.vx = approach(this.body.vx, 0, this.body.grounded ? 0.22 : 0.04);
    if (this.stateFrame >= MOVE.hurtFrames) this.setState("idle");
  }

  private die(): void {
    this.dead = true;
    this.setState("dead");
    this.body.vy = -3.4;
    fx.hitstop(18);
    fx.flash(PAL.blood, 14);
    fx.souls(this.centerX, this.centerY, PAL.guiltPale, 22);
    playSfx("playerDeath");
    hapticHeavy();
    this.events.onDeath();
  }

  private postMove(map: Tilemap): void {
    if (this.body.grounded && !this.wasGrounded && this.body.vy >= 0) {
      fx.dust(this.centerX, this.body.y + this.body.h, 0, 4);
      playSfxVaried("land", 0.08, 0.8);
    }
    this.wasGrounded = this.body.grounded;
    if (!input.down("down")) this.body.dropThrough = false;
    if (map.overlapsSpike(this.hurtbox())) this.takeEnvironmentDamage(2);
  }

  // -- rendering -----------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    // Flicker during i-frames, but stay solid while rolling so the dodge reads.
    if (this.invuln > 0 && this.state !== "roll" && Math.floor(this.invuln / 3) % 2 === 0) return;

    const px = Math.round(this.body.x - camX);
    const py = Math.round(this.body.y - camY);
    const f = this.facing;

    ctx.save();
    if (this.state === "roll") {
      // Tuck into a ball: shrink and spin the silhouette.
      const t = this.stateFrame / MOVE.rollFrames;
      ctx.translate(px + PLAYER_W / 2, py + PLAYER_H - 8);
      ctx.rotate(f * t * Math.PI * 2);
      ctx.translate(-6, -8);
      this.drawTucked(ctx);
      ctx.restore();
      return;
    }
    ctx.restore();

    silhouette(ctx, px, py - 4, PLAYER_W, PLAYER_H + 4);
    this.drawPenitent(ctx, px, py, f);
    if (this.state === "attack" && this.currentAttack) this.drawBlade(ctx, px, py, f, this.currentAttack);
    if (this.state === "parry") this.drawGuard(ctx, px, py, f);
    if (this.riposte > 0) this.drawRiposteAura(ctx, px, py);
  }

  private drawTucked(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(0, 0, 12, 14);
    ctx.fillStyle = PAL.cloth;
    ctx.fillRect(1, 2, 10, 8);
    ctx.fillStyle = PAL.bone;
    ctx.fillRect(3, 4, 6, 3);
  }

  private drawPenitent(ctx: CanvasRenderingContext2D, px: number, py: number, f: number): void {
    // Bob the body on the walk cycle and while idle-breathing.
    let bob = 0;
    if (this.state === "run") bob = Math.sin(this.animTime * 0.34) > 0 ? 1 : 0;
    else if (this.state === "idle") bob = Math.sin(this.animTime * 0.06) > 0.6 ? 1 : 0;
    const airborne = this.state === "jump" || this.state === "fall";

    const bx = px + 1;
    const by = py + bob;

    // Robe.
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(bx, by + 13, 10, 13);
    ctx.fillStyle = PAL.cloth;
    ctx.fillRect(bx + 1, by + 14, 8, 10);
    ctx.fillStyle = PAL.clothLit;
    ctx.fillRect(bx + (f > 0 ? 8 : 1), by + 14, 1, 10);
    // Hem shadow.
    ctx.fillStyle = PAL.void;
    ctx.fillRect(bx, by + 25, 10, 1);

    // Legs read as a split hem while running, together otherwise.
    ctx.fillStyle = PAL.clothDark;
    if (this.state === "run") {
      const swing = Math.sin(this.animTime * 0.34) * 2;
      ctx.fillRect(bx + 1 + swing, by + 23, 3, 3);
      ctx.fillRect(bx + 6 - swing, by + 23, 3, 3);
    } else if (airborne) {
      ctx.fillRect(bx + 1 - f, by + 22, 3, 4);
      ctx.fillRect(bx + 6 - f, by + 23, 3, 3);
    }

    // Sash.
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(bx, by + 17, 10, 1);

    // Capirote: the tall conical penitent's hood.
    ctx.fillStyle = PAL.clothDark;
    ctx.fillRect(bx + 2, by + 1, 6, 12);
    ctx.fillRect(bx + 3, by - 2, 4, 3);
    ctx.fillRect(bx + 4, by - 4, 2, 2);
    ctx.fillStyle = PAL.cloth;
    ctx.fillRect(bx + 3, by + 2, 4, 10);
    ctx.fillRect(bx + 4, by - 1, 2, 3);
    // Rim light down the leading edge of the hood.
    ctx.fillStyle = PAL.clothLit;
    ctx.fillRect(bx + (f > 0 ? 6 : 3), by + 2, 1, 10);

    // Face slit, shifted toward the facing direction.
    ctx.fillStyle = PAL.void;
    ctx.fillRect(bx + (f > 0 ? 5 : 2), by + 7, 3, 2);
    ctx.fillStyle = PAL.goldPale;
    ctx.fillRect(bx + (f > 0 ? 6 : 3), by + 7, 1, 1);
  }

  private drawBlade(ctx: CanvasRenderingContext2D, px: number, py: number, f: number, def: AttackDef): void {
    const frame = this.stateFrame - 1;
    const activeUntil = def.startup + def.active;
    const anticipating = frame < def.startup;
    const swinging = frame >= def.startup && frame < activeUntil;
    if (!anticipating && !swinging) return;

    const cx = px + PLAYER_W / 2;
    const cy = py + 12;

    if (def.name === "plunge") {
      ctx.fillStyle = swinging ? PAL.bone : PAL.boneDim;
      ctx.fillRect(cx - 1, py + 20, 2, swinging ? 16 : 9);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(cx - 3, py + 19, 6, 1);
      return;
    }

    // The blade sweeps from a wound-up angle through the swing.
    const t = anticipating ? -0.55 : (frame - def.startup) / Math.max(1, def.active);
    const angle = f > 0 ? -1.2 + t * 2.4 : Math.PI + 1.2 - t * 2.4;
    const reach = def.box.w * 0.78;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    if (swinging) {
      // Motion arc behind the blade.
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = this.attackIsRiposte ? PAL.goldPale : PAL.boneDim;
      ctx.fillRect(0, -4, reach, 8);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = swinging ? PAL.bone : PAL.boneDim;
    ctx.fillRect(2, -1, reach, 2);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(0, -3, 3, 6);
    ctx.restore();
  }

  private drawGuard(ctx: CanvasRenderingContext2D, px: number, py: number, f: number): void {
    const active = this.stateFrame <= PARRY.activeFrames;
    const gx = px + (f > 0 ? PLAYER_W - 1 : -6);
    ctx.fillStyle = active ? PAL.goldPale : PAL.stoneLit;
    ctx.fillRect(gx, py + 6, 7, 14);
    ctx.fillStyle = active ? PAL.gold : PAL.stone;
    ctx.fillRect(gx + (f > 0 ? 0 : 5), py + 6, 2, 14);
    if (active) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = PAL.goldPale;
      ctx.fillRect(gx - 2, py + 4, 11, 18);
      ctx.globalAlpha = 1;
    }
  }

  private drawRiposteAura(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    const pulse = 0.55 + Math.sin(this.animTime * 0.4) * 0.3;
    radialGlow(ctx, px + PLAYER_W / 2, py + PLAYER_H / 2, 26, PAL.gold, pulse * 0.35);
    outlineRect(ctx, px - 2, py - 6, PLAYER_W + 4, PLAYER_H + 8, PAL.goldPale, pulse);
  }
}
