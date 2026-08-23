/** Note-name to frequency, so sounds and score can share one tuning. */

const SEMITONES: Record<string, number> = {
  c: 0,
  "c#": 1,
  db: 1,
  d: 2,
  "d#": 3,
  eb: 3,
  e: 4,
  f: 5,
  "f#": 6,
  gb: 6,
  g: 7,
  "g#": 8,
  ab: 8,
  a: 9,
  "a#": 10,
  bb: 10,
  b: 11,
};

const A4 = 440;

/** `hz("e3")`, `hz("g#4")`. Octave 4 contains middle C. */
export function hz(name: string): number {
  const match = /^([a-g][#b]?)(-?\d)$/i.exec(name.trim().toLowerCase());
  if (!match) throw new Error(`Bad note name: ${name}`);
  const semitone = SEMITONES[match[1]];
  const octave = Number(match[2]);
  // MIDI note number, then the standard equal-temperament formula.
  const midi = (octave + 1) * 12 + semitone;
  return A4 * Math.pow(2, (midi - 69) / 12);
}

/** Shift a frequency by a number of semitones. */
export function transpose(freq: number, semitones: number): number {
  return freq * Math.pow(2, semitones / 12);
}
