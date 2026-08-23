export type Action =
  | "left"
  | "right"
  | "up"
  | "down"
  | "jump"
  | "attack"
  | "heavy"
  | "parry"
  | "roll"
  | "flask"
  | "map"
  | "pause"
  | "confirm"
  | "mute"
  | "volumeDown"
  | "volumeUp";

const KEY_BINDINGS: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "jump",
  KeyZ: "jump",
  KeyJ: "attack",
  KeyX: "attack",
  KeyK: "heavy",
  KeyC: "heavy",
  KeyL: "parry",
  KeyV: "parry",
  ShiftLeft: "roll",
  ShiftRight: "roll",
  KeyQ: "flask",
  Tab: "map",
  Escape: "pause",
  Enter: "confirm",
  KeyM: "mute",
  Minus: "volumeDown",
  Equal: "volumeUp",
};

/** Standard-gamepad button index -> action. */
const PAD_BINDINGS: Record<number, Action> = {
  0: "jump", // A
  2: "attack", // X
  3: "heavy", // Y
  1: "roll", // B
  5: "parry", // RB
  7: "parry", // RT
  4: "flask", // LB
  8: "map", // select
  9: "pause", // start
  // Menus also accept the jump button as confirm, so no separate binding.
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

const NEVER = -9999;

export class Input {
  private held = new Set<Action>();
  private pressedAt = new Map<Action, number>();
  private releasedAt = new Map<Action, number>();
  private consumedAt = new Map<Action, number>();
  private frame = 0;
  private padIndex: number | null = null;
  private padPrev = new Set<Action>();

  attach(target: EventTarget = window): void {
    target.addEventListener("keydown", (e) => this.onKey(e as KeyboardEvent, true));
    target.addEventListener("keyup", (e) => this.onKey(e as KeyboardEvent, false));
    window.addEventListener("blur", () => this.releaseAll());
    window.addEventListener("gamepadconnected", (e) => {
      this.padIndex = (e as GamepadEvent).gamepad.index;
    });
    window.addEventListener("gamepaddisconnected", () => {
      this.padIndex = null;
    });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const action = KEY_BINDINGS[e.code];
    if (!action) return;
    // Tab/Space/arrows would otherwise scroll or move focus out of the canvas.
    e.preventDefault();
    if (down) {
      if (e.repeat) return;
      this.press(action);
    } else {
      this.release(action);
    }
  }

  private press(action: Action): void {
    if (this.held.has(action)) return;
    this.held.add(action);
    this.pressedAt.set(action, this.frame);
  }

  private release(action: Action): void {
    if (!this.held.delete(action)) return;
    this.releasedAt.set(action, this.frame);
  }

  private releaseAll(): void {
    for (const action of [...this.held]) this.release(action);
  }

  /** Call once per fixed update, before game logic reads the input. */
  beginFrame(): void {
    this.frame++;
    this.pollGamepad();
  }

  private pollGamepad(): void {
    if (this.padIndex === null || !navigator.getGamepads) return;
    const pad = navigator.getGamepads()[this.padIndex];
    if (!pad) return;

    const now = new Set<Action>();
    for (let i = 0; i < pad.buttons.length; i++) {
      const action = PAD_BINDINGS[i];
      if (action && pad.buttons[i]?.pressed) now.add(action);
    }
    const [ax = 0, ay = 0] = pad.axes;
    if (ax < -0.4) now.add("left");
    if (ax > 0.4) now.add("right");
    if (ay < -0.4) now.add("up");
    if (ay > 0.4) now.add("down");

    for (const action of now) if (!this.padPrev.has(action)) this.press(action);
    for (const action of this.padPrev) if (!now.has(action)) this.release(action);
    this.padPrev = now;
  }

  down(action: Action): boolean {
    return this.held.has(action);
  }

  /** True on the single frame the action went down. */
  pressed(action: Action): boolean {
    return this.pressedAt.get(action) === this.frame;
  }

  released(action: Action): boolean {
    return this.releasedAt.get(action) === this.frame;
  }

  /**
   * True if the action was pressed within the last `window` frames and has not
   * been consumed yet. Consuming it prevents one press from firing twice --
   * this is what makes jump/attack inputs feel forgiving near state changes.
   */
  consume(action: Action, window = 6): boolean {
    const at = this.pressedAt.get(action) ?? NEVER;
    if (this.frame - at >= window) return false;
    if ((this.consumedAt.get(action) ?? NEVER) === at) return false;
    this.consumedAt.set(action, at);
    return true;
  }

  /** Discard any buffered press, e.g. when entering a menu. */
  flush(action: Action): void {
    const at = this.pressedAt.get(action);
    if (at !== undefined) this.consumedAt.set(action, at);
  }

  /** -1, 0 or 1 from the horizontal keys. */
  get moveX(): number {
    return (this.down("right") ? 1 : 0) - (this.down("left") ? 1 : 0);
  }

  get moveY(): number {
    return (this.down("down") ? 1 : 0) - (this.down("up") ? 1 : 0);
  }
}

export const input = new Input();
