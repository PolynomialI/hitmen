// Small value-noise / fbm toolkit for procedural textures (runs once at load, on the CPU).

export class Noise2 {
  private perm: Uint8Array;
  constructor(seed = 1) {
    const p = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    let s = seed >>> 0 || 1;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      const t = base[i];
      base[i] = base[j];
      base[j] = t;
    }
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    this.perm = p;
  }

  private h(x: number, y: number): number {
    return this.perm[(this.perm[x & 255] + y) & 511] / 255;
  }

  /** Value noise in [0,1], tileable with period (px, py) when given. */
  value(x: number, y: number, px = 256, py = 256): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % px) + px) % px;
    const y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px;
    const y1 = (y0 + 1) % py;
    const a = this.h(x0, y0);
    const b = this.h(x1, y0);
    const c = this.h(x0, y1);
    const d = this.h(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Fractal sum, tileable when px/py are the base periods. */
  fbm(x: number, y: number, oct = 4, px = 256, py = 256, gain = 0.5): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      sum += this.value(x * f, y * f, px * f, py * f) * amp;
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }
}
