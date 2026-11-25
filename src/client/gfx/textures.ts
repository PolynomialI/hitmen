import * as THREE from 'three';
import { Noise2 } from './noise';

// Procedural PBR-ish textures generated on the CPU at load. No downloaded assets needed.

export interface TexSet {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

let maxAniso = 4;
export function setMaxAnisotropy(n: number): void {
  maxAniso = n;
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Height field (0..1) to tangent-space normal map. */
function normalFromHeight(h: Float32Array, w: number, hh: number, strength: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, hh);
  const img = ctx.createImageData(w, hh);
  const d = img.data;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const xl = h[y * w + ((x - 1 + w) % w)];
      const xr = h[y * w + ((x + 1) % w)];
      const yu = h[((y - 1 + hh) % hh) * w + x];
      const yd = h[((y + 1) % hh) * w + x];
      let nx = (xl - xr) * strength;
      let ny = (yd - yu) * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(v: Float32Array, w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const g = Math.max(0, Math.min(255, v[i] * 255));
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const rnd = (s: number) => {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ------------------------------------------------------------------ wood

/** Floor planks running along U. */
export function woodPlanks(size = 1024, opts: { planks?: number; seed?: number; dark?: number } = {}): TexSet {
  const n = new Noise2(opts.seed ?? 3);
  const planks = opts.planks ?? 8;
  const dark = opts.dark ?? 1;
  const w = size;
  const h = size;
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  const ph = h / planks;
  // Per-plank end joints.
  const joints: number[][] = [];
  for (let p = 0; p < planks; p++) {
    const j1 = rnd(p * 3.1) * w;
    joints.push([j1, (j1 + w * (0.45 + rnd(p * 7.7) * 0.2)) % w]);
  }
  for (let y = 0; y < h; y++) {
    const p = Math.floor(y / ph);
    const py = (y % ph) / ph;
    for (let x = 0; x < w; x++) {
      // Board segment id changes at joints so tone varies along a plank.
      const seg = x < joints[p][0] ? 0 : x < joints[p][1] ? 1 : 2;
      const sid = p * 3 + (seg === 2 ? 0 : seg);
      const tone = 0.75 + rnd(sid * 1.7) * 0.5;
      const gx = x / w;
      const gy = y / h;
      const grain = n.fbm(gx * 3 + sid * 13.1, gy * 48, 4, 3, 48);
      const rings = Math.sin((grain * 9 + gy * planks * 2) * Math.PI * 2) * 0.5 + 0.5;
      const fine = n.value(gx * 420, gy * 30, 420, 30);
      let v = 0.58 + (grain - 0.5) * 0.55 + rings * 0.06 + (fine - 0.5) * 0.05;
      // Knots.
      const kx = rnd(sid * 9.3) * w;
      const ky = (p + 0.3 + rnd(sid * 4.1) * 0.4) * ph;
      const kd = Math.hypot((x - kx) / 1.0, (y - ky) * 2.2);
      if (kd < 26) v -= (1 - kd / 26) * 0.45;
      // Seams.
      const edge = Math.min(py, 1 - py) * ph;
      let seam = edge < 2 ? 0.15 : edge < 4 ? 0.7 : 1;
      const jd = Math.min(Math.abs(x - joints[p][0]), Math.abs(x - joints[p][1]));
      if (jd < 1.5) seam = Math.min(seam, 0.2);
      // Wear: lighter in the middle of planks.
      const wear = n.fbm(gx * 6, gy * 6, 3, 6, 6);
      v *= tone * seam;
      const i = (y * w + x) * 4;
      const r = (92 + v * 70 + wear * 18) * dark;
      const g = (58 + v * 44 + wear * 10) * dark;
      const b = (34 + v * 24) * dark;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
      height[y * w + x] = seam * 0.8 + grain * 0.2;
      rough[y * w + x] = 0.62 + (1 - wear) * 0.25 + (seam < 1 ? 0.1 : 0);
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: tex(c),
    normalMap: tex(normalFromHeight(height, w, h, 4), false),
    roughnessMap: tex(grayCanvas(rough, w, h), false),
  };
}

/**
 * Furniture wood (bar, boards, chests, frames) with grain along U: rings and figure, open pores dotted along the
 * grain, worn polish (smoother, slightly lighter patches), fine scratches across the grain, and matching normal and
 * roughness maps so the polish catches the candlelight unevenly.
 */
export function woodGrain(size = 512, tint: [number, number, number] = [110, 70, 40], seed = 5): TexSet {
  const n = new Noise2(seed);
  const np = new Noise2(seed + 101);
  const w = size;
  const h = size;
  const k = size / 512;
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  // A few long, faint scratches across the grain.
  const scratches = Array.from({ length: 26 }, (_, i) => ({ x0: rnd(seed + i * 3.3) * w, y0: rnd(seed + i * 7.1) * h, a: (rnd(seed + i * 1.9) - 0.5) * 1.2 + Math.PI / 2, len: (40 + rnd(i * 5.5) * 160) * k }));
  const scratchAt = new Float32Array(w * h);
  for (const sc of scratches) {
    for (let t = 0; t < sc.len; t++) {
      const x = Math.round(sc.x0 + Math.cos(sc.a) * t);
      const y = Math.round(sc.y0 + Math.sin(sc.a) * t);
      scratchAt[(((y % h) + h) % h) * w + (((x % w) + w) % w)] = 1;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / w;
      const gy = y / h;
      const grain = n.fbm(gx * 2, gy * 24, 5, 2, 24);
      const rings = Math.sin((grain * 7 + gy * 5) * Math.PI * 2) * 0.5 + 0.5;
      const fine = n.value(gx * 300, gy * 16, 300, 16);
      // Pores: short dark dashes strung along the grain.
      const pore = Math.max(0, np.value(gx * 160, gy * 90, 160, 90) - 0.78) * 4.5;
      // Worn polish: broad soft patches.
      const wear = n.fbm(gx * 3 + 7, gy * 3, 3, 3, 3);
      const scr = scratchAt[y * w + x];
      let v = 0.62 + (grain - 0.5) * 0.6 + rings * 0.08 + (fine - 0.5) * 0.06 - pore * 0.22 + (wear - 0.5) * 0.12 + scr * 0.05;
      v = Math.max(0.15, v);
      const i = (y * w + x) * 4;
      img.data[i] = Math.min(255, tint[0] * v * 1.05);
      img.data[i + 1] = Math.min(255, tint[1] * v);
      img.data[i + 2] = Math.min(255, tint[2] * v * 0.95);
      img.data[i + 3] = 255;
      height[y * w + x] = rings * 0.45 + fine * 0.35 - pore * 0.5 - scr * 0.3;
      rough[y * w + x] = 0.42 + (1 - wear) * 0.3 + pore * 0.25 + scr * 0.2 + (fine - 0.5) * 0.06;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(height, w, h, 1.6), false), roughnessMap: tex(grayCanvas(rough, w, h), false) };
}

/** Hammered metal (brass, gold): fine dents for the normal map, patina and fingerprint smudges for roughness. */
export function hammeredMetal(size = 256, seed = 61): TexSet {
  const n = new Noise2(seed);
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dents = n.fbm(x / 10, y / 10, 2, size / 10, size / 10);
      const smudge = n.fbm(x / 48 + 4, y / 48, 3, size / 48, size / 48);
      const patina = Math.max(0, n.fbm(x / 30 + 9, y / 30, 3, size / 30, size / 30) - 0.6) * 2.5;
      const v = 0.92 + (smudge - 0.5) * 0.12 - patina * 0.35;
      const i = (y * size + x) * 4;
      img.data[i] = 255 * v;
      img.data[i + 1] = 255 * (v - patina * 0.05);
      img.data[i + 2] = 255 * (v - patina * 0.12);
      img.data[i + 3] = 255;
      height[y * size + x] = dents;
      rough[y * size + x] = 0.22 + smudge * 0.25 + patina * 0.35;
    }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(height, size, size, 2.2), false), roughnessMap: tex(grayCanvas(rough, size, size), false) };
}

/** Soft goods: leather grain (scale ~6) or crushed velvet pile (scale ~24). Grayscale map, tinted by the material. */
export function softGoods(size = 256, scale = 6, seed = 71): TexSet {
  const n = new Noise2(seed);
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = n.fbm(x / scale, y / scale, 3, size / scale, size / scale);
      const b = n.fbm(x / (scale * 6) + 2, y / (scale * 6), 3, size / (scale * 6), size / (scale * 6));
      const v = 0.82 + (a - 0.5) * 0.18 + (b - 0.5) * 0.22;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * Math.min(1, v);
      img.data[i + 3] = 255;
      height[y * size + x] = a * 0.7 + b * 0.3;
    }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(height, size, size, 2.5), false) };
}

/** Parchment: laid fibres, foxing spots and a darker deckled edge tone. */
export function parchmentTex(size = 512, seed = 83): TexSet {
  const n = new Noise2(seed);
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fib = n.value(x / 1.5, y / 9, size / 1.5, size / 9);
      const cloud = n.fbm(x / 70, y / 70, 4, size / 70, size / 70);
      const fox = Math.max(0, n.fbm(x / 22 + 6, y / 22, 3, size / 22, size / 22) - 0.66) * 3;
      const v = 0.9 + (cloud - 0.5) * 0.2 + (fib - 0.5) * 0.06 - fox * 0.3;
      const i = (y * size + x) * 4;
      img.data[i] = 255 * v;
      img.data[i + 1] = 245 * v - fox * 18;
      img.data[i + 2] = 220 * v - fox * 40;
      img.data[i + 3] = 255;
      height[y * size + x] = fib * 0.4 + cloud * 0.6;
    }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(height, size, size, 1.2), false) };
}

// ------------------------------------------------------------------ stone & plaster

export function stoneWall(size = 1024, seed = 9): TexSet {
  const n = new Noise2(seed);
  const w = size;
  const h = size;
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  const height = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  const rows = 7;
  const rh = h / rows;
  // Precompute row block boundaries.
  const rowsB: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const b: number[] = [];
    let x = -rnd(r * 2.3) * 120;
    while (x < w) {
      b.push(x);
      x += 110 + rnd(r * 13 + b.length * 3.7) * 150;
    }
    b.push(w + 400);
    rowsB.push(b);
  }
  const mortar = 7;
  for (let y = 0; y < h; y++) {
    const r = Math.floor(y / rh);
    const ry = y - r * rh;
    const b = rowsB[r];
    let k = 0;
    for (let x = 0; x < w; x++) {
      while (x >= b[k + 1]) k++;
      const bx0 = b[k];
      const bx1 = Math.min(b[k + 1], w + 1000);
      const dx = Math.min(x - bx0, bx1 - x);
      const dy = Math.min(ry, rh - ry);
      // Wobbly edges so blocks look hand cut.
      const wob = (n.fbm(x / 40, y / 40, 3, (w / 40) | 0, (h / 40) | 0) - 0.5) * 10;
      const de = Math.min(dx, dy) + wob;
      const id = r * 31 + k;
      const tone = 0.72 + rnd(id * 1.31) * 0.36;
      const tint = rnd(id * 7.7);
      const surf = n.fbm(x / 90 + id, y / 90, 5, 64, 64);
      const pits = n.value(x / 3.2, y / 3.2, w / 3.2, h / 3.2);
      let v: number;
      let hv: number;
      if (de < mortar) {
        v = 0.38 + surf * 0.12;
        hv = 0.05 + pits * 0.05;
      } else {
        const bevel = Math.min(1, (de - mortar) / 14);
        v = (0.55 + (surf - 0.5) * 0.6 + (pits - 0.5) * 0.12) * tone;
        hv = 0.3 + bevel * 0.55 + surf * 0.25 + pits * 0.04;
      }
      const i = (y * w + x) * 4;
      img.data[i] = 150 * v + tint * 18;
      img.data[i + 1] = 138 * v + tint * 8;
      img.data[i + 2] = 122 * v;
      img.data[i + 3] = 255;
      height[y * w + x] = hv;
      rough[y * w + x] = de < mortar ? 0.95 : 0.78 + pits * 0.15;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: tex(c),
    normalMap: tex(normalFromHeight(height, w, h, 9), false),
    roughnessMap: tex(grayCanvas(rough, w, h), false),
  };
}

export function plaster(size = 512, seed = 21): TexSet {
  const n = new Noise2(seed);
  const nc = new Noise2(seed + 7);
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = y / size;
    for (let x = 0; x < size; x++) {
      const a = n.fbm(x / 64, y / 64, 5, size / 64, size / 64);
      const trowel = n.fbm(x / 22 + 3, y / 9, 3, size / 22, size / 9);
      const stain = n.fbm(x / 160 + 5, y / 160, 3, size / 160, size / 160);
      // Hairline cracks: thin ridges of a warped noise field.
      const cr = Math.abs(nc.fbm(x / 90, y / 90, 4, size / 90, size / 90) - 0.5);
      const crack = cr < 0.007 ? 1 - cr / 0.007 : 0;
      // Soot creeps down from the top of each tile (the ceiling side).
      const soot = Math.pow(1 - gy, 3) * 0.25 * (0.6 + a * 0.8);
      const v = 0.8 + (a - 0.5) * 0.18 + (trowel - 0.5) * 0.08 - Math.max(0, stain - 0.55) * 0.6 - crack * 0.12 - soot;
      const i = (y * size + x) * 4;
      img.data[i] = 214 * v;
      img.data[i + 1] = 196 * v;
      img.data[i + 2] = 162 * v;
      img.data[i + 3] = 255;
      height[y * size + x] = a * 0.7 + trowel * 0.3 - crack * 0.4;
      rough[y * size + x] = 0.85 + (a - 0.5) * 0.1 - Math.max(0, stain - 0.55) * 0.3;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: tex(normalFromHeight(height, size, size, 4), false), roughnessMap: tex(grayCanvas(rough, size, size), false) };
}

// ------------------------------------------------------------------ felt

/** Card-table baize with printed turn-direction arcs and a gilt border ring (texture covers the disc). */
export function feltTable(size = 1024, seed = 33): TexSet {
  const n = new Noise2(seed);
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fine = n.value(x / 1.6, y / 1.6, size / 1.6, size / 1.6);
      const mid = n.fbm(x / 60, y / 60, 4, size / 60, size / 60);
      const r = Math.hypot(x - cx, y - cx) / cx;
      const wear = Math.max(0, 1 - r * 1.4) * 0.12;
      const v = 0.62 + (fine - 0.5) * 0.22 + (mid - 0.5) * 0.25 + wear;
      const i = (y * size + x) * 4;
      img.data[i] = 22 * v + 6;
      img.data[i + 1] = 74 * v + 8;
      img.data[i + 2] = 46 * v + 6;
      img.data[i + 3] = 255;
      height[y * size + x] = fine * 0.6 + mid * 0.4;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Printed turn arcs (two curved arrows chasing each other).
  ctx.save();
  ctx.translate(cx, cx);
  ctx.strokeStyle = 'rgba(0,20,8,0.42)';
  ctx.fillStyle = 'rgba(0,20,8,0.42)';
  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.035;
  const R = size * 0.33;
  for (let k = 0; k < 2; k++) {
    const a0 = k * Math.PI + 0.35;
    const a1 = a0 + Math.PI - 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, R, a0, a1);
    ctx.stroke();
    const ax = Math.cos(a1) * R;
    const ay = Math.sin(a1) * R;
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    const nx = Math.cos(a1);
    const ny = Math.sin(a1);
    const s = size * 0.05;
    ctx.beginPath();
    ctx.moveTo(ax + tx * s * 1.3, ay + ty * s * 1.3);
    ctx.lineTo(ax + nx * s, ay + ny * s);
    ctx.lineTo(ax - nx * s, ay - ny * s);
    ctx.closePath();
    ctx.fill();
  }
  // Gilt border rings.
  ctx.strokeStyle = 'rgba(214,170,80,0.75)';
  ctx.lineWidth = size * 0.008;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.47, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = size * 0.003;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.452, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.fillStyle = 'rgba(214,170,80,0.7)';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * size * 0.461, Math.sin(a) * size * 0.461, size * 0.0035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const t = tex(c, true, false);
  return { map: t, normalMap: tex(normalFromHeight(height, size, size, 3), false, false) };
}

// ------------------------------------------------------------------ misc

export function ironTex(size = 256, seed = 44): TexSet {
  const n = new Noise2(seed);
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = n.fbm(x / 24, y / 24, 4, size / 24, size / 24);
      const rust = Math.max(0, n.fbm(x / 50 + 3, y / 50, 3, size / 50, size / 50) - 0.58) * 3;
      const i = (y * size + x) * 4;
      img.data[i] = 40 + a * 30 + rust * 60;
      img.data[i + 1] = 38 + a * 26 + rust * 24;
      img.data[i + 2] = 36 + a * 22;
      img.data[i + 3] = 255;
      rough[y * size + x] = 0.45 + a * 0.3 + rust * 0.3;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c), roughnessMap: tex(grayCanvas(rough, size, size), false) };
}

/** Soft radial glow sprite (white, alpha falloff). */
export function glowSprite(size = 128): THREE.Texture {
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return tex(c, true, false);
}

/** Generic canvas helper for one-off painted textures. */
export function paint(w: number, h: number, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  fn(ctx, w, h);
  return tex(c, srgb, false);
}
