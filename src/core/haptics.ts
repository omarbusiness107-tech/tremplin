/**
 * Short vibrations for impacts. Android honours these; iOS Safari ignores
 * `navigator.vibrate` entirely, so this is a no-op there by design rather than
 * something to work around.
 */

let enabled = true;

const supported = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function hapticsAvailable(): boolean {
  return supported();
}

function buzz(pattern: number | number[]): void {
  if (!enabled || !supported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when the page is not visible.
  }
}

/** A crisp tick: landing a hit. */
export const hapticHit = (): void => buzz(12);
/** The parry: two quick pulses, so it feels different from a plain hit. */
export const hapticParry = (): void => buzz([14, 26, 22]);
/** Taking damage: one heavier thud. */
export const hapticHurt = (): void => buzz(38);
/** Death, or the boss turning. */
export const hapticHeavy = (): void => buzz([50, 60, 90]);
