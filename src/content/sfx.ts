import { hz } from "../core/pitch";
import { audio, type LayerSpec } from "../engine/audio";

/**
 * The sound library, written as data in the same spirit as the combat frame
 * data: tuning happens here, never in the systems that trigger it.
 *
 * Pitched sounds sit in E Phrygian, the key the score is in, so a parry chime
 * lands in tune with whatever is playing underneath it.
 */

/**
 * A struck bell. Real bells are inharmonic -- the hum, prime, minor-third
 * tierce, quint and nominal partials are what separate a bell from a beep.
 */
export function bell(root: number, gain: number, duration: number, reverb = 0.55): LayerSpec[] {
  const partials: readonly (readonly [number, number, number])[] = [
    [0.5, 0.5, 1.0], // hum
    [1.0, 1.0, 0.95], // prime
    [1.19, 0.55, 0.7], // tierce (the minor third that makes it mournful)
    [1.5, 0.42, 0.55], // quint
    [2.0, 0.34, 0.4], // nominal
    [2.66, 0.16, 0.25],
  ];
  return partials.map(([ratio, amp, lengthScale]) => ({
    kind: "tone" as const,
    wave: "sine" as const,
    freq: root * ratio,
    duration: duration * lengthScale,
    attack: 0.002,
    gain: gain * amp,
    reverb,
  }));
}

/** Air moving past a blade: filtered noise with the band sweeping downward. */
function whoosh(from: number, to: number, duration: number, gain: number): LayerSpec {
  return {
    kind: "noise",
    duration,
    attack: duration * 0.25,
    gain,
    filter: { type: "bandpass", freq: from, freqEnd: to, q: 1.4 },
    reverb: 0.12,
  };
}

export const SFX = {
  // -- movement ----------------------------------------------------------
  jump: [
    { kind: "tone", wave: "triangle", freq: 210, freqEnd: 380, duration: 0.13, gain: 0.16, attack: 0.005 },
    { kind: "noise", duration: 0.09, gain: 0.07, filter: { type: "highpass", freq: 900 } },
  ],
  doubleJump: [
    { kind: "tone", wave: "triangle", freq: 300, freqEnd: 620, duration: 0.16, gain: 0.15 },
    ...bell(hz("b5"), 0.1, 0.7, 0.5),
  ],
  land: [
    { kind: "noise", duration: 0.11, gain: 0.13, filter: { type: "lowpass", freq: 900, freqEnd: 260 } },
    { kind: "tone", wave: "sine", freq: 120, freqEnd: 70, duration: 0.1, gain: 0.12 },
  ],
  roll: [whoosh(1500, 380, 0.26, 0.13), { kind: "noise", duration: 0.1, gain: 0.06, filter: { type: "lowpass", freq: 500 } }],

  // -- the blade ---------------------------------------------------------
  swing1: [whoosh(2400, 700, 0.16, 0.17)],
  swing2: [whoosh(2700, 800, 0.15, 0.17)],
  swing3: [whoosh(1900, 420, 0.24, 0.22), { kind: "tone", wave: "sine", freq: 160, freqEnd: 90, duration: 0.16, gain: 0.1 }],
  heavy: [
    whoosh(1200, 260, 0.34, 0.26),
    { kind: "tone", wave: "sawtooth", freq: 90, freqEnd: 46, duration: 0.26, gain: 0.13, filter: { type: "lowpass", freq: 400 } },
  ],
  plunge: [whoosh(600, 2600, 0.3, 0.16)],

  /** Wet, blunt: a low thump under a short band of noise. */
  hitFlesh: [
    { kind: "tone", wave: "sine", freq: 150, freqEnd: 62, duration: 0.16, gain: 0.3 },
    { kind: "noise", duration: 0.1, gain: 0.18, filter: { type: "bandpass", freq: 620, freqEnd: 230, q: 0.8 }, reverb: 0.2 },
  ],
  /** Steel on steel: inharmonic partials and a bright transient. */
  hitBlocked: [
    { kind: "tone", wave: "square", freq: 1750, duration: 0.13, gain: 0.1, reverb: 0.35 },
    { kind: "tone", wave: "square", freq: 2630, duration: 0.09, gain: 0.06, detune: 22, reverb: 0.35 },
    { kind: "noise", duration: 0.07, gain: 0.16, filter: { type: "highpass", freq: 3200 } },
    { kind: "tone", wave: "sine", freq: 190, freqEnd: 110, duration: 0.11, gain: 0.14 },
  ],

  /**
   * The parry. This is the reward the whole combat system points at, so it gets
   * the brightest, longest-ringing sound in the game: a struck chime with a
   * metallic transient and a heavy send into the cathedral tail.
   */
  parry: [
    { kind: "noise", duration: 0.05, gain: 0.14, filter: { type: "highpass", freq: 4200 } },
    ...bell(hz("e6"), 0.13, 1.5, 0.85),
    ...bell(hz("b5"), 0.07, 1.9, 0.85),
    { kind: "tone", wave: "triangle", freq: hz("e5"), freqEnd: hz("b5"), duration: 0.16, gain: 0.08, reverb: 0.6 },
  ],
  riposte: [
    ...bell(hz("e4"), 0.16, 1.6, 0.7),
    { kind: "tone", wave: "sawtooth", freq: hz("e2"), duration: 0.5, gain: 0.1, attack: 0.06, filter: { type: "lowpass", freq: 700 }, reverb: 0.5 },
  ],

  stagger: [
    { kind: "noise", duration: 0.19, gain: 0.19, filter: { type: "bandpass", freq: 1500, freqEnd: 400, q: 2.2 }, reverb: 0.3 },
    { kind: "tone", wave: "square", freq: 260, freqEnd: 120, duration: 0.16, gain: 0.09 },
  ],

  // -- suffering ---------------------------------------------------------
  playerHurt: [
    { kind: "tone", wave: "sawtooth", freq: 320, freqEnd: 140, duration: 0.26, gain: 0.16, filter: { type: "lowpass", freq: 1400, freqEnd: 500 } },
    { kind: "noise", duration: 0.14, gain: 0.16, filter: { type: "bandpass", freq: 800, q: 0.7 }, reverb: 0.25 },
  ],
  playerDeath: [
    ...bell(hz("e2"), 0.2, 3.4, 0.95),
    { kind: "tone", wave: "sawtooth", freq: 120, freqEnd: 42, duration: 1.6, gain: 0.1, attack: 0.02, filter: { type: "lowpass", freq: 600, freqEnd: 160 }, reverb: 0.7 },
  ],
  enemyDeath: [
    { kind: "tone", wave: "sawtooth", freq: 240, freqEnd: 70, duration: 0.42, gain: 0.14, filter: { type: "lowpass", freq: 1200, freqEnd: 300 }, reverb: 0.35 },
    { kind: "noise", duration: 0.3, gain: 0.13, filter: { type: "lowpass", freq: 1600, freqEnd: 200 }, reverb: 0.3 },
  ],

  // -- projectiles -------------------------------------------------------
  throwCenser: [whoosh(900, 2200, 0.24, 0.11)],
  burst: [
    { kind: "noise", duration: 0.16, gain: 0.14, filter: { type: "bandpass", freq: 1800, freqEnd: 500, q: 1.1 }, reverb: 0.25 },
    { kind: "tone", wave: "sine", freq: 240, freqEnd: 90, duration: 0.14, gain: 0.1 },
  ],

  // -- devotion ----------------------------------------------------------
  flask: [
    { kind: "tone", wave: "sine", freq: hz("b4"), duration: 0.5, gain: 0.13, attack: 0.02, reverb: 0.5 },
    { kind: "tone", wave: "sine", freq: hz("e5"), duration: 0.6, gain: 0.11, attack: 0.02, delay: 0.09, reverb: 0.5 },
  ],
  pickup: [
    { kind: "pluck", freq: hz("e4"), duration: 1.0, gain: 0.2, brightness: 0.7, reverb: 0.5 },
    { kind: "pluck", freq: hz("g4"), duration: 1.0, gain: 0.19, brightness: 0.7, delay: 0.1, reverb: 0.5 },
    { kind: "pluck", freq: hz("b4"), duration: 1.3, gain: 0.18, brightness: 0.75, delay: 0.2, reverb: 0.6 },
    ...bell(hz("e6"), 0.09, 1.4, 0.7),
  ],
  /** Kneeling at an altar: a slow consonant swell, like a held choir chord. */
  altar: [
    { kind: "tone", wave: "sine", freq: hz("e3"), duration: 2.2, gain: 0.13, attack: 0.35, reverb: 0.8 },
    { kind: "tone", wave: "sine", freq: hz("b3"), duration: 2.2, gain: 0.1, attack: 0.45, reverb: 0.8 },
    { kind: "tone", wave: "sine", freq: hz("e4"), duration: 2.0, gain: 0.08, attack: 0.55, reverb: 0.8 },
    { kind: "tone", wave: "triangle", freq: hz("g4"), duration: 1.8, gain: 0.05, attack: 0.6, reverb: 0.8 },
    ...bell(hz("e5"), 0.12, 2.4, 0.8),
  ],
  guilt: [
    { kind: "tone", wave: "triangle", freq: hz("c4"), freqEnd: hz("e4"), duration: 1.1, gain: 0.12, attack: 0.15, reverb: 0.8 },
    ...bell(hz("b5"), 0.1, 1.6, 0.85),
  ],

  // -- the world ---------------------------------------------------------
  door: [
    { kind: "noise", duration: 0.7, gain: 0.11, filter: { type: "lowpass", freq: 700, freqEnd: 130 }, reverb: 0.5 },
    { kind: "tone", wave: "sine", freq: 90, freqEnd: 40, duration: 0.6, gain: 0.1, reverb: 0.4 },
  ],
  sealed: [
    { kind: "tone", wave: "square", freq: 150, freqEnd: 96, duration: 0.3, gain: 0.11, filter: { type: "lowpass", freq: 800 }, reverb: 0.3 },
  ],

  // -- the abbot ---------------------------------------------------------
  bossSlam: [
    { kind: "tone", wave: "sine", freq: 110, freqEnd: 34, duration: 0.7, gain: 0.34, reverb: 0.5 },
    { kind: "noise", duration: 0.5, gain: 0.22, filter: { type: "lowpass", freq: 1400, freqEnd: 120 }, reverb: 0.45 },
    ...bell(hz("e2"), 0.14, 1.8, 0.7),
  ],
  bossToll: [...bell(hz("f2"), 0.3, 3.0, 0.9), ...bell(hz("b2"), 0.14, 2.4, 0.9)],
  bossCharge: [
    { kind: "noise", duration: 0.55, gain: 0.16, filter: { type: "lowpass", freq: 200, freqEnd: 1500 }, reverb: 0.3 },
    { kind: "tone", wave: "sawtooth", freq: 60, freqEnd: 150, duration: 0.5, gain: 0.13, filter: { type: "lowpass", freq: 500 } },
  ],
  /** A tritone against the tonic: the moment the fight turns. */
  bossPhase: [
    ...bell(hz("e2"), 0.22, 4.0, 0.95),
    ...bell(hz("bb2"), 0.16, 3.6, 0.95),
    { kind: "tone", wave: "sawtooth", freq: hz("e1"), duration: 2.6, gain: 0.14, attack: 0.3, filter: { type: "lowpass", freq: 400 }, reverb: 0.8 },
  ],
  bossDeath: [
    ...bell(hz("e3"), 0.2, 4.5, 0.95),
    ...bell(hz("b3"), 0.15, 4.0, 0.95),
    ...bell(hz("e4"), 0.11, 3.4, 0.95),
  ],

  // -- interface ---------------------------------------------------------
  uiConfirm: [{ kind: "pluck", freq: hz("e4"), duration: 0.9, gain: 0.2, brightness: 0.6, reverb: 0.45 }],
  uiOpen: [{ kind: "tone", wave: "triangle", freq: hz("b3"), freqEnd: hz("e4"), duration: 0.14, gain: 0.11, reverb: 0.3 }],
  uiClose: [{ kind: "tone", wave: "triangle", freq: hz("e4"), freqEnd: hz("b3"), duration: 0.14, gain: 0.11, reverb: 0.3 }],
} satisfies Record<string, readonly LayerSpec[]>;

export type SfxName = keyof typeof SFX;

/** Fire a sound by name. Safe to call before audio has been unlocked. */
export function playSfx(
  name: SfxName,
  options: { pitch?: number; gain?: number; throttle?: number } = {},
): void {
  audio.play(name, SFX[name], options);
}

/** Slight random detune keeps repeated sounds from feeling mechanical. */
export function playSfxVaried(name: SfxName, spread = 0.06, gain = 1): void {
  playSfx(name, { pitch: 1 + (Math.random() * 2 - 1) * spread, gain });
}
