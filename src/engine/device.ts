/**
 * Phone-specific plumbing: fullscreen, keeping the screen awake, noticing when
 * the game is backgrounded, and which way the device is being held.
 *
 * Every capability here is optional and probed at runtime. iOS Safari has no
 * Fullscreen API on iPhone and ignores vibration, so those simply do nothing
 * there rather than being special-cased.
 */

/**
 * True inside the packaged Android app. The native activity already runs
 * immersive and serves its assets locally, so the web-side fullscreen request
 * and the offline service worker are both redundant there.
 */
export function isNativeShell(): boolean {
  return typeof window !== "undefined" && "Capacitor" in window;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isNativeShell() ||
    window.matchMedia?.("(display-mode: fullscreen), (display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function fullscreenSupported(element: HTMLElement): boolean {
  return typeof element.requestFullscreen === "function" && document.fullscreenEnabled === true;
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/** Must be called from inside a user gesture. Resolves either way. */
export async function enterFullscreen(element: HTMLElement): Promise<void> {
  if (!fullscreenSupported(element) || isFullscreen()) return;
  try {
    await element.requestFullscreen({ navigationUI: "hide" });
  } catch {
    // Refused (iPhone, or a permissions policy). The game still plays.
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  try {
    await document.exitFullscreen();
  } catch {
    // ignore
  }
}

/** Ask the platform to lock to landscape. Widely refused; harmless when it is. */
export async function lockLandscape(): Promise<void> {
  const orientation = screen.orientation as
    | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
    | undefined;
  if (!orientation?.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    // Not permitted outside fullscreen, or unsupported.
  }
}

interface WakeLockLike {
  release: () => Promise<void>;
  released: boolean;
}

/**
 * Holds a screen wake lock, re-acquiring it when the page comes back to the
 * foreground -- the browser drops it on every hide.
 */
export class ScreenAwake {
  private lock: WakeLockLike | null = null;
  private wanted = false;

  get supported(): boolean {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  async enable(): Promise<void> {
    this.wanted = true;
    await this.acquire();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  async disable(): Promise<void> {
    this.wanted = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
    try {
      await this.lock?.release();
    } catch {
      // ignore
    }
    this.lock = null;
  }

  private onVisibility = (): void => {
    if (!document.hidden && this.wanted) void this.acquire();
  };

  private async acquire(): Promise<void> {
    if (!this.supported || document.hidden) return;
    if (this.lock && !this.lock.released) return;
    try {
      const wakeLock = (navigator as unknown as {
        wakeLock: { request: (type: "screen") => Promise<WakeLockLike> };
      }).wakeLock;
      this.lock = await wakeLock.request("screen");
    } catch {
      // Battery saver, or an unsupported browser.
    }
  }
}

/** Fires whenever the device orientation changes, with the current state. */
export function watchOrientation(onChange: (portrait: boolean) => void): () => void {
  const query = window.matchMedia("(orientation: portrait)");
  const handler = (): void => onChange(query.matches);
  handler();
  query.addEventListener("change", handler);
  // Some browsers update the media query late after a rotation.
  window.addEventListener("orientationchange", handler);
  window.addEventListener("resize", handler);
  return () => {
    query.removeEventListener("change", handler);
    window.removeEventListener("orientationchange", handler);
    window.removeEventListener("resize", handler);
  };
}

/** Calls back when the page is hidden, so the game can pause itself. */
export function onBackgrounded(fn: () => void): void {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) fn();
  });
  window.addEventListener("pagehide", fn);
}
