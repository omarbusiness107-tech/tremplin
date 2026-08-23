import { hz, transpose } from "../core/pitch";
import { rng } from "../core/rng";
import { audio, type LayerSpec } from "../engine/audio";
import { bell } from "../content/sfx";
import type { Mood } from "../engine/backdrop";

/**
 * The score is generated, not sampled. It sits in E Phrygian and leans on the
 * Andalusian cadence (Am - G - F - E), the progression that gives Spanish
 * liturgical music its particular ache -- the same well the game's setting
 * draws from. The voice is a Karplus-Strong pluck, which reads as a nylon
 * string.
 *
 * Notes are scheduled ahead of the audio clock rather than fired from the
 * game loop, so tempo never wobbles with the frame rate.
 */

export type MusicState = "silence" | "title" | "cell" | "explore" | "deep" | "tension" | "boss" | "victory";

type Quality = "min" | "maj" | "dim" | "sus";

interface Chord {
  /** Semitones above the tonic. */
  root: number;
  quality: Quality;
}

const VOICINGS: Record<Quality, readonly number[]> = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  dim: [0, 3, 6],
  sus: [0, 5, 7],
};

/** Am - G - F - E. Descending, and it never quite resolves upward. */
const ANDALUSIAN: readonly Chord[] = [
  { root: 5, quality: "min" },
  { root: 3, quality: "maj" },
  { root: 1, quality: "maj" },
  { root: 0, quality: "maj" },
];

/** Tonic and flat-second, with a tritone for the turn. */
const ABBOT: readonly Chord[] = [
  { root: 0, quality: "min" },
  { root: 1, quality: "maj" },
  { root: 0, quality: "min" },
  { root: 6, quality: "dim" },
];

const RESOLVED: readonly Chord[] = [
  { root: 0, quality: "maj" },
  { root: 5, quality: "maj" },
  { root: 7, quality: "maj" },
  { root: 0, quality: "maj" },
];

interface Score {
  bpm: number;
  progression: readonly Chord[];
  /** Eighth-note positions in a bar that get a plucked note. */
  pluckSteps: readonly number[];
  droneGain: number;
  pluckGain: number;
  /** Octave offset applied to the plucked voice. */
  octave: number;
  /** Toll a bell at the top of every Nth bar; 0 disables. */
  bellEveryBars: number;
  /** A low heartbeat on the downbeats. */
  pulse: boolean;
  /** Chance a step adds a neighbouring scale tone, for a little movement. */
  ornament: number;
}

const STEPS_PER_BAR = 8;

const SCORES: Record<Exclude<MusicState, "silence">, Score> = {
  title: {
    bpm: 52,
    progression: ANDALUSIAN,
    pluckSteps: [0, 5],
    droneGain: 0.5,
    pluckGain: 0.45,
    octave: 0,
    bellEveryBars: 4,
    pulse: false,
    ornament: 0.15,
  },
  cell: {
    bpm: 50,
    progression: ANDALUSIAN,
    pluckSteps: [0, 6],
    droneGain: 0.42,
    pluckGain: 0.36,
    octave: 0,
    bellEveryBars: 8,
    pulse: false,
    ornament: 0.1,
  },
  explore: {
    bpm: 58,
    progression: ANDALUSIAN,
    pluckSteps: [0, 3, 5],
    droneGain: 0.5,
    pluckGain: 0.44,
    octave: 0,
    bellEveryBars: 4,
    pulse: false,
    ornament: 0.28,
  },
  deep: {
    bpm: 46,
    progression: ANDALUSIAN,
    pluckSteps: [0, 4],
    droneGain: 0.62,
    pluckGain: 0.34,
    octave: -1,
    bellEveryBars: 6,
    pulse: false,
    ornament: 0.12,
  },
  tension: {
    bpm: 64,
    progression: ANDALUSIAN,
    pluckSteps: [0, 2, 3, 5, 6],
    droneGain: 0.6,
    pluckGain: 0.4,
    octave: 0,
    bellEveryBars: 2,
    pulse: true,
    ornament: 0.3,
  },
  boss: {
    bpm: 84,
    progression: ABBOT,
    pluckSteps: [0, 2, 3, 4, 6, 7],
    droneGain: 0.72,
    pluckGain: 0.5,
    octave: 0,
    bellEveryBars: 2,
    pulse: true,
    ornament: 0.42,
  },
  victory: {
    bpm: 50,
    progression: RESOLVED,
    pluckSteps: [0, 3, 5],
    droneGain: 0.45,
    pluckGain: 0.42,
    octave: 0,
    bellEveryBars: 4,
    pulse: false,
    ornament: 0.2,
  },
};

/** How far ahead of the audio clock notes are queued. */
const LOOKAHEAD = 0.4;
/** Fade time when the music changes, in seconds. */
const CROSSFADE = 1.1;

const DRONE_ROOT = hz("e2");
const PLUCK_ROOT = hz("e4");
const BELL_ROOT = hz("e5");

export class MusicDirector {
  private state: MusicState = "silence";
  private pending: MusicState | null = null;
  private step = 0;
  private nextStepTime = 0;
  /** Ramps down before a change and back up after, so cuts are never abrupt. */
  private level = 1;
  private levelTarget = 1;

  get current(): MusicState {
    return this.state;
  }

  /** 0..1 crossfade position; 1 once the current score is fully in. */
  get intensity(): number {
    return this.level;
  }

  /**
   * Request a change. Most changes wait for the next bar so the music never
   * cuts mid-phrase; a boss appearing is worth an immediate switch.
   */
  set(next: MusicState, immediate = false): void {
    if (next === this.state && this.pending === null) return;
    if (next === this.state) {
      this.pending = null;
      this.setLevelTarget(1);
      return;
    }
    this.pending = next;
    this.setLevelTarget(0);
    // Nothing is sounding, so there is nothing to fade out of -- switch now and
    // let the fade-in do the work, rather than sitting through two crossfades.
    if (immediate || this.state === "silence") this.applyPending();
  }

  /** Pick the music for a room, given whether its boss is awake. */
  setForRoom(mood: Mood, bossActive: boolean): void {
    if (bossActive) {
      this.set("boss", true);
      return;
    }
    switch (mood) {
      case "cell":
        this.set("cell");
        break;
      case "cistern":
        this.set("deep");
        break;
      case "sanctum":
        this.set("tension");
        break;
      default:
        this.set("explore");
        break;
    }
  }

  private applyPending(): void {
    if (this.pending === null) return;
    const from = this.state;
    this.state = this.pending;
    this.pending = null;
    // Coming from silence, rise from nothing instead of punching in at full.
    if (from === "silence") this.level = 0;
    this.setLevelTarget(1);
    this.step = 0;
    this.nextStepTime = 0;
  }

  private setLevelTarget(value: number): void {
    if (this.levelTarget === value) return;
    this.levelTarget = value;
    audio.setMusicLevel(value, CROSSFADE);
  }

  private get score(): Score | null {
    return this.state === "silence" ? null : SCORES[this.state];
  }

  private secondsPerStep(score: Score): number {
    // Eighth notes.
    return 60 / score.bpm / 2;
  }

  /** Called once per frame; cheap when there is nothing to queue. */
  update(): void {
    const ctx = audio.context();
    if (!ctx || ctx.state !== "running") return;

    // Approach the target level; roughly CROSSFADE seconds at 60fps.
    const rate = 1 / (CROSSFADE * 60);
    this.level += Math.sign(this.levelTarget - this.level) * rate;
    this.level = Math.min(1, Math.max(0, this.level));
    if (this.pending !== null && this.level <= 0.01) this.applyPending();

    const score = this.score;
    if (!score) return;

    const now = ctx.currentTime;
    const stepLength = this.secondsPerStep(score);
    if (this.nextStepTime === 0) this.nextStepTime = now + 0.08;
    // After a stall (a backgrounded tab), resync instead of dumping a burst.
    if (this.nextStepTime < now - 0.5) this.nextStepTime = now + 0.05;

    while (this.nextStepTime < now + LOOKAHEAD) {
      this.scheduleStep(score, this.nextStepTime, stepLength);
      this.nextStepTime += stepLength;
      this.step++;
    }
  }

  private scheduleStep(score: Score, time: number, stepLength: number): void {

    const stepInBar = this.step % STEPS_PER_BAR;
    const barIndex = Math.floor(this.step / STEPS_PER_BAR);
    const chord = score.progression[barIndex % score.progression.length];
    const tones = VOICINGS[chord.quality];

    if (stepInBar === 0) {
      this.scheduleDrone(score, chord, tones, time, stepLength * STEPS_PER_BAR);
      if (score.bellEveryBars > 0 && barIndex % score.bellEveryBars === 0) {
        for (const layer of bell(transpose(BELL_ROOT, chord.root), 0.12, 2.6, 0.85)) {
          audio.playMusicLayer(layer, time);
        }
      }
    }

    if (score.pulse && stepInBar % 2 === 0) {
      audio.playMusicLayer(
        { kind: "tone", wave: "sine", freq: 55, freqEnd: 40, duration: 0.22, gain: 0.34, attack: 0.006 },
        time,
      );
    }

    if (!score.pluckSteps.includes(stepInBar)) return;

    // Walk the chord tones, occasionally reaching for a neighbour so the line
    // moves instead of arpeggiating in place.
    const degree = tones[(barIndex + stepInBar) % tones.length];
    const ornament = rng.next() < score.ornament ? (rng.next() < 0.5 ? -2 : 2) : 0;
    const octave = score.octave * 12 + (stepInBar >= 5 ? 12 : 0);
    const freq = transpose(PLUCK_ROOT, chord.root + degree + ornament + octave);

    audio.playMusicLayer(
      {
        kind: "pluck",
        freq,
        duration: 1.8,
        gain: score.pluckGain,
        brightness: 0.55,
        reverb: 0.5,
      },
      time,
    );
  }

  private scheduleDrone(
    score: Score,
    chord: Chord,
    tones: readonly number[],
    time: number,
    duration: number,
  ): void {
    const root = transpose(DRONE_ROOT, chord.root + score.octave * 12);
    // Two detuned saws through a low filter: a bowed, breathing pad.
    const layers: LayerSpec[] = [
      {
        kind: "tone",
        wave: "sawtooth",
        freq: root,
        duration,
        attack: duration * 0.35,
        gain: score.droneGain * 0.3,
        detune: -6,
        filter: { type: "lowpass", freq: 420, q: 0.7 },
        reverb: 0.55,
      },
      {
        kind: "tone",
        wave: "sawtooth",
        freq: root,
        duration,
        attack: duration * 0.4,
        gain: score.droneGain * 0.24,
        detune: 7,
        filter: { type: "lowpass", freq: 340, q: 0.7 },
        reverb: 0.55,
      },
      // The fifth, an octave up, to give the pad a body.
      {
        kind: "tone",
        wave: "triangle",
        freq: transpose(root, tones[tones.length - 1] + 12),
        duration: duration * 0.8,
        attack: duration * 0.45,
        gain: score.droneGain * 0.13,
        reverb: 0.6,
      },
    ];
    for (const layer of layers) audio.playMusicLayer(layer, time);
  }

  /** Silence everything, e.g. on death. */
  hush(): void {
    this.set("silence", true);
  }
}

export const music = new MusicDirector();
