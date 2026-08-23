export const FPS = 60;
export const STEP = 1 / FPS;

/** Never simulate more than this many steps in one frame after a stall. */
const MAX_CATCHUP_STEPS = 5;

export interface LoopHandlers {
  update(): void;
  render(): void;
}

/**
 * Fixed-timestep loop. Gameplay always advances in whole 1/60s steps so that
 * frame-counted timings (i-frames, parry windows, hitstop) stay identical on
 * every refresh rate; rendering happens once per animation frame.
 */
export class Loop {
  private accumulator = 0;
  private last = 0;
  private running = false;
  private rafId = 0;

  constructor(private readonly handlers: LoopHandlers) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    // Cap the delta so returning to a backgrounded tab does not fast-forward.
    const elapsed = Math.min((now - this.last) / 1000, STEP * MAX_CATCHUP_STEPS);
    this.last = now;
    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_CATCHUP_STEPS) {
      this.accumulator -= STEP;
      steps++;
      this.handlers.update();
    }
    if (steps === MAX_CATCHUP_STEPS) this.accumulator = 0;

    this.handlers.render();
  };
}
