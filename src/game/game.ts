import { input } from "../core/input";
import { Loop } from "../core/loop";
import { audio } from "../engine/audio";
import { clear, createScreen, VIEW_H, VIEW_W } from "../engine/canvas";
import { drawText, drawTextShadow } from "../engine/font";
import { fx } from "../engine/fx";
import { PAL } from "../content/palette";
import { playSfx, SFX } from "../content/sfx";
import { BOSS_NAME } from "./enemies/boss";
import { music } from "./music";
import { drawHud } from "./ui/hud";
import { drawMapScreen } from "./ui/mapscreen";
import { drawDeath, drawPause, drawTitle, drawVictory } from "./ui/screens";
import { World } from "./world";

type Scene = "title" | "playing" | "paused" | "map" | "dead" | "victory";

/** Frames the reset key must be held on the title screen before wiping a save. */
const RESET_HOLD_FRAMES = 60;

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly loop: Loop;
  private world: World;
  private scene: Scene = "title";
  private time = 0;
  private hasSave: boolean;
  private resetHeld = 0;
  private resetKeyDown = false;
  /** Frames left showing the volume readout after a change. */
  private audioHud = 0;

  constructor(parent: HTMLElement) {
    const screen = createScreen(parent);
    this.ctx = screen.ctx;
    input.attach(window);
    // Browsers hold audio until a gesture, so unlock on the first real input.
    const unlock = (): void => audio.unlock();
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
    // The title screen offers a reset, which is not worth a whole action binding.
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyR") this.resetKeyDown = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "KeyR") this.resetKeyDown = false;
    });

    this.world = new World();
    this.hasSave = this.world.progression.data.deaths > 0 || this.world.progression.visitedRooms.size > 1;

    this.loop = new Loop({ update: () => this.update(), render: () => this.render() });
  }

  start(): void {
    this.loop.start();
  }

  /** Exposed for smoke tests and for poking at state from the console. */
  get debug(): {
    scene: Scene;
    world: World;
    audio: typeof audio;
    music: typeof music;
    playSfx: typeof playSfx;
    sfxNames: string[];
  } {
    return { scene: this.scene, world: this.world, audio, music, playSfx, sfxNames: Object.keys(SFX) };
  }

  private update(): void {
    input.beginFrame();
    this.time++;
    this.updateAudioControls();
    // The score is scheduled against the audio clock, so it must tick in every
    // scene -- including while paused or reading the map.
    music.update();

    switch (this.scene) {
      case "title":
        this.updateTitle();
        break;
      case "playing":
        this.updatePlaying();
        break;
      case "paused":
        if (input.consume("pause")) {
          this.scene = "playing";
          playSfx("uiClose");
        }
        break;
      case "map":
        fx.update();
        if (input.consume("map") || input.consume("pause")) {
          this.scene = "playing";
          playSfx("uiClose");
        }
        break;
      case "dead":
        this.world.update();
        if (this.world.deathPromptReady && (input.consume("confirm") || input.consume("jump"))) {
          playSfx("uiConfirm");
          this.world.respawn();
          this.scene = "playing";
        }
        break;
      case "victory":
        this.world.update();
        if (input.consume("pause") || input.consume("confirm")) {
          playSfx("uiConfirm");
          this.world = new World();
          this.scene = "title";
        }
        break;
    }
  }

  /** Mute and volume work in any scene. */
  private updateAudioControls(): void {
    if (this.audioHud > 0) this.audioHud--;
    if (input.consume("mute")) {
      audio.toggleMute();
      this.audioHud = 110;
      if (!audio.muted) playSfx("uiConfirm");
    }
    const step = input.consume("volumeUp") ? 0.1 : input.consume("volumeDown") ? -0.1 : 0;
    if (step !== 0) {
      audio.setVolume(audio.volume + step);
      if (audio.muted) audio.setMuted(false);
      this.audioHud = 110;
      playSfx("uiOpen");
    }
  }

  private updateTitle(): void {
    fx.update();
    music.set("title");
    if (this.resetKeyDown) {
      this.resetHeld++;
      if (this.resetHeld >= RESET_HOLD_FRAMES) {
        this.world.newGame();
        this.hasSave = false;
        this.resetHeld = 0;
        this.resetKeyDown = false;
      }
    } else {
      this.resetHeld = 0;
    }

    if (input.consume("confirm") || input.consume("jump")) {
      // Drop any buffered press so the pilgrim does not jump on the first frame.
      input.flush("jump");
      playSfx("uiConfirm");
      this.scene = "playing";
    }
  }

  private updatePlaying(): void {
    if (input.consume("pause")) {
      this.scene = "paused";
      playSfx("uiOpen");
      return;
    }
    if (input.consume("map")) {
      this.scene = "map";
      playSfx("uiOpen");
      return;
    }

    this.world.update();

    if (this.world.state === "dying") this.scene = "dead";
    else if (this.world.state === "victory") this.scene = "victory";
  }

  private render(): void {
    clear(this.ctx, PAL.void);
    this.world.render(this.ctx);

    if (this.scene !== "title" && this.scene !== "map") {
      drawHud(this.ctx, this.world.player, {
        tears: this.world.player.tears,
        hasGuilt: this.world.progression.guilt !== null,
        boss: this.world.boss,
        bossName: BOSS_NAME,
      });
    }

    switch (this.scene) {
      case "title":
        drawTitle(this.ctx, this.hasSave, this.time);
        if (this.resetHeld > 0) this.drawResetMeter();
        break;
      case "paused":
        drawPause(this.ctx);
        break;
      case "map":
        drawMapScreen(this.ctx, this.world.progression, this.world.room.id);
        break;
      case "dead":
        drawDeath(this.ctx, this.world.progression, this.world.deathPromptReady, this.time);
        break;
      case "victory":
        drawVictory(this.ctx, this.world.progression, this.time);
        break;
      case "playing":
        break;
    }

    if (this.audioHud > 0) this.drawAudioHud();
  }

  private drawAudioHud(): void {
    const w = 74;
    const x = VIEW_W - w - 8;
    const y = VIEW_H - 16;
    const label = audio.muted ? "muted" : `sound ${Math.round(audio.volume * 100)}%`;

    this.ctx.globalAlpha = Math.min(1, this.audioHud / 30);
    this.ctx.fillStyle = "rgba(7,5,10,0.8)";
    this.ctx.fillRect(x - 4, y - 4, w + 8, 15);
    drawText(this.ctx, label, x, y - 1, audio.muted ? PAL.uiDim : PAL.ui, 1, "left");
    this.ctx.fillStyle = PAL.stoneDark;
    this.ctx.fillRect(x, y + 7, w, 2);
    if (!audio.muted) {
      this.ctx.fillStyle = PAL.gold;
      this.ctx.fillRect(x, y + 7, Math.round(w * audio.volume), 2);
    }
    this.ctx.globalAlpha = 1;
  }

  private drawResetMeter(): void {
    const w = Math.round((this.resetHeld / RESET_HOLD_FRAMES) * 120);
    this.ctx.fillStyle = PAL.stoneDark;
    this.ctx.fillRect(VIEW_W / 2 - 60, VIEW_H - 22, 120, 3);
    this.ctx.fillStyle = PAL.blood;
    this.ctx.fillRect(VIEW_W / 2 - 60, VIEW_H - 22, w, 3);
    drawTextShadow(this.ctx, "erasing...", VIEW_W / 2, VIEW_H - 34, PAL.bloodBright, 1, "center");
  }
}
