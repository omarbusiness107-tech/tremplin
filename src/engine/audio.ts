/**
 * Everything you hear is synthesised at runtime -- there are no audio files,
 * for the same reason there are no sprites. The whole graph is:
 *
 *   voices -> [dry] -----------------> sfx / music bus -> master -> speakers
 *          \- [send] -> convolver ---/
 *
 * The convolver runs a generated impulse response, which is what gives the
 * cathedral its tail. Every entry point is failure-tolerant: if the browser
 * refuses us an AudioContext, the game plays on in silence.
 */

const STORAGE_KEY = "penitence.audio.v1";

export interface Filter {
  type: BiquadFilterType;
  freq: number;
  /** Sweep the cutoff to this value across the sound. */
  freqEnd?: number;
  q?: number;
}

/** Fields every layer shares, so the player can treat them uniformly. */
interface LayerBase {
  duration: number;
  attack?: number;
  gain?: number;
  /** 0..1 send into the reverb. */
  reverb?: number;
  /** Seconds to wait before this layer starts. */
  delay?: number;
}

export interface ToneSpec extends LayerBase {
  kind: "tone";
  wave: OscillatorType;
  freq: number;
  /** Sweep the pitch to this value; the basis of whooshes and impacts. */
  freqEnd?: number;
  detune?: number;
  filter?: Filter;
}

export interface NoiseSpec extends LayerBase {
  kind: "noise";
  filter?: Filter;
}

export interface PluckSpec extends LayerBase {
  kind: "pluck";
  freq: number;
  /** 0..1; higher is brighter and rings longer. */
  brightness?: number;
}

export type LayerSpec = ToneSpec | NoiseSpec | PluckSpec;

export type Bus = "sfx" | "music";

interface Settings {
  master: number;
  muted: boolean;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        master: typeof parsed.master === "number" ? Math.min(1, Math.max(0, parsed.master)) : 0.7,
        muted: parsed.muted === true,
      };
    }
  } catch {
    // Storage can be blocked; defaults are fine.
  }
  return { master: 0.7, muted: false };
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFade: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private pluckCache = new Map<number, AudioBuffer>();
  private settings = loadSettings();
  private failed = false;

  /** Voices started this frame, to stop a single event stacking into a roar. */
  private recent = new Map<string, number>();

  get muted(): boolean {
    return this.settings.muted;
  }

  get volume(): number {
    return this.settings.master;
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /**
   * Browsers only allow audio to start inside a user gesture, so this is called
   * from the first keypress or click rather than at load.
   */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  }

  private ensure(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("no AudioContext");
      const ctx = new Ctor();

      // A limiter on the way out. Without it the mix has to be timid in case
      // several loud sounds land on the same frame; with it, levels can sit
      // where they belong and the rare pile-up is caught.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.16;
      limiter.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = this.settings.muted ? 0 : this.settings.master;
      master.connect(limiter);

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = 1.7;
      sfxBus.connect(master);

      // Music runs through its own fade stage. Crossfading by scaling each
      // note's gain at schedule time cannot work: a bar is queued seconds
      // before it sounds, so the fade would apply to the wrong notes.
      const musicFade = ctx.createGain();
      musicFade.gain.value = 1;
      musicFade.connect(master);

      const musicBus = ctx.createGain();
      musicBus.gain.value = 1.0;
      musicBus.connect(musicFade);

      const convolver = ctx.createConvolver();
      convolver.buffer = this.buildImpulse(ctx, 2.9, 2.4);
      const reverbIn = ctx.createGain();
      reverbIn.gain.value = 1;
      reverbIn.connect(convolver);
      const wet = ctx.createGain();
      wet.gain.value = 1.1;
      convolver.connect(wet);
      wet.connect(master);

      this.ctx = ctx;
      this.master = master;
      this.sfxBus = sfxBus;
      this.musicBus = musicBus;
      this.musicFade = musicFade;
      this.reverbIn = reverbIn;
      this.noiseBuffer = this.buildNoise(ctx);
      return ctx;
    } catch {
      // No audio device, blocked context, or an ancient browser.
      this.failed = true;
      return null;
    }
  }

  /** Exponentially decaying noise: a serviceable stone-room impulse response. */
  private buildImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    const preDelay = Math.floor(rate * 0.012);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        if (i < preDelay) {
          data[i] = 0;
          continue;
        }
        const t = (i - preDelay) / (length - preDelay);
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buffer;
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /**
   * Karplus-Strong: a noise burst fed through a short averaging delay line.
   * Renders a nylon-stringed pluck, which is the voice of the score.
   */
  private pluckBuffer(ctx: AudioContext, freq: number, brightness: number): AudioBuffer {
    const key = Math.round(freq * 4) + Math.round(brightness * 100) * 100000;
    const cached = this.pluckCache.get(key);
    if (cached) return cached;

    const rate = ctx.sampleRate;
    const period = Math.max(2, Math.floor(rate / freq));
    const length = Math.floor(rate * 2.2);
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);

    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;

    // Feedback below 1 sets the decay; the two-tap average is the lowpass that
    // makes higher harmonics die first, exactly as a real string does.
    const feedback = 0.985 + brightness * 0.012;
    let index = 0;
    for (let i = 0; i < length; i++) {
      const current = line[index];
      const next = line[(index + 1) % period];
      const value = (current + next) * 0.5 * feedback;
      line[index] = value;
      data[i] = current;
      index = (index + 1) % period;
    }

    if (this.pluckCache.size > 128) this.pluckCache.clear();
    this.pluckCache.set(key, buffer);
    return buffer;
  }

  private routeReverb(node: AudioNode, amount: number | undefined): void {
    if (!amount || !this.ctx || !this.reverbIn) return;
    const send = this.ctx.createGain();
    send.gain.value = amount;
    node.connect(send);
    send.connect(this.reverbIn);
  }

  private busNode(bus: Bus): GainNode | null {
    return bus === "music" ? this.musicBus : this.sfxBus;
  }

  /**
   * Play one layer. `when` is an absolute context time; pass `now()` for
   * immediate. Returns silently if audio is unavailable.
   */
  playLayer(layer: LayerSpec, bus: Bus = "sfx", when?: number, pitchScale = 1, gainScale = 1): void {
    const ctx = this.ensure();
    const target = this.busNode(bus);
    if (!ctx || !target) return;

    const start = (when ?? ctx.currentTime) + (layer.delay ?? 0);
    const gainValue = (layer.gain ?? 0.4) * gainScale;

    try {
      const amp = ctx.createGain();
      // Clamp the attack so a long pad cannot schedule its rise past its own
      // release, which would leave the ramps fighting.
      const attack = Math.min(Math.max(0.001, layer.attack ?? 0.004), layer.duration * 0.8);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), start + attack);
      // Exponential release; audio decays multiplicatively, not linearly.
      amp.gain.exponentialRampToValueAtTime(0.0001, start + layer.duration);

      let source: AudioScheduledSourceNode;
      let head: AudioNode = amp;

      if (layer.kind === "tone") {
        const osc = ctx.createOscillator();
        osc.type = layer.wave;
        osc.frequency.setValueAtTime(layer.freq * pitchScale, start);
        if (layer.freqEnd !== undefined) {
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(1, layer.freqEnd * pitchScale),
            start + layer.duration,
          );
        }
        if (layer.detune) osc.detune.setValueAtTime(layer.detune, start);
        source = osc;
      } else if (layer.kind === "noise") {
        const node = ctx.createBufferSource();
        node.buffer = this.noiseBuffer;
        node.loop = true;
        source = node;
      } else {
        const node = ctx.createBufferSource();
        node.buffer = this.pluckBuffer(ctx, layer.freq * pitchScale, layer.brightness ?? 0.5);
        source = node;
      }

      if (layer.kind !== "pluck" && layer.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = layer.filter.type;
        filter.frequency.setValueAtTime(layer.filter.freq, start);
        if (layer.filter.freqEnd !== undefined) {
          filter.frequency.exponentialRampToValueAtTime(
            Math.max(20, layer.filter.freqEnd),
            start + layer.duration,
          );
        }
        if (layer.filter.q !== undefined) filter.Q.setValueAtTime(layer.filter.q, start);
        filter.connect(amp);
        head = filter;
      }

      source.connect(head);
      amp.connect(target);
      this.routeReverb(amp, layer.reverb);

      source.start(start);
      source.stop(start + layer.duration + 0.05);
      source.onended = () => {
        try {
          source.disconnect();
          amp.disconnect();
        } catch {
          // Already torn down.
        }
      };
    } catch {
      // A single failed voice must never interrupt the frame.
    }
  }

  /**
   * Play a stack of layers as one sound. `throttle` (in seconds) drops repeats
   * of the same id, so an attack that connects with three enemies at once does
   * not play three times as loud.
   */
  play(id: string, layers: readonly LayerSpec[], options: { pitch?: number; gain?: number; throttle?: number } = {}): void {
    const ctx = this.ensure();
    if (!ctx) return;

    const throttle = options.throttle ?? 0.02;
    const last = this.recent.get(id) ?? -1;
    if (ctx.currentTime - last < throttle) return;
    this.recent.set(id, ctx.currentTime);

    for (const layer of layers) {
      this.playLayer(layer, "sfx", ctx.currentTime, options.pitch ?? 1, options.gain ?? 1);
    }
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  musicTarget(): GainNode | null {
    this.ensure();
    return this.musicBus;
  }

  reverbTarget(): GainNode | null {
    this.ensure();
    return this.reverbIn;
  }

  context(): AudioContext | null {
    return this.ensure();
  }

  /** Schedule a pluck or tone straight onto the music bus, for the sequencer. */
  playMusicLayer(layer: LayerSpec, when: number, gainScale = 1): void {
    this.playLayer(layer, "music", when, 1, gainScale);
  }

  /**
   * Insert an analyser after the master bus. Exposed so automated checks can
   * confirm the game is actually making sound, rather than only that it threw
   * no errors.
   */
  attachAnalyser(): AnalyserNode | null {
    const ctx = this.ensure();
    if (!ctx || !this.master) return null;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    this.master.connect(analyser);
    return analyser;
  }

  /** Ramp the music fade stage. Applies to notes already scheduled. */
  setMusicLevel(value: number, seconds = 1.1): void {
    const ctx = this.ensure();
    if (!ctx || !this.musicFade) return;
    const target = Math.min(1, Math.max(0, value));
    this.musicFade.gain.cancelScheduledValues(ctx.currentTime);
    this.musicFade.gain.setTargetAtTime(target, ctx.currentTime, Math.max(0.02, seconds / 3));
  }

  setVolume(value: number): void {
    this.settings.master = Math.min(1, Math.max(0, value));
    this.applyMaster();
    this.persist();
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.applyMaster();
    this.persist();
  }

  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  private applyMaster(): void {
    if (!this.master || !this.ctx) return;
    const value = this.settings.muted ? 0.0001 : Math.max(0.0001, this.settings.master);
    // Ramp rather than jump, so toggling mute does not click.
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Not persisting volume is survivable.
    }
  }
}

export const audio = new AudioEngine();
