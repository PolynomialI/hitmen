// Fully procedural audio: no sound files. Karplus-Strong lute music over a drone, fire ambience,
// and synthesized effects for every game moment.

type Sfx =
  | 'hover'
  | 'click'
  | 'swish'
  | 'place'
  | 'flip'
  | 'draw'
  | 'deal'
  | 'shuffle'
  | 'chime'
  | 'ignite'
  | 'parry'
  | 'bounty'
  | 'scry'
  | 'coins'
  | 'stinger'
  | 'heartbeat'
  | 'angel'
  | 'slash'
  | 'thud'
  | 'snuff'
  | 'paper'
  | 'tick'
  | 'whoosh'
  | 'win'
  | 'lose';

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private revSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private pluckCache = new Map<number, AudioBuffer>();
  private musicOn = false;
  private musicTimer: number | null = null;
  private nextBarAt = 0;
  private bar = 0;
  private drone: { stop: () => void; gain: GainNode } | null = null;
  private muted = false;
  /** Silences effects without touching the player's mute setting (e.g. while replaying a match's history). */
  suppressed = false;
  /** 0..1 tension (raises drone, adds pulse). */
  tension = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.5;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.6);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.32;
    this.revSend.connect(this.reverb).connect(this.master);
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.revSend);
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(this.revSend);
    this.ambBus.connect(this.master);
    // Shared noise.
    const n = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  private impulse(sec: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections + diffuse tail, slightly darker over time.
        const er = i < ctx.sampleRate * 0.06 && Math.random() < 0.004 ? 0.8 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + er) * (1 - t * 0.3);
      }
    }
    return b;
  }

  private noise(dur: number, at = 0): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const off = Math.random() * 1.5;
    s.start(ctx.currentTime + at, off, dur + 0.1);
    return s;
  }

  private env(g: GainNode, t0: number, a: number, peak: number, d: number, sustain = 0.0001): void {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t0 + a + d);
  }

  /** Inharmonic metallic ping (bells, steel, coins). */
  private metal(freq: number, ratios: number[], dur: number, vol: number, at = 0, bus?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    for (let i = 0; i < ratios.length; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratios[i];
      const g = ctx.createGain();
      this.env(g, t, 0.002, vol / (i + 1), dur / (1 + i * 0.4));
      o.connect(g).connect(bus ?? this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private filteredNoise(type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, vol: number, at = 0, attack = 0.005): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const s = this.noise(dur, at);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    s.connect(f).connect(g).connect(this.sfxBus);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0, attack = 0.005, bus?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  play(name: Sfx, opts: { vol?: number; at?: number } = {}): void {
    if (!this.ctx || this.muted || this.suppressed) return;
    const v = opts.vol ?? 1;
    const at = opts.at ?? 0;
    switch (name) {
      case 'hover':
        this.tone('sine', 740, 690, 0.06, 0.05 * v, at);
        this.filteredNoise('bandpass', 2400, 1800, 2, 0.04, 0.03 * v, at);
        break;
      case 'click':
        this.tone('triangle', 260, 140, 0.12, 0.22 * v, at);
        this.filteredNoise('lowpass', 1800, 400, 1, 0.08, 0.12 * v, at);
        break;
      case 'swish':
        this.filteredNoise('bandpass', 900, 3800, 1.4, 0.22, 0.16 * v, at, 0.04);
        break;
      case 'deal':
        this.filteredNoise('bandpass', 1400, 4200, 1.2, 0.14, 0.13 * v, at, 0.02);
        this.filteredNoise('lowpass', 900, 300, 1, 0.05, 0.12 * v, at + 0.14);
        break;
      case 'place':
        this.filteredNoise('lowpass', 1400, 300, 1, 0.07, 0.25 * v, at);
        this.tone('sine', 150, 90, 0.08, 0.15 * v, at);
        break;
      case 'flip':
        this.filteredNoise('bandpass', 1800, 3000, 2, 0.07, 0.14 * v, at);
        this.filteredNoise('bandpass', 2400, 1500, 2, 0.08, 0.12 * v, at + 0.07);
        break;
      case 'draw':
        this.filteredNoise('bandpass', 700, 2600, 1.2, 0.3, 0.15 * v, at, 0.05);
        break;
      case 'shuffle':
        for (let i = 0; i < 9; i++) this.filteredNoise('bandpass', 1200 + Math.random() * 1500, 2800, 1.5, 0.06, 0.1 * v, at + i * 0.07);
        break;
      case 'chime':
        this.metal(880, [1, 2.76, 5.4, 8.9], 1.6, 0.11 * v, at);
        this.metal(1318.5, [1, 2.76, 5.4], 1.3, 0.06 * v, at + 0.12);
        break;
      case 'ignite':
        this.filteredNoise('lowpass', 300, 2600, 0.7, 0.35, 0.12 * v, at, 0.08);
        break;
      case 'tick':
        this.tone('square', 1800, 1700, 0.02, 0.03 * v, at);
        break;
      case 'parry':
        this.metal(620, [1, 2.4, 3.9, 5.6, 7.7], 1.1, 0.16 * v, at);
        this.filteredNoise('highpass', 4000, 6000, 0.5, 0.18, 0.22 * v, at);
        this.tone('sawtooth', 220, 120, 0.12, 0.06 * v, at);
        break;
      case 'bounty':
        this.tone('sine', 120, 45, 0.5, 0.5 * v, at, 0.004);
        this.filteredNoise('lowpass', 900, 120, 1, 0.4, 0.35 * v, at);
        for (let i = 0; i < 4; i++) this.metal(400 + i * 90, [1, 2.2, 3.7], 0.3, 0.05 * v, at + 0.12 + i * 0.06);
        break;
      case 'scry': {
        const ctx = this.ctx;
        const t = ctx.currentTime + at;
        for (let i = 0; i < 3; i++) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(midiHz(74 + i * 7), t);
          o.frequency.exponentialRampToValueAtTime(midiHz(86 + i * 4), t + 1.2);
          const g = ctx.createGain();
          this.env(g, t + i * 0.08, 0.25, 0.05 * v, 1.4);
          o.connect(g).connect(this.sfxBus);
          o.start(t);
          o.stop(t + 1.8);
        }
        break;
      }
      case 'coins':
        for (let i = 0; i < 7; i++) this.metal(2200 + Math.random() * 900, [1, 1.53, 2.31], 0.25, 0.05 * v, at + i * 0.045 + Math.random() * 0.02);
        break;
      case 'stinger': {
        // Low brass-like cluster with a rising noise swell.
        const ctx = this.ctx;
        const t = ctx.currentTime + at;
        for (const m of [38, 41, 44, 50]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = midiHz(m);
          o.detune.value = (Math.random() - 0.5) * 18;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.setValueAtTime(200, t);
          f.frequency.exponentialRampToValueAtTime(1600, t + 0.25);
          f.frequency.exponentialRampToValueAtTime(300, t + 2.5);
          const g = ctx.createGain();
          this.env(g, t, 0.04, 0.09 * v, 2.8);
          o.connect(f).connect(g).connect(this.sfxBus);
          o.start(t);
          o.stop(t + 3);
        }
        this.tone('sine', 70, 34, 1.2, 0.55 * v, at, 0.01);
        this.filteredNoise('highpass', 800, 4000, 0.4, 0.5, 0.08 * v, at);
        break;
      }
      case 'heartbeat':
        this.tone('sine', 62, 40, 0.18, 0.55 * v, at, 0.006);
        this.tone('sine', 58, 38, 0.2, 0.42 * v, at + 0.22, 0.006);
        break;
      case 'angel': {
        const ctx = this.ctx;
        const t = ctx.currentTime + at;
        // Choir pad: stacked vowels via formant-ish filtered saws.
        for (const m of [62, 66, 69, 74, 78]) {
          for (const det of [-6, 6]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = midiHz(m);
            o.detune.value = det;
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 5 + Math.random();
            const lg = ctx.createGain();
            lg.gain.value = 4;
            lfo.connect(lg).connect(o.detune);
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.value = 800;
            f.Q.value = 1.4;
            const g = ctx.createGain();
            this.env(g, t, 0.35, 0.035 * v, 2.6);
            o.connect(f).connect(g).connect(this.sfxBus);
            o.start(t);
            o.stop(t + 3.2);
            lfo.start(t);
            lfo.stop(t + 3.2);
          }
        }
        // Shimmer bells.
        [86, 90, 93, 98, 102].forEach((m, i) => this.metal(midiHz(m), [1, 2.01, 3.0], 1.5, 0.05 * v, at + 0.15 + i * 0.09));
        this.filteredNoise('highpass', 5000, 9000, 0.4, 1.6, 0.05 * v, at, 0.4);
        break;
      }
      case 'slash':
        this.filteredNoise('bandpass', 2500, 9000, 3, 0.18, 0.32 * v, at, 0.003);
        this.metal(1900, [1, 2.3, 3.6, 5.1], 0.7, 0.08 * v, at + 0.03);
        break;
      case 'thud':
        this.tone('sine', 110, 38, 0.45, 0.7 * v, at, 0.004);
        this.filteredNoise('lowpass', 700, 90, 1, 0.35, 0.45 * v, at);
        break;
      case 'snuff':
        this.filteredNoise('lowpass', 1600, 200, 0.6, 0.3, 0.12 * v, at, 0.01);
        break;
      case 'paper':
        this.filteredNoise('bandpass', 3000, 1600, 0.8, 0.25, 0.14 * v, at, 0.01);
        this.filteredNoise('lowpass', 600, 200, 0.6, 0.12, 0.3 * v, at + 0.2);
        break;
      case 'whoosh':
        this.filteredNoise('bandpass', 300, 1800, 0.9, 0.5, 0.14 * v, at, 0.2);
        break;
      case 'win':
        [62, 66, 69, 74].forEach((m, i) => this.pluck(m, at + i * 0.12, 0.6 * v));
        this.play('coins', { at: at + 0.5, vol: v });
        break;
      case 'lose':
        [62, 60, 57, 50].forEach((m, i) => this.pluck(m, at + i * 0.22, 0.5 * v));
        break;
    }
  }

  // ------------------------------------------------------------------ ambience

  private startAmbience(): void {
    const ctx = this.ctx!;
    // Fire bed: brown-ish noise through a lowpass.
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    s.connect(lp).connect(g).connect(this.ambBus);
    s.start();
    // Crackles.
    const crackle = () => {
      if (!this.ctx) return;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t = Math.random() * 0.2;
        const src = this.noise(0.03, t);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1500 + Math.random() * 3000;
        const gg = ctx.createGain();
        this.env(gg, ctx.currentTime + t, 0.001, 0.05 + Math.random() * 0.08, 0.03);
        src.connect(hp).connect(gg).connect(this.ambBus);
      }
      setTimeout(crackle, 120 + Math.random() * 700);
    };
    crackle();
  }

  // ------------------------------------------------------------------ music

  private pluckBuffer(midi: number): AudioBuffer {
    const cached = this.pluckCache.get(midi);
    if (cached) return cached;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const dur = 2.2;
    const len = Math.floor(sr * dur);
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const period = sr / midiHz(midi);
    const N = Math.max(2, Math.floor(period));
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    // Pre-filter the excitation for a softer, gut-string tone.
    for (let k = 0; k < 2; k++) for (let i = 1; i < N; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);
    let idx = 0;
    const damp = 0.996 - Math.max(0, midi - 60) * 0.0004;
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % N;
      const v = ring[idx];
      ring[idx] = damp * 0.5 * (v + ring[next]);
      d[i] = v * (i < 40 ? i / 40 : 1);
      idx = next;
    }
    this.pluckCache.set(midi, b);
    return b;
  }

  pluck(midi: number, at = 0, vol = 0.4, bus?: AudioNode): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.pluckBuffer(midi);
    const g = ctx.createGain();
    g.gain.value = vol;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.5;
    s.connect(g).connect(pan).connect(bus ?? this.musicBus);
    s.start(ctx.currentTime + at);
  }

  private startDrone(): void {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.05, ctx.currentTime, 2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(f.frequency);
    lfo.start();
    const oscs: OscillatorNode[] = [];
    for (const [m, det] of [
      [38, -4],
      [38, 5],
      [45, 0],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(m);
      o.detune.value = det;
      o.connect(f);
      o.start();
      oscs.push(o);
    }
    f.connect(out).connect(this.musicBus);
    this.drone = {
      gain: out,
      stop: () => {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.05);
        for (const o of oscs) o.stop(t + 0.5);
        lfo.stop(t + 0.5);
      },
    };
  }

  /** Background tune: D dorian, i–VII–VI–VII, arpeggiated lute with occasional melody. */
  startMusic(): void {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.4);
    if (!this.drone) this.startDrone();
    this.nextBarAt = this.ctx.currentTime + 0.3;
    const schedule = () => {
      if (!this.ctx || !this.musicOn) return;
      while (this.nextBarAt < this.ctx.currentTime + 1.2) {
        this.scheduleBar(this.nextBarAt - this.ctx.currentTime, this.bar++);
        this.nextBarAt += 60 / 76 * 3; // one bar of 3 beats at 76 bpm
      }
      this.musicTimer = window.setTimeout(schedule, 300);
    };
    schedule();
  }

  private scheduleBar(at: number, bar: number): void {
    const beat = 60 / 76;
    const chords = [
      [50, 57, 62, 65, 69], // Dm
      [48, 55, 60, 64, 67], // C
      [46, 53, 58, 62, 65], // Bb
      [48, 55, 60, 64, 67], // C
    ];
    const ch = chords[bar % 4];
    const pattern = bar % 8 < 4 ? [0, 2, 3, 4, 3, 2] : [0, 3, 2, 4, 1, 3];
    pattern.forEach((p, i) => this.pluck(ch[p], at + i * (beat / 2), i === 0 ? 0.34 : 0.22));
    // Melody every other phrase.
    if (bar % 8 >= 4) {
      const scale = [62, 64, 65, 67, 69, 71, 72, 74];
      const motif = [[4, 2, 1], [3, 1, 0], [2, 0, 1], [1, 2, 4]][bar % 4];
      motif.forEach((s, i) => this.pluck(scale[s] + 12, at + i * beat + beat * 0.02, 0.2));
    }
    // Soft frame drum on the downbeat.
    if (this.ctx) {
      this.tone('sine', 90, 50, 0.25, 0.12 + this.tension * 0.15, at, 0.005, this.musicBus);
      if (this.tension > 0.35) this.tone('sine', 85, 48, 0.2, 0.1 * this.tension, at + beat * 1.5, 0.005, this.musicBus);
    }
  }

  /** Cut the music dead (the Hooded Hand has been drawn). */
  cutMusic(): void {
    if (!this.ctx) return;
    this.musicOn = false;
    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.musicTimer = null;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0, t + 0.08);
    this.drone?.stop();
    this.drone = null;
  }

  ambience(level: number): void {
    if (!this.ctx) return;
    this.ambBus.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4);
  }
}

export const audio = new AudioEngine();
export type { Sfx };
