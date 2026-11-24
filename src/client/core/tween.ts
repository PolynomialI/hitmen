// Minimal, allocation-light tween/timeline system driven by the render loop.

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBackSoft: (t: number) => {
    const c1 = 0.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t: number) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  outElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

interface Job {
  start: number;
  dur: number;
  ease: Ease;
  fn: (k: number, t: number) => void;
  done: () => void;
  cancelled: boolean;
  tag?: string;
}

class Tweens {
  private jobs: Job[] = [];
  private time = 0;
  /** Global time scale (used to fast-forward when the event queue backs up). */
  scale = 1;
  /** Every new tween finishes at once (replaying a match's history after a reload). */
  instant = false;

  now(): number {
    return this.time;
  }

  update(dt: number): void {
    this.time += dt * this.scale;
    const t = this.time;
    const jobs = this.jobs;
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      if (j.cancelled) continue;
      let k = j.dur <= 0 ? 1 : (t - j.start) / j.dur;
      if (k < 0) continue;
      if (k >= 1) k = 1;
      j.fn(j.ease(k), k);
      if (k === 1) {
        j.cancelled = true;
        j.done();
      }
    }
    if (jobs.length > 64 || jobs.some((j) => j.cancelled)) this.jobs = jobs.filter((j) => !j.cancelled);
  }

  /** Run fn(easedK, rawK) over dur seconds (after optional delay). Resolves when finished. */
  to(dur: number, fn: (k: number, t: number) => void, opts: { ease?: Ease; delay?: number; tag?: string } = {}): Promise<void> {
    if (this.instant) {
      fn((opts.ease ?? ease.inOutCubic)(1), 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.jobs.push({
        start: this.time + (opts.delay ?? 0),
        dur,
        ease: opts.ease ?? ease.inOutCubic,
        fn,
        done: resolve,
        cancelled: false,
        tag: opts.tag,
      });
    });
  }

  wait(sec: number): Promise<void> {
    return this.to(sec, () => {}, { ease: ease.linear });
  }

  cancel(tag: string): void {
    for (const j of this.jobs) if (j.tag === tag) j.cancelled = true;
  }
}

export const tweens = new Tweens();

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
