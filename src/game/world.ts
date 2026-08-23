import { input } from "../core/input";
import { rect } from "../core/math";
import { Camera } from "../engine/camera";
import { VIEW_H, VIEW_W } from "../engine/canvas";
import { drawBackdrop } from "../engine/backdrop";
import { drawTextShadow } from "../engine/font";
import { fx } from "../engine/fx";
import { TILE } from "../engine/tilemap";
import { PAL } from "../content/palette";
import { findRoom, START_ROOM, type DoorDef } from "../content/rooms";
import { HitResolver, type Damageable } from "./combat";
import type { Boss } from "./enemies/boss";
import { Player } from "./player";
import { Progression } from "./progression";
import { Room, type ItemInstance } from "./room";

const FADE_FRAMES = 13;
const DEATH_HOLD = 110;
const ROOM_TITLE_FRAMES = 150;

export type WorldState = "playing" | "transition" | "dying" | "victory";

interface Transition {
  phase: "out" | "in";
  frames: number;
  target: { room: string; door: string } | null;
}

/**
 * Owns the run: the player, the room they are standing in, movement between
 * rooms, altars, pickups and the guilt left behind on death.
 */
export class World {
  readonly progression = new Progression();
  readonly camera = new Camera();
  readonly resolver = new HitResolver();

  player!: Player;
  room!: Room;
  state: WorldState = "playing";

  time = 0;
  message = "";
  private messageFrames = 0;
  private roomTitleFrames = 0;
  private transition: Transition | null = null;
  private deathFrames = 0;
  private targets: Damageable[] = [];

  constructor() {
    this.progression.load();
    this.beginRun();
  }

  /** Start (or restart) from the current checkpoint. */
  beginRun(): void {
    const checkpoint = this.progression.data.checkpoint;
    this.player = new Player(0, 0, {
      onDeath: () => this.onPlayerDeath(),
      onParrySuccess: () => this.camera.addShake(2.5),
      onHealUsed: () => this.progression.save(),
    });
    this.syncPlayerFromSave();

    const roomId = findRoom(checkpoint.room) ? checkpoint.room : START_ROOM;
    this.loadRoom(roomId, null);
    this.placeAtCheckpoint();
    this.state = "playing";
    this.deathFrames = 0;
    this.transition = null;
    fx.clear();
  }

  newGame(): void {
    this.progression.reset();
    this.beginRun();
  }

  private syncPlayerFromSave(): void {
    const d = this.progression.data;
    this.player.maxHealth = d.maxHealth;
    this.player.maxFlasks = d.maxFlasks;
    this.player.tears = d.tears;
    this.player.abilities = { ...d.abilities };
    this.player.fervourCap = this.progression.fervourCap;
    this.player.fullRestore();
  }

  private loadRoom(roomId: string, door: DoorDef | null): void {
    this.room = new Room(findRoom(roomId), this.progression);
    this.progression.visit(roomId);
    this.camera.setBounds(this.room.map.widthPx, this.room.map.heightPx);
    this.roomTitleFrames = ROOM_TITLE_FRAMES;

    if (door) {
      const feetY = (door.spawn.ty + 1) * TILE;
      this.player.placeAt(door.spawn.tx * TILE, feetY - this.player.body.h, door.spawn.facing);
    }
    this.camera.snapTo(this.player.centerX, this.player.centerY);
    this.rebuildTargets();
  }

  private placeAtCheckpoint(): void {
    const altar = this.room.altars[this.progression.data.checkpoint.altar] ?? this.room.altars[0];
    if (altar) {
      this.player.placeAt(altar.x - this.player.body.w / 2, altar.y - this.player.body.h, 1);
    } else {
      this.player.placeAt(this.room.playerSpawn.x, this.room.playerSpawn.y, 1);
    }
    this.camera.snapTo(this.player.centerX, this.player.centerY);
  }

  private rebuildTargets(): void {
    this.targets = [this.player, ...this.room.enemies];
  }

  get boss(): Boss | null {
    return this.room.boss;
  }

  // -- update --------------------------------------------------------------

  update(): void {
    this.time++;
    fx.update();
    if (this.messageFrames > 0) this.messageFrames--;
    if (this.roomTitleFrames > 0) this.roomTitleFrames--;

    if (this.transition) {
      this.updateTransition();
      this.camera.update();
      return;
    }

    if (this.state === "dying") {
      this.updateDying();
      this.camera.update();
      return;
    }

    // Hitstop freezes gameplay but not particles or the camera, so impacts
    // hang for a beat without the game appearing to lock up.
    if (!fx.frozen) {
      this.player.update(this.room.map, this.resolver);
      this.room.update(this.player, this.resolver);
      this.rebuildTargets();
      this.resolver.resolve(this.targets);
      this.handleInteractions();
    } else {
      this.resolver.clear();
    }

    this.camera.follow(this.player.centerX, this.player.centerY, this.player.facing, this.player.grounded);
    this.camera.update();

    if (this.progression.data.bossDefeated && this.room.isBossRoom && !this.room.boss) {
      this.state = "victory";
    }
  }

  private handleInteractions(): void {
    if (this.player.dead) return;
    const box = this.player.hurtbox();

    const item = this.room.itemAt(box);
    if (item) this.collect(item);

    const guilt = this.progression.guilt;
    if (guilt && guilt.room === this.room.id) {
      if (this.player.centerX > guilt.x - 14 && this.player.centerX < guilt.x + 14 &&
          this.player.centerY > guilt.y - 22 && this.player.centerY < guilt.y + 22) {
        this.reclaimGuilt();
      }
    }

    const altar = this.room.altarNear(box);
    if (altar && this.player.grounded && input.pressed("up")) this.prayAt(altar.index);

    const door = this.room.doorAt(box);
    if (door) this.tryUseDoor(door);
  }

  private collect(item: ItemInstance): void {
    item.taken = true;
    this.progression.markCollected(item.id);
    const d = this.progression.data;

    switch (item.kind) {
      case "doubleJump":
        d.abilities.doubleJump = true;
        this.player.abilities.doubleJump = true;
        this.say("the second breath -- press jump again in the air");
        break;
      case "sealBreaker":
        d.abilities.sealBreaker = true;
        this.player.abilities.sealBreaker = true;
        this.room.refreshGates();
        this.say("seal breaker -- warded gates will open now");
        break;
      case "flask":
        d.maxFlasks++;
        this.player.maxFlasks = d.maxFlasks;
        this.player.flasks = d.maxFlasks;
        this.say("bile flask -- one more draught");
        break;
      case "heart":
        d.maxHealth += 2;
        this.player.maxHealth = d.maxHealth;
        this.player.health = d.maxHealth;
        this.say("a heart of the wound -- vigour grows");
        break;
      case "tears":
        d.tears += 25;
        this.player.tears = d.tears;
        this.say("tears of atonement +25");
        break;
    }

    fx.souls(item.x, item.y, PAL.goldPale, 18);
    fx.flash(PAL.goldPale, 8);
    fx.hitstop(6);
    this.progression.save();
  }

  private reclaimGuilt(): void {
    const recovered = this.progression.clearGuilt();
    this.player.fervourCap = this.progression.fervourCap;
    this.player.tears = this.progression.data.tears;
    fx.souls(this.player.centerX, this.player.centerY, PAL.guiltPale, 26);
    fx.flash(PAL.guiltPale, 10);
    this.say(recovered > 0 ? `guilt absolved -- ${recovered} tears returned` : "guilt absolved");
    this.progression.save();
  }

  private prayAt(altarIndex: number): void {
    this.progression.setCheckpoint(this.room.id, altarIndex);
    this.progression.data.tears = this.player.tears;
    this.progression.save();

    this.player.setPraying();
    this.player.fullRestore();
    this.player.fervourCap = this.progression.fervourCap;
    this.room.respawnEnemies();
    this.room.refreshGates();
    this.rebuildTargets();

    fx.souls(this.player.centerX, this.player.centerY, PAL.goldPale, 24);
    fx.flash(PAL.goldPale, 10);
    this.say("you kneel. the hollow ones return.");
  }

  private tryUseDoor(door: DoorDef): void {
    if (door.requires && !this.progression.data.abilities[door.requires]) {
      const need = door.requires === "doubleJump" ? "the second breath" : "the seal breaker";
      this.say(`sealed -- you lack ${need}`);
      return;
    }
    this.transition = { phase: "out", frames: FADE_FRAMES, target: door.to };
    this.player.locked = true;
  }

  private updateTransition(): void {
    const t = this.transition;
    if (!t) return;
    t.frames--;
    this.player.update(this.room.map, this.resolver);
    this.resolver.clear();

    if (t.frames > 0) return;

    if (t.phase === "out" && t.target) {
      const target = findRoom(t.target.room);
      const door = target.doors.find((d) => d.id === t.target!.door) ?? null;
      this.loadRoom(target.id, door);
      t.phase = "in";
      t.frames = FADE_FRAMES;
      t.target = null;
      return;
    }
    this.transition = null;
    this.player.locked = false;
  }

  private onPlayerDeath(): void {
    this.state = "dying";
    this.deathFrames = 0;
    this.camera.addShake(6);
    this.progression.recordDeath(this.room.id, this.player.centerX, this.player.centerY, this.player.tears);
    this.progression.save();
  }

  private updateDying(): void {
    this.deathFrames++;
    if (!fx.frozen) {
      this.player.update(this.room.map, this.resolver);
      this.room.update(this.player, this.resolver);
      this.resolver.clear();
    }
    this.camera.follow(this.player.centerX, this.player.centerY, this.player.facing, this.player.grounded);
  }

  /** True once the death animation has played long enough to show the prompt. */
  get deathPromptReady(): boolean {
    return this.state === "dying" && this.deathFrames > DEATH_HOLD;
  }

  respawn(): void {
    const checkpoint = this.progression.data.checkpoint;
    this.syncPlayerFromSave();
    this.loadRoom(checkpoint.room, null);
    this.placeAtCheckpoint();
    this.state = "playing";
    this.deathFrames = 0;
    fx.clear();
    this.say("you wake at the altar. your guilt remains where you fell.");
  }

  say(text: string): void {
    this.message = text;
    this.messageFrames = 190;
  }

  // -- render --------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    const camX = this.camera.renderX;
    const camY = this.camera.renderY;

    drawBackdrop(ctx, this.room.mood, camX, camY, this.time);
    this.room.renderBehind(ctx, camX, camY, this.time);
    this.renderGuilt(ctx, camX, camY);
    this.room.map.render(ctx, camX, camY, VIEW_W, VIEW_H);
    this.room.renderFront(ctx, camX, camY, this.time);
    this.player.render(ctx, camX, camY);
    fx.renderParticles(ctx, camX, camY);

    fx.eachText(
      (x, y, text, color, alpha) => {
        ctx.globalAlpha = alpha;
        drawTextShadow(ctx, text, x, y, color, 1, "center");
        ctx.globalAlpha = 1;
      },
      camX,
      camY,
    );

    fx.renderFlash(ctx, VIEW_W, VIEW_H);
    this.renderRoomTitle(ctx);
    this.renderMessage(ctx);
    this.renderFade(ctx);
  }

  private renderGuilt(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const guilt = this.progression.guilt;
    if (!guilt || guilt.room !== this.room.id) return;
    const px = Math.round(guilt.x - camX);
    const py = Math.round(guilt.y - camY);
    const pulse = Math.sin(this.time * 0.08);

    ctx.globalAlpha = 0.18 + pulse * 0.07;
    ctx.fillStyle = PAL.guilt;
    ctx.fillRect(px - 16, py - 22, 32, 40);
    ctx.globalAlpha = 1;

    // A kneeling shade of the player, marking where they fell.
    ctx.fillStyle = PAL.guilt;
    ctx.fillRect(px - 5, py - 4, 10, 14);
    ctx.fillRect(px - 3, py - 14, 6, 11);
    ctx.fillStyle = PAL.guiltPale;
    ctx.fillRect(px - 2, py - 18, 4, 5);
    ctx.fillRect(px - 1, py - 8 + Math.round(pulse), 2, 2);
    if (this.time % 10 === 0) fx.embers(guilt.x, guilt.y - 12, 1);
  }

  private renderRoomTitle(ctx: CanvasRenderingContext2D): void {
    if (this.roomTitleFrames <= 0) return;
    const t = this.roomTitleFrames;
    const alpha = Math.min(1, t / 40) * Math.min(1, (ROOM_TITLE_FRAMES - t) / 20 + 0.2);
    ctx.globalAlpha = Math.min(1, alpha);
    drawTextShadow(ctx, this.room.name, VIEW_W / 2, 44, PAL.ui, 1, "center");
    ctx.fillStyle = PAL.uiDim;
    ctx.fillRect(VIEW_W / 2 - 46, 54, 92, 1);
    ctx.globalAlpha = 1;
  }

  private renderMessage(ctx: CanvasRenderingContext2D): void {
    if (this.messageFrames <= 0) return;
    ctx.globalAlpha = Math.min(1, this.messageFrames / 40);
    const y = VIEW_H - 40;
    ctx.fillStyle = "rgba(7,5,10,0.72)";
    ctx.fillRect(0, y - 5, VIEW_W, 16);
    drawTextShadow(ctx, this.message, VIEW_W / 2, y, PAL.goldPale, 1, "center");
    ctx.globalAlpha = 1;
  }

  private renderFade(ctx: CanvasRenderingContext2D): void {
    if (!this.transition) return;
    const t = this.transition;
    const progress = t.phase === "out" ? 1 - t.frames / FADE_FRAMES : t.frames / FADE_FRAMES;
    ctx.globalAlpha = Math.max(0, Math.min(1, progress));
    ctx.fillStyle = PAL.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }

  /** Bounds helper used by the map screen. */
  roomRect(): { x: number; y: number; w: number; h: number } {
    return rect(0, 0, this.room.map.widthPx, this.room.map.heightPx);
  }
}
