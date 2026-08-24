import { input, type Action } from "../core/input";

/**
 * On-screen controls for phones.
 *
 * Two things make or break a touch layer for this game:
 *
 *  - **Genuine multi-touch.** You must be able to hold left, swing, and parry
 *    at once. Pointers are tracked individually and the pressed set is the
 *    union across all of them.
 *  - **Sliding between buttons.** Hit-testing runs on every pointer move, not
 *    just on the initial down, so rolling a thumb from attack onto parry
 *    registers as a real press. Per-element listeners cannot do this.
 *
 * The layer injects its own styles so it works unchanged in the web build, the
 * artifact embed, and the packaged app.
 */

const STYLE_ID = "penitence-touch-style";

const CSS = `
.pnt-touch {
  position: absolute;
  inset: 0;
  z-index: 5;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  pointer-events: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.pnt-touch[hidden] { display: none; }

.pnt-btn, .pnt-pad {
  position: absolute;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid rgba(230, 218, 196, 0.28);
  background: rgba(20, 14, 25, 0.42);
  color: rgba(230, 218, 196, 0.82);
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.45);
  transition: background 90ms linear, transform 90ms ease-out, border-color 90ms linear;
}
.pnt-btn svg { width: 46%; height: 46%; display: block; }
.pnt-btn[data-on="1"] {
  background: rgba(140, 60, 70, 0.66);
  border-color: rgba(240, 209, 138, 0.9);
  transform: scale(0.93);
}
/* Parry is the mechanic the game is built on, so it reads as the gold one. */
.pnt-btn[data-key="parry"] { border-color: rgba(217, 164, 65, 0.6); }
.pnt-btn[data-key="parry"][data-on="1"] { background: rgba(217, 164, 65, 0.72); color: #16101a; }

.pnt-pad {
  border-radius: 18%;
  background: rgba(20, 14, 25, 0.34);
}
.pnt-pad .pnt-nub {
  position: absolute;
  width: 26%;
  height: 26%;
  border-radius: 50%;
  background: rgba(230, 218, 196, 0.42);
  transition: transform 60ms linear;
  pointer-events: none;
}
.pnt-pad .pnt-hint {
  position: absolute;
  color: rgba(230, 218, 196, 0.3);
  font-size: 13px;
  line-height: 1;
  pointer-events: none;
}
.pnt-hint-l { left: 8%; top: 50%; transform: translateY(-50%); }
.pnt-hint-r { right: 8%; top: 50%; transform: translateY(-50%); }
.pnt-hint-u { top: 7%; left: 50%; transform: translateX(-50%); }
.pnt-hint-d { bottom: 7%; left: 50%; transform: translateX(-50%); }

.pnt-pad .pnt-cross {
  position: absolute;
  inset: 12%;
  border: 1px solid rgba(230, 218, 196, 0.16);
  border-radius: 12%;
  pointer-events: none;
}

.pnt-chip {
  position: absolute;
  min-width: 44px;
  height: 30px;
  padding: 0 9px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  border: 1px solid rgba(230, 218, 196, 0.22);
  background: rgba(20, 14, 25, 0.5);
  color: rgba(230, 218, 196, 0.75);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.pnt-chip[data-on="1"] { background: rgba(217, 164, 65, 0.6); color: #16101a; }

.pnt-rotate {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: grid;
  place-items: center;
  gap: 14px;
  background: #07050a;
  color: #e6dac4;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 24px;
}
.pnt-rotate[hidden] { display: none; }
.pnt-rotate .pnt-phone {
  width: 54px; height: 90px;
  border: 2px solid rgba(217, 164, 65, 0.8);
  border-radius: 8px;
  animation: pnt-turn 2.4s ease-in-out infinite;
}
@keyframes pnt-turn {
  0%, 40% { transform: rotate(0deg); }
  60%, 100% { transform: rotate(-90deg); }
}
@media (prefers-reduced-motion: reduce) {
  .pnt-rotate .pnt-phone { animation: none; transform: rotate(-90deg); }
}
`;

/** Icons drawn as inline SVG; words do not fit legibly in a thumb-sized circle. */
const ICONS: Record<string, string> = {
  // A blade with a crossguard and pommel. An abstract slash reads as an arrow.
  attack: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 2.5 L20.5 4.5 L10 15 L8 15 L8 13 Z" fill="currentColor" stroke="none"/><path d="M8.4 13.6 L4 18"/><path d="M2.2 16.4 L5.6 19.8"/><path d="M3.6 20.4 L2 22"/></svg>`,
  // The same blade with impact lines, so heavy reads as a bigger version.
  heavy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 3.5 L20.5 6.5 L11 16 L8 16 L8 13 Z" fill="currentColor" stroke="none"/><path d="M8.4 14.6 L5 18"/><path d="M3.2 16.4 L6.6 19.8"/><path d="M2 9 L5 10"/><path d="M3 5 L5.5 7"/><path d="M7 2 L8 5"/></svg>`,
  parry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3 L20 6 V12 C20 16.5 16.5 19.8 12 21.5 C7.5 19.8 4 16.5 4 12 V6 Z"/></svg>`,
  jump: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20 V5"/><path d="M5 12 L12 5 L19 12"/></svg>`,
  roll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 12 A8 8 0 1 1 12 4"/><path d="M12 1.5 L16 4 L12 6.5"/></svg>`,
  flask: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 3 H15 V9 L20 19 A2 2 0 0 1 18 21.5 H6 A2 2 0 0 1 4 19 Z"/><path d="M6.5 14 H17.5"/></svg>`,
};

interface ButtonSpec {
  action: Action;
  icon: string;
  /** CSS positioning, applied verbatim. */
  css: Partial<CSSStyleDeclaration>;
  size: string;
}

/**
 * Right-hand cluster laid out as a diamond under the thumb: jump and attack in
 * the two most reachable spots, parry directly above attack, roll above jump.
 * Heavy and flask sit further out because they are used deliberately, not in
 * a scramble.
 */
const BUTTONS: readonly ButtonSpec[] = [
  { action: "jump", icon: "jump", size: "var(--pnt-lg)", css: { right: "calc(var(--pnt-edge))", bottom: "calc(var(--pnt-edge) + var(--pnt-lg) * 0.15)" } },
  { action: "attack", icon: "attack", size: "var(--pnt-lg)", css: { right: "calc(var(--pnt-edge) + var(--pnt-lg) * 1.12)", bottom: "calc(var(--pnt-edge) + var(--pnt-lg) * 0.62)" } },
  { action: "parry", icon: "parry", size: "var(--pnt-md)", css: { right: "calc(var(--pnt-edge) + var(--pnt-lg) * 1.24)", bottom: "calc(var(--pnt-edge) + var(--pnt-lg) * 1.72)" } },
  { action: "roll", icon: "roll", size: "var(--pnt-md)", css: { right: "calc(var(--pnt-edge) + var(--pnt-lg) * 0.06)", bottom: "calc(var(--pnt-edge) + var(--pnt-lg) * 1.3)" } },
  { action: "heavy", icon: "heavy", size: "var(--pnt-sm)", css: { right: "calc(var(--pnt-edge) + var(--pnt-lg) * 2.15)", bottom: "calc(var(--pnt-edge) + var(--pnt-lg) * 1.5)" } },
  { action: "flask", icon: "flask", size: "var(--pnt-sm)", css: { right: "calc(var(--pnt-edge) + var(--pnt-lg) * 2.3)", bottom: "calc(var(--pnt-edge) + var(--pnt-lg) * 0.35)" } },
];

const CHIPS: readonly { action: Action; label: string; right: string }[] = [
  { action: "pause", label: "esc", right: "calc(var(--pnt-edge))" },
  { action: "map", label: "map", right: "calc(var(--pnt-edge) + 54px)" },
  { action: "mute", label: "vol", right: "calc(var(--pnt-edge) + 108px)" },
];

interface Zone {
  action: Action;
  rect: DOMRect;
  element: HTMLElement;
}

/** How far from centre the thumb must travel before a direction registers. */
const PAD_DEADZONE = 0.26;
/** Fraction of the pad radius at which an axis counts as pressed. */
const PAD_THRESHOLD = 0.3;

export class TouchControls {
  private layer: HTMLElement;
  private rotate: HTMLElement;
  private pad: HTMLElement;
  private nub: HTMLElement;
  private buttons: HTMLElement[] = [];
  private zones: Zone[] = [];
  private padRect: DOMRect | null = null;
  private pointers = new Map<number, Set<Action>>();
  private active = new Set<Action>();
  private visible = false;

  constructor(host: HTMLElement) {
    injectStyles();
    this.layer = document.createElement("div");
    this.layer.className = "pnt-touch";
    this.layer.hidden = true;

    this.pad = document.createElement("div");
    this.pad.className = "pnt-pad";
    // Chevrons make the pad legible as a direction control at a glance.
    this.pad.innerHTML =
      `<div class="pnt-cross"></div>` +
      `<div class="pnt-hint pnt-hint-l">&#9664;</div>` +
      `<div class="pnt-hint pnt-hint-r">&#9654;</div>` +
      `<div class="pnt-hint pnt-hint-u">&#9650;</div>` +
      `<div class="pnt-hint pnt-hint-d">&#9660;</div>`;
    this.nub = document.createElement("div");
    this.nub.className = "pnt-nub";
    this.pad.appendChild(this.nub);
    this.layer.appendChild(this.pad);

    for (const spec of BUTTONS) {
      const el = document.createElement("div");
      el.className = "pnt-btn";
      el.dataset.key = spec.action;
      el.innerHTML = ICONS[spec.icon] ?? "";
      el.style.width = spec.size;
      el.style.height = spec.size;
      Object.assign(el.style, spec.css);
      this.layer.appendChild(el);
      this.buttons.push(el);
    }

    for (const chip of CHIPS) {
      const el = document.createElement("div");
      el.className = "pnt-chip";
      el.dataset.key = chip.action;
      el.textContent = chip.label;
      el.style.right = chip.right;
      el.style.top = "var(--pnt-edge)";
      this.layer.appendChild(el);
      this.buttons.push(el);
    }

    this.rotate = document.createElement("div");
    this.rotate.className = "pnt-rotate";
    this.rotate.hidden = true;
    this.rotate.innerHTML = `<div><div class="pnt-phone" style="margin:0 auto 18px"></div>Turn your device sideways</div>`;

    host.appendChild(this.layer);
    host.appendChild(this.rotate);
    this.applySizing();

    this.layer.addEventListener("pointerdown", this.onDown);
    this.layer.addEventListener("pointermove", this.onMove);
    this.layer.addEventListener("pointerup", this.onUp);
    this.layer.addEventListener("pointercancel", this.onUp);
    // A context menu on long-press would cancel the pointer mid-fight.
    this.layer.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("resize", this.refreshZones);
    window.addEventListener("orientationchange", this.refreshZones);
  }

  private applySizing(): void {
    const style = this.layer.style;
    // vmin keeps the controls thumb-sized on both a small phone and a tablet.
    style.setProperty("--pnt-lg", "clamp(52px, 13vmin, 84px)");
    style.setProperty("--pnt-md", "clamp(48px, 11vmin, 72px)");
    style.setProperty("--pnt-sm", "clamp(44px, 9vmin, 58px)");
    style.setProperty("--pnt-edge", "calc(12px + env(safe-area-inset-right, 0px))");

    const padSize = "clamp(116px, 30vmin, 184px)";
    this.pad.style.width = padSize;
    this.pad.style.height = padSize;
    this.pad.style.left = "calc(12px + env(safe-area-inset-left, 0px))";
    this.pad.style.bottom = "calc(12px + env(safe-area-inset-bottom, 0px))";
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.layer.hidden = false;
    this.refreshZones();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.layer.hidden = true;
    this.releaseEverything();
  }

  get shown(): boolean {
    return this.visible;
  }

  setRotatePrompt(show: boolean): void {
    this.rotate.hidden = !show;
    if (show) this.releaseEverything();
  }

  private releaseEverything(): void {
    this.pointers.clear();
    for (const action of this.active) input.setVirtual(action, false);
    this.active.clear();
    for (const el of this.buttons) el.dataset.on = "0";
    this.nub.style.transform = "translate(0px, 0px)";
  }

  private refreshZones = (): void => {
    if (!this.visible) return;
    this.zones = this.buttons.map((element) => ({
      action: element.dataset.key as Action,
      rect: element.getBoundingClientRect(),
      element,
    }));
    this.padRect = this.pad.getBoundingClientRect();
  };

  private hitTest(x: number, y: number): Set<Action> {
    const found = new Set<Action>();

    for (const zone of this.zones) {
      const r = zone.rect;
      // Circular buttons get a circular test with a little forgiveness.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (zone.element.classList.contains("pnt-chip")) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found.add(zone.action);
        continue;
      }
      const radius = (r.width / 2) * 1.12;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) found.add(zone.action);
    }

    const pad = this.padRect;
    if (pad) {
      const cx = pad.left + pad.width / 2;
      const cy = pad.top + pad.height / 2;
      // A generous square around the pad, so a thumb that drifts keeps steering.
      const reach = pad.width * 0.92;
      const dx = (x - cx) / (pad.width / 2);
      const dy = (y - cy) / (pad.height / 2);
      if (Math.abs(x - cx) < reach && Math.abs(y - cy) < reach) {
        const magnitude = Math.hypot(dx, dy);
        if (magnitude > PAD_DEADZONE) {
          if (dx < -PAD_THRESHOLD) found.add("left");
          if (dx > PAD_THRESHOLD) found.add("right");
          if (dy < -PAD_THRESHOLD) found.add("up");
          if (dy > PAD_THRESHOLD) found.add("down");
        }
        const clamp = Math.min(1, magnitude);
        const scale = magnitude > 0 ? clamp / magnitude : 0;
        this.nub.style.transform = `translate(${(dx * scale * pad.width) / 3.2}px, ${(dy * scale * pad.height) / 3.2}px)`;
      }
    }
    return found;
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointers.size === 0) this.refreshZones();
    try {
      // Keeps move/up events coming if the finger leaves the window. Throws if
      // the pointer has already ended, which must not abort the press below.
      this.layer.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable; the layer covers the viewport so tracking still works.
    }
    this.pointers.set(e.pointerId, this.hitTest(e.clientX, e.clientY));
    this.commit();
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, this.hitTest(e.clientX, e.clientY));
    this.commit();
    e.preventDefault();
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size === 0) this.nub.style.transform = "translate(0px, 0px)";
    this.commit();
    e.preventDefault();
  };

  /** Diff the union of every pointer's zones against what is currently held. */
  private commit(): void {
    const next = new Set<Action>();
    for (const set of this.pointers.values()) for (const action of set) next.add(action);

    for (const action of next) {
      if (!this.active.has(action)) input.setVirtual(action, true);
    }
    for (const action of this.active) {
      if (!next.has(action)) input.setVirtual(action, false);
    }
    this.active = next;

    for (const el of this.buttons) {
      el.dataset.on = next.has(el.dataset.key as Action) ? "1" : "0";
    }
  }
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** True when this looks like a device that wants on-screen controls. */
export function prefersTouchControls(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("touch") === "1") return true;
  if (params.get("touch") === "0") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse && (navigator.maxTouchPoints ?? 0) > 0;
}
