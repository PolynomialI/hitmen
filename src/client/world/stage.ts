import * as THREE from 'three';
import type { Quality } from '../core/gfx';
import type { FlameField } from '../gfx/flames';
import { Noise2 } from '../gfx/noise';
import { paint } from '../gfx/textures';
import type { Mats } from './materials';
import { box, candle, cyl, plank } from './props';

// The minstrels' stage at the east end of the tavern, behind the card table: a carved proscenium with
// red velvet curtains, a swagged valance with gold fringe, footlights, lantern spots with hazy beams,
// a band's instruments, a pleated backdrop strung with little lights, and moonlit windows either side.

export const STAGE = {
  /** Front face of the proscenium wall (world x). */
  PX: 7.7,
  /** Proscenium wall thickness. */
  PT: 0.32,
  /** Opening, across world z. */
  Z0: -2.75,
  Z1: 3.95,
  ZC: 0.6,
  /** Stage floor height. */
  SF: 0.72,
  /** Back wall of the stage house. */
  BACK: 11.4,
  SZ0: -3.35,
  SZ1: 4.55,
  ARCH_SIDE: 3.15,
  ARCH_TOP: 3.6,
  H: 4.4,
};

export interface StageRefs {
  group: THREE.Group;
  spot: THREE.SpotLight;
  footLight: THREE.PointLight;
  stageBannerSpots: THREE.Vector3[];
  /** Window centres (world), for snow etc. */
  windows: THREE.Vector3[];
  /** Points along the valance for garlands. */
  valance: THREE.Vector3[];
  backdropX: number;
  update(t: number, dt: number): void;
  setLevel(k: number): void;
}

// ---------------------------------------------------------------------------------------------- textures

function velvetTexture(): THREE.CanvasTexture {
  const n = new Noise2(91);
  return paint(256, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const streak = n.fbm(x / 3, y / 90, 3, w / 3, h / 90);
        const pile = n.value(x * 1.7, y * 1.7, w * 1.7, h * 1.7);
        const v = 0.8 + (streak - 0.5) * 0.28 + (pile - 0.5) * 0.08;
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v * 255));
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  });
}

function fringeTexture(): THREE.CanvasTexture {
  const t = paint(256, 48, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // Braid along the top.
    const g = ctx.createLinearGradient(0, 0, 0, 12);
    g.addColorStop(0, '#fff0b0');
    g.addColorStop(0.5, '#d9a443');
    g.addColorStop(1, '#7a5014');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 12);
    for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = 'rgba(80,50,10,0.6)';
      ctx.fillRect(x, 2, 2, 8);
    }
    // Threads.
    for (let x = 0; x < w; x += 2.2) {
      const len = h - 14 - Math.random() * 6;
      const tg = ctx.createLinearGradient(0, 12, 0, 12 + len);
      tg.addColorStop(0, '#f2cf6a');
      tg.addColorStop(1, '#8a5c18');
      ctx.strokeStyle = tg;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, 12);
      ctx.lineTo(x + (Math.random() - 0.5) * 1.5, 12 + len);
      ctx.stroke();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function crestPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  // A hooded figure: pointed hood, shoulders, a void for a face.
  ctx.beginPath();
  ctx.moveTo(cx + 0.06 * s, cy - 0.62 * s);
  ctx.bezierCurveTo(cx - 0.32 * s, cy - 0.5 * s, cx - 0.36 * s, cy - 0.05 * s, cx - 0.3 * s, cy + 0.12 * s);
  ctx.bezierCurveTo(cx - 0.55 * s, cy + 0.2 * s, cx - 0.62 * s, cy + 0.45 * s, cx - 0.64 * s, cy + 0.6 * s);
  ctx.lineTo(cx + 0.64 * s, cy + 0.6 * s);
  ctx.bezierCurveTo(cx + 0.62 * s, cy + 0.45 * s, cx + 0.55 * s, cy + 0.2 * s, cx + 0.3 * s, cy + 0.12 * s);
  ctx.bezierCurveTo(cx + 0.36 * s, cy - 0.1 * s, cx + 0.3 * s, cy - 0.42 * s, cx + 0.06 * s, cy - 0.62 * s);
  ctx.closePath();
}

function drumHeadTexture(): THREE.CanvasTexture {
  return paint(512, 512, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c * 0.9, 20, c, c, c);
    g.addColorStop(0, '#f6ead0');
    g.addColorStop(0.75, '#e2cfa6');
    g.addColorStop(1, '#a8885a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = '#7a1418';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(c, c, c - 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#c9952e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(c, c, c - 62, 0, Math.PI * 2);
    ctx.stroke();
    // Crossed daggers behind the crest.
    ctx.fillStyle = '#c9952e';
    for (const a of [-0.6, 0.6]) {
      ctx.save();
      ctx.translate(c, c + 10);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-9, 130);
      ctx.lineTo(-7, -110);
      ctx.lineTo(0, -150);
      ctx.lineTo(7, -110);
      ctx.lineTo(9, 130);
      ctx.fill();
      ctx.fillRect(-34, 96, 68, 12);
      ctx.restore();
    }
    ctx.fillStyle = '#1a0a08';
    crestPath(ctx, c, c + 10, 170);
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(c - 32, c - 26, 22, 8);
    ctx.fillRect(c + 10, c - 26, 22, 8);
    ctx.fillStyle = '#7a1418';
    ctx.font = 'bold 44px "Grenze Gotisch", serif';
    ctx.textAlign = 'center';
    ctx.fillText('The Hooded Hand', c, w - 110);
  });
}

function crestTexture(): THREE.CanvasTexture {
  return paint(256, 320, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // Gilt cartouche.
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#fff0b0');
    g.addColorStop(0.4, '#d9a443');
    g.addColorStop(0.7, '#8a5c18');
    g.addColorStop(1, '#e8c46a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2, 8);
    ctx.bezierCurveTo(w - 10, 20, w - 4, 120, w - 20, 190);
    ctx.bezierCurveTo(w - 40, 260, w / 2 + 30, 290, w / 2, h - 8);
    ctx.bezierCurveTo(w / 2 - 30, 290, 40, 260, 20, 190);
    ctx.bezierCurveTo(4, 120, 10, 20, w / 2, 8);
    ctx.fill();
    ctx.fillStyle = '#5a0f14';
    ctx.beginPath();
    ctx.moveTo(w / 2, 30);
    ctx.bezierCurveTo(w - 32, 40, w - 26, 120, w - 40, 185);
    ctx.bezierCurveTo(w - 58, 245, w / 2 + 24, 266, w / 2, h - 34);
    ctx.bezierCurveTo(w / 2 - 24, 266, 58, 245, 40, 185);
    ctx.bezierCurveTo(26, 120, 32, 40, w / 2, 30);
    ctx.fill();
    ctx.fillStyle = '#e8c46a';
    crestPath(ctx, w / 2, 150, 120);
    ctx.fill();
    ctx.fillStyle = '#1a0606';
    ctx.beginPath();
    ctx.ellipse(w / 2, 128, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9a3a';
    ctx.fillRect(w / 2 - 18, 126, 12, 5);
    ctx.fillRect(w / 2 + 6, 126, 12, 5);
  });
}

function skyTexture(seed: number, moon: boolean): THREE.CanvasTexture {
  const n = new Noise2(seed);
  let r = seed * 9301;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  return paint(512, 768, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#050a1e');
    g.addColorStop(0.45, '#0f1d46');
    g.addColorStop(0.78, '#2a3a72');
    g.addColorStop(1, '#5a4a6a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const a = rnd();
      ctx.fillStyle = `rgba(255,250,230,${0.25 + a * 0.75})`;
      const s = a > 0.94 ? 2.4 : 1.3;
      ctx.fillRect(rnd() * w, rnd() * h * 0.75, s, s);
    }
    if (moon) {
      const mx = w * 0.62;
      const my = h * 0.24;
      const halo = ctx.createRadialGradient(mx, my, 20, mx, my, 230);
      halo.addColorStop(0, 'rgba(220,230,255,0.55)');
      halo.addColorStop(0.3, 'rgba(160,180,255,0.18)');
      halo.addColorStop(1, 'rgba(120,140,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      const mg = ctx.createRadialGradient(mx - 14, my - 12, 4, mx, my, 54);
      mg.addColorStop(0, '#fffdf0');
      mg.addColorStop(0.8, '#e8e4d0');
      mg.addColorStop(1, '#c8c4b8');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,150,140,0.35)';
      for (const [dx, dy, rr] of [
        [-14, -8, 12],
        [16, 10, 9],
        [4, 24, 7],
        [-20, 18, 6],
      ])
        ctx.beginPath(), ctx.arc(mx + dx, my + dy, rr, 0, Math.PI * 2), ctx.fill();
    }
    // Clouds: lit from below by the town.
    const img = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = n.fbm(x / 140, y / 46, 5, w / 140, h / 46);
        const band = Math.exp(-Math.pow((y / h - (moon ? 0.5 : 0.36)) / 0.2, 2));
        const c = Math.max(0, v - 0.48) * 2.4 * band;
        if (c <= 0) continue;
        const i = (y * w + x) * 4;
        const warm = y / h;
        img.data[i] = img.data[i] * (1 - c) + (120 + 120 * warm) * c;
        img.data[i + 1] = img.data[i + 1] * (1 - c) + (110 + 60 * warm) * c;
        img.data[i + 2] = img.data[i + 2] * (1 - c) + (170 - 40 * warm) * c;
      }
    ctx.putImageData(img, 0, 0);
    // Hills, a castle on the hill, rooftops of the town with lit windows.
    ctx.fillStyle = '#0a0c1a';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.72 - Math.sin(x / 90 + seed) * 26 - n.value(x / 30, 3, 100, 10) * 30);
    ctx.lineTo(w, h);
    ctx.fill();
    const cx = moon ? w * 0.3 : w * 0.66;
    const cy = h * 0.68;
    ctx.fillStyle = '#070815';
    ctx.fillRect(cx - 60, cy - 50, 120, 60);
    for (const [tx, tw, th] of [
      [-70, 26, 110],
      [44, 26, 96],
      [-14, 28, 140],
    ]) {
      ctx.fillRect(cx + tx, cy - th, tw, th);
      ctx.beginPath();
      ctx.moveTo(cx + tx - 4, cy - th);
      ctx.lineTo(cx + tx + tw / 2, cy - th - 34);
      ctx.lineTo(cx + tx + tw + 4, cy - th);
      ctx.fill();
    }
    ctx.fillStyle = '#ffc060';
    for (let i = 0; i < 7; i++) ctx.fillRect(cx - 50 + rnd() * 100, cy - 100 + rnd() * 80, 3, 5);
    let x = 0;
    while (x < w) {
      const bw = 26 + rnd() * 40;
      const bh = 40 + rnd() * 60;
      ctx.fillStyle = '#04050c';
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - bh);
      ctx.lineTo(x + bw / 2, h - bh - 22);
      ctx.lineTo(x + bw, h - bh);
      ctx.lineTo(x + bw, h);
      ctx.fill();
      if (rnd() < 0.7) {
        ctx.fillStyle = rnd() < 0.5 ? '#ffb347' : '#ffd27a';
        ctx.fillRect(x + bw * 0.3, h - bh * 0.55, 5, 7);
        if (rnd() < 0.5) ctx.fillRect(x + bw * 0.62, h - bh * 0.35, 5, 7);
      }
      x += bw;
    }
    // Warm town glow on the horizon.
    const tg = ctx.createLinearGradient(0, h * 0.8, 0, h);
    tg.addColorStop(0, 'rgba(255,150,70,0)');
    tg.addColorStop(1, 'rgba(255,150,70,0.18)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
  });
}

// ---------------------------------------------------------------------------------------------- cloth

/**
 * A theatre curtain hanging from its rail and gathered by a tieback. Local frame: z runs across from the fixed
 * edge (z = 0) toward `side`, y is height, x is depth (negative = toward the audience).
 */
function tiedCurtain(o: { top: number; bottom: number; width: number; tieY: number; tieW: number; footW: number; folds: number; amp: number; side: 1 | -1 }): THREE.BufferGeometry {
  const U = 44;
  const V = 40;
  const g = new THREE.PlaneGeometry(1, 1, U, V);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const vt = (o.top - o.tieY) / (o.top - o.bottom);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5;
    const v = 0.5 - p.getY(i);
    let w: number;
    if (v < vt) w = o.tieW + (o.width - o.tieW) * Math.pow(1 - v / vt, 1.6);
    else w = o.tieW + (o.footW - o.tieW) * Math.pow((v - vt) / (1 - vt), 0.75);
    const gather = Math.sqrt(o.width / w);
    const y = o.top - v * (o.top - o.bottom);
    const z = o.side * u * w;
    const belly = Math.exp(-Math.pow((v - vt) / 0.16, 2)) * u;
    const fold = Math.sin(u * o.folds * Math.PI * 2 + v * 0.6) * o.amp * Math.min(2.4, gather) * (0.75 + 0.25 * v);
    const pool = v > 0.96 ? (v - 0.96) * 2.5 : 0;
    p.setXYZ(i, fold - belly * 0.09 - pool * 0.2, y, z);
    uv.setXY(i, u * o.width * 1.2, y * 0.6);
  }
  g.computeVertexNormals();
  return g;
}

/** One swag of a valance: a catenary of cloth gathered at both top corners. Local: z across, y down from 0, x depth. */
function swagGeometry(width: number, drop: number, folds = 5): { geo: THREE.BufferGeometry; edge: THREE.Vector3[] } {
  const U = 30;
  const V = 14;
  const g = new THREE.PlaneGeometry(1, 1, U, V);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5;
    const v = 0.5 - p.getY(i);
    const sag = Math.pow(Math.sin(Math.PI * u), 0.85);
    const hgt = 0.16 + drop * sag;
    const y = -v * hgt;
    const x = -sag * 0.14 * Math.sin(v * Math.PI * 0.9) - Math.sin(v * folds * Math.PI) * 0.03 * sag;
    const z = (u - 0.5) * width * (1 - 0.06 * v * sag);
    p.setXYZ(i, x, y, z);
    uv.setXY(i, u * width, y);
  }
  g.computeVertexNormals();
  for (let k = 0; k <= 24; k++) {
    const u = k / 24;
    const sag = Math.pow(Math.sin(Math.PI * u), 0.85);
    const v = 1;
    const x = -sag * 0.14 * Math.sin(v * Math.PI * 0.9) - Math.sin(v * folds * Math.PI) * 0.03 * sag;
    edge.push(new THREE.Vector3(x, -(0.16 + drop * sag), (u - 0.5) * width * (1 - 0.06 * sag)));
  }
  return { geo: g, edge };
}

/** A ribbon of fringe hanging below a polyline. */
function fringeStrip(pts: THREE.Vector3[], len: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  pts.forEach((pt, i) => {
    if (i > 0) acc += pt.distanceTo(pts[i - 1]);
    pos.push(pt.x, pt.y, pt.z, pt.x, pt.y - len, pt.z);
    uv.push(acc / 0.5, 1, acc / 0.5, 0);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tassel(gold: THREE.Material, s = 1): THREE.Group {
  const g = new THREE.Group();
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 10, 8), gold);
  g.add(knob);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.05 * s, 0.16 * s, 12, 1, true), gold);
  skirt.position.y = -0.1 * s;
  g.add(skirt);
  const cord = cyl(0.006 * s, 0.006 * s, 0.14 * s, gold, 5);
  cord.position.y = 0.09 * s;
  g.add(cord);
  return g;
}

// ---------------------------------------------------------------------------------------------- build

export function buildStage(m: Mats, flames: FlameField, glowTex: THREE.Texture, quality: Quality): StageRefs {
  const S = STAGE;
  const g = new THREE.Group();
  const vt = velvetTexture();
  vt.wrapS = vt.wrapT = THREE.RepeatWrapping;
  // Sheen is a second lighting model per light per pixel, on curtains that fill the view behind the card table.
  const mkVelvet = (color: string, sheen: string) =>
    quality !== 'high'
      ? new THREE.MeshStandardMaterial({ color, map: vt, roughness: 0.78, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.18 })
      : new THREE.MeshPhysicalMaterial({ color, map: vt, roughness: 0.8, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(sheen), side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.16 });
  const velvet = mkVelvet('#a0182a', '#ff9a8a');
  const velvetDeep = mkVelvet('#3a0a12', '#a83a4a');
  const giltMat = new THREE.MeshStandardMaterial({ color: '#d9a443', metalness: 1, roughness: 0.3, emissive: '#4a2a00', emissiveIntensity: 0.5 });
  const lacquer = new THREE.MeshStandardMaterial({ color: '#7a1418', roughness: 0.3, metalness: 0.1 });
  const copper = new THREE.MeshStandardMaterial({ color: '#c0703a', metalness: 1, roughness: 0.32 });
  const varnish = new THREE.MeshStandardMaterial({ color: '#a8501e', map: m.woodLight.map, roughness: 0.28, metalness: 0.05 });
  const ivory = new THREE.MeshStandardMaterial({ color: '#f0e6cc', roughness: 0.4 });
  const ebony = new THREE.MeshStandardMaterial({ color: '#141010', roughness: 0.35 });
  const tin = new THREE.MeshStandardMaterial({ color: '#c8c4bc', metalness: 1, roughness: 0.28 });
  const panelWood = m.woodDark.clone();
  panelWood.color.set('#7a5a44');

  // ------------------------------------------------------------------ proscenium wall
  const archCurve = (k: number) => {
    // k 0..1 from left side to right side along the top of the opening.
    const z = S.Z0 + (S.Z1 - S.Z0) * k;
    const y = S.ARCH_SIDE + (S.ARCH_TOP - S.ARCH_SIDE) * Math.sin(Math.PI * k);
    return [z, y] as const;
  };
  // Shape in (z, y), extruded toward the audience.
  const shape = new THREE.Shape();
  shape.moveTo(-6, 0);
  shape.lineTo(6, 0);
  shape.lineTo(6, S.H);
  shape.lineTo(-6, S.H);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(S.Z0, S.SF);
  hole.lineTo(S.Z1, S.SF);
  for (let i = 0; i <= 32; i++) {
    const [z, y] = archCurve(1 - i / 32);
    hole.lineTo(z, y);
  }
  hole.closePath();
  shape.holes.push(hole);
  // Windows in the flanks (pointed arches).
  const windows = [
    { z: -4.45, w: 1.15, sill: 1.15, h: 2.35, moon: false, seed: 4 },
    { z: 5.2, w: 1.1, sill: 1.15, h: 2.35, moon: true, seed: 8 },
  ];
  const winOutline = (wz: number, ww: number, sill: number, wh: number) => {
    const pts: THREE.Vector2[] = [];
    const spring = sill + wh - ww * 0.62;
    pts.push(new THREE.Vector2(wz - ww / 2, sill), new THREE.Vector2(wz + ww / 2, sill), new THREE.Vector2(wz + ww / 2, spring));
    // Pointed arch: two circular arcs meeting at the apex.
    const r = ww * 0.85;
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.acos((r - ww / 2) / r);
      pts.push(new THREE.Vector2(wz + ww / 2 - r + Math.cos(a) * r, spring + Math.sin(a) * r));
    }
    for (let i = 12; i >= 0; i--) {
      const a = (i / 12) * Math.acos((r - ww / 2) / r);
      pts.push(new THREE.Vector2(wz - ww / 2 + r - Math.cos(a) * r, spring + Math.sin(a) * r));
    }
    return pts;
  };
  for (const wdw of windows) {
    const pts = winOutline(wdw.z, wdw.w, wdw.sill, wdw.h);
    shape.holes.push(new THREE.Path([...pts].reverse()));
  }
  const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: S.PT, bevelEnabled: false, curveSegments: 4 });
  const wallMatFace = new THREE.MeshStandardMaterial({ map: m.plaster.map, normalMap: m.plaster.normalMap, color: '#8a6a58', roughness: 0.92 });
  const wall = new THREE.Mesh(wallGeo, [wallMatFace, panelWood]);
  wall.rotation.y = -Math.PI / 2;
  wall.position.set(S.PX + S.PT, 0, 0);
  wall.receiveShadow = true;
  g.add(wall);
  // Wainscot along the bottom of the wall (both flanks) and a carved cornice along the top.
  for (const [za, zb] of [
    [-6, S.Z0 - 0.3],
    [S.Z1 + 0.3, 6],
  ]) {
    const wp = plank(zb - za, 1.05, 0.05, panelWood, 1);
    wp.rotation.y = -Math.PI / 2;
    wp.position.set(S.PX - 0.025, 0.525, (za + zb) / 2);
    g.add(wp);
    const rail = box(0.08, 0.06, zb - za, m.timber);
    rail.position.set(S.PX - 0.05, 1.07, (za + zb) / 2);
    g.add(rail);
  }
  const cornice = box(0.2, 0.22, 12, m.timber);
  cornice.position.set(S.PX - 0.08, S.H - 0.11, 0);
  g.add(cornice);

  // Pilasters either side of the opening, with gilt capitals, bases and inlay.
  for (const z of [S.Z0 - 0.26, S.Z1 + 0.26]) {
    const ph = S.ARCH_SIDE + 0.25;
    const shaft = box(0.16, ph, 0.46, panelWood);
    shaft.position.set(S.PX - 0.08, ph / 2, z);
    g.add(shaft);
    for (const dz of [-0.12, 0, 0.12]) {
      const flute = box(0.02, ph - 0.7, 0.035, m.woodDark, false);
      flute.position.set(S.PX - 0.165, ph / 2 + 0.05, z + dz);
      g.add(flute);
    }
    const base = box(0.22, 0.28, 0.56, m.timber);
    base.position.set(S.PX - 0.1, 0.14, z);
    g.add(base);
    const baseG = box(0.23, 0.04, 0.57, giltMat, false);
    baseG.position.set(S.PX - 0.1, 0.3, z);
    g.add(baseG);
    const cap = box(0.24, 0.16, 0.6, giltMat);
    cap.position.set(S.PX - 0.11, ph + 0.02, z);
    g.add(cap);
    const capTop = box(0.28, 0.06, 0.66, m.timber);
    capTop.position.set(S.PX - 0.12, ph + 0.13, z);
    g.add(capTop);
    // Volute scrolls on the capital.
    for (const dz of [-0.24, 0.24]) {
      const vol = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 16), giltMat);
      vol.position.set(S.PX - 0.24, ph - 0.02, z + dz);
      vol.rotation.y = Math.PI / 2;
      g.add(vol);
    }
  }
  // Gilt moulding around the arch and the reveal.
  const archPts: THREE.Vector3[] = [];
  archPts.push(new THREE.Vector3(S.PX - 0.03, S.SF, S.Z0 - 0.04));
  for (let i = 0; i <= 40; i++) {
    const [z, y] = archCurve(i / 40);
    const dz = i === 0 ? -0.04 : i === 40 ? 0.04 : 0;
    archPts.push(new THREE.Vector3(S.PX - 0.03, y + 0.04, z + dz));
  }
  archPts.push(new THREE.Vector3(S.PX - 0.03, S.SF, S.Z1 + 0.04));
  const archTube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPts, false, 'catmullrom', 0.02), 160, 0.045, 8, false), giltMat);
  g.add(archTube);
  const archTube2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPts.map((p) => p.clone().add(new THREE.Vector3(0, 0.11, 0))).slice(1, -1), false, 'catmullrom', 0.02), 120, 0.022, 6, false), giltMat);
  g.add(archTube2);
  // Crest cartouche at the crown of the arch, flanked by gilt scrolls.
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshStandardMaterial({ map: crestTexture(), transparent: true, alphaTest: 0.3, roughness: 0.4, metalness: 0.4, emissive: '#2a1400', emissiveIntensity: 0.6 }));
  crest.position.set(S.PX - 0.07, S.ARCH_TOP + 0.38, S.ZC);
  crest.rotation.y = -Math.PI / 2;
  crest.userData.noBatch = true;
  g.add(crest);
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const k = i / 20;
      pts.push(new THREE.Vector3(S.PX - 0.06, S.ARCH_TOP + 0.3 + Math.sin(k * Math.PI * 1.3) * 0.16 - k * 0.1, S.ZC + side * (0.34 + k * 0.9)));
    }
    const scroll = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.028, 6, false), giltMat);
    g.add(scroll);
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.024, 8, 18, Math.PI * 1.6), giltMat);
    curl.position.copy(pts[pts.length - 1]).add(new THREE.Vector3(0, 0.07, 0));
    curl.rotation.y = -Math.PI / 2;
    g.add(curl);
  }

  // ------------------------------------------------------------------ stage house
  const houseD = S.BACK - (S.PX + S.PT);
  const hx = S.PX + S.PT + houseD / 2;
  const floorTex = m.floor.map!.clone();
  floorTex.repeat.set(2, 2.4);
  floorTex.needsUpdate = true;
  const stageFloorMat = new THREE.MeshStandardMaterial({ map: floorTex, normalMap: m.floor.normalMap, roughness: 0.55, color: '#c8a888' });
  const deck = box(houseD + 0.02, S.SF, S.SZ1 - S.SZ0, stageFloorMat);
  deck.position.set(hx, S.SF / 2, (S.SZ0 + S.SZ1) / 2);
  g.add(deck);
  const ceilH = new THREE.Mesh(new THREE.PlaneGeometry(houseD, S.SZ1 - S.SZ0), new THREE.MeshStandardMaterial({ color: '#140a08', roughness: 1 }));
  ceilH.rotation.x = Math.PI / 2;
  ceilH.position.set(hx, S.H, (S.SZ0 + S.SZ1) / 2);
  g.add(ceilH);
  for (const z of [S.SZ0, S.SZ1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(houseD, S.H - S.SF), new THREE.MeshStandardMaterial({ color: '#1e100c', roughness: 1 }));
    sw.position.set(hx, (S.H + S.SF) / 2, z);
    sw.rotation.y = z < 0 ? 0 : Math.PI;
    g.add(sw);
  }
  // Pleated backdrop.
  const bdW = S.SZ1 - S.SZ0;
  const bdGeo = new THREE.PlaneGeometry(bdW, S.H - S.SF, 160, 6);
  {
    const p = bdGeo.attributes.position as THREE.BufferAttribute;
    const uv = bdGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const k = (x / bdW + 0.5) * 30 * Math.PI * 2;
      p.setZ(i, Math.sin(k) * 0.06 + Math.sin(k * 0.5 + 1) * 0.03);
      uv.setXY(i, (x / bdW + 0.5) * bdW * 1.2, (p.getY(i) / (S.H - S.SF) + 0.5) * 3);
    }
    bdGeo.computeVertexNormals();
  }
  const backdrop = new THREE.Mesh(bdGeo, velvetDeep);
  backdrop.rotation.y = -Math.PI / 2;
  backdrop.position.set(S.BACK - 0.1, (S.H + S.SF) / 2, (S.SZ0 + S.SZ1) / 2);
  g.add(backdrop);
  // Hanging crest banner in the centre of the backdrop.
  const banTex = paint(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2a0608';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9952e';
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, w - 28, h - 70);
    ctx.fillStyle = '#c9952e';
    crestPath(ctx, w / 2, h * 0.42, 150);
    ctx.fill();
    ctx.fillStyle = '#0c0204';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.36, 30, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9a3a';
    ctx.fillRect(w / 2 - 20, h * 0.355, 13, 5);
    ctx.fillRect(w / 2 + 7, h * 0.355, 13, 5);
    // Swallowtail bottom.
    ctx.clearRect(0, h - 56, w, 56);
    ctx.fillStyle = '#2a0608';
    ctx.beginPath();
    ctx.moveTo(0, h - 56);
    ctx.lineTo(w, h - 56);
    ctx.lineTo(w, h);
    ctx.lineTo(w / 2, h - 50);
    ctx.lineTo(0, h);
    ctx.fill();
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), new THREE.MeshStandardMaterial({ map: banTex, transparent: true, alphaTest: 0.4, roughness: 0.85, side: THREE.DoubleSide }));
  banner.position.set(S.BACK - 0.22, 2.55, S.ZC);
  banner.rotation.y = -Math.PI / 2;
  g.add(banner);
  const banRod = cyl(0.02, 0.02, 1.2, giltMat, 8);
  banRod.rotation.x = Math.PI / 2;
  banRod.position.set(S.BACK - 0.22, 3.56, S.ZC);
  g.add(banRod);

  // String lights across the backdrop.
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.7) });
  const wireMat = new THREE.MeshBasicMaterial({ color: '#1a1008' });
  const bulbGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.62, 0.3), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const bulbs: THREE.Sprite[] = [];
  const strand = (za: number, zb: number, y: number, sag: number, n: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      pts.push(new THREE.Vector3(S.BACK - 0.3, y - Math.sin(k * Math.PI) * sag, za + (zb - za) * k));
    }
    const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.005, 4, false), wireMat);
    g.add(wire);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const pt = new THREE.Vector3(S.BACK - 0.3, y - Math.sin(k * Math.PI) * sag - 0.03, za + (zb - za) * k);
      const b = new THREE.Mesh(bulbGeo, bulbMat);
      b.position.copy(pt);
      g.add(b);
      const sp = new THREE.Sprite(glowMat);
      sp.position.copy(pt);
      sp.scale.setScalar(0.22);
      g.add(sp);
      bulbs.push(sp);
    }
  };
  strand(S.SZ0 + 0.3, S.ZC - 0.6, 3.75, 0.55, 9);
  strand(S.ZC + 0.6, S.SZ1 - 0.3, 3.75, 0.55, 9);
  strand(S.SZ0 + 0.3, S.SZ1 - 0.3, 4.15, 0.75, 22);

  // ------------------------------------------------------------------ apron and footlights
  const apronDepth = 0.95;
  const apronShape = new THREE.Shape();
  apronShape.moveTo(S.Z0 - 0.02, 0);
  for (let i = 0; i <= 40; i++) {
    const k = i / 40;
    const z = S.Z0 - 0.02 + (S.Z1 - S.Z0 + 0.04) * k;
    apronShape.lineTo(z, Math.pow(Math.sin(Math.PI * k), 0.55) * apronDepth + 0.02);
  }
  apronShape.lineTo(S.Z1 + 0.02, 0);
  apronShape.closePath();
  const apronGeo = new THREE.ExtrudeGeometry(apronShape, { depth: S.SF, bevelEnabled: false, curveSegments: 6 });
  apronGeo.rotateX(Math.PI / 2);
  apronGeo.rotateY(Math.PI / 2);
  // After rotations: shape x → world z, shape y → world -x, extrusion → world -y. Lift so it spans 0..SF.
  apronGeo.translate(S.PX + 0.01, S.SF, 0);
  const apron = new THREE.Mesh(apronGeo, [stageFloorMat, panelWood]);
  apron.receiveShadow = true;
  g.add(apron);
  const edgePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 48; i++) {
    const k = i / 48;
    const z = S.Z0 + (S.Z1 - S.Z0) * k;
    edgePts.push(new THREE.Vector3(S.PX - Math.pow(Math.sin(Math.PI * k), 0.55) * apronDepth - 0.01, S.SF + 0.005, z));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts), 120, 0.03, 6, false), giltMat));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts.map((p) => p.clone().add(new THREE.Vector3(0, -0.12, 0)))), 120, 0.014, 5, false), giltMat));
  // Footlights: brass reflector shells with oil flames, hooded toward the stage.
  const shellGeo = new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI, 0, Math.PI / 2);
  const footFlames: number[] = [];
  for (let i = 1; i < 10; i++) {
    const k = i / 10;
    const z = S.Z0 + (S.Z1 - S.Z0) * k;
    const x = S.PX - Math.pow(Math.sin(Math.PI * k), 0.55) * apronDepth + 0.12;
    const cup = cyl(0.04, 0.05, 0.035, m.brass, 10);
    cup.position.set(x, S.SF + 0.02, z);
    g.add(cup);
    const shell = new THREE.Mesh(shellGeo, m.brass);
    shell.position.set(x - 0.035, S.SF + 0.035, z);
    shell.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    g.add(shell);
    footFlames.push(flames.add(new THREE.Vector3(x, S.SF + 0.045, z), 0.85));
  }
  void footFlames;

  // ------------------------------------------------------------------ main curtains (tied back) + valance
  const curtainTop = S.H - 0.05;
  for (const side of [1, -1] as const) {
    const edgeZ = side === 1 ? S.Z0 - 0.1 : S.Z1 + 0.1;
    const geo = tiedCurtain({ top: curtainTop, bottom: S.SF, width: 2.0, tieY: 1.75, tieW: 0.42, footW: 0.95, folds: 9, amp: 0.035, side });
    const c = new THREE.Mesh(geo, velvet);
    c.position.set(S.PX + S.PT + 0.18, 0, edgeZ);
    c.receiveShadow = true;
    c.userData.noBatch = true;
    g.add(c);
    // Tieback: gilt rope around the gather, with a tassel.
    const tz = edgeZ + side * 0.26;
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 24), giltMat);
    rope.position.set(S.PX + S.PT + 0.12, 1.75, tz);
    rope.scale.set(1, 0.32, 1.25);
    g.add(rope);
    const t = tassel(giltMat, 1.3);
    t.position.set(S.PX + S.PT + 0.0, 1.55, tz + side * 0.12);
    g.add(t);
  }
  // Valance: five swags with gold fringe, jabots at the ends, gathered behind the arch.
  const valTop = S.ARCH_TOP + 0.05;
  const nSw = 5;
  const span = S.Z1 - S.Z0 + 0.4;
  const swW = span / nSw;
  const fringeTex = fringeTexture();
  const fringeMat = new THREE.MeshStandardMaterial({ map: fringeTex, transparent: true, alphaTest: 0.45, metalness: 0.6, roughness: 0.42, side: THREE.DoubleSide, emissive: '#3a2200', emissiveIntensity: 0.5 });
  const valance: THREE.Vector3[] = [];
  for (let i = 0; i < nSw; i++) {
    const zc = S.Z0 - 0.2 + swW * (i + 0.5);
    const drop = 0.38 + (i === 2 ? 0.06 : 0);
    const { geo, edge } = swagGeometry(swW * 1.08, drop);
    const sw = new THREE.Mesh(geo, velvet);
    sw.position.set(S.PX + S.PT + 0.06, valTop, zc);
    sw.userData.noBatch = true;
    g.add(sw);
    const world = edge.map((p) => p.clone().add(sw.position));
    const fr = new THREE.Mesh(fringeStrip(world.map((p) => p.clone().add(new THREE.Vector3(-0.004, 0.01, 0))), 0.11), fringeMat);
    g.add(fr);
    valance.push(world[Math.floor(world.length / 2)]);
    const tz = S.Z0 - 0.2 + swW * i;
    if (i > 0) {
      const ts = tassel(giltMat, 1.1);
      ts.position.set(S.PX + S.PT + 0.0, valTop - 0.2, tz);
      g.add(ts);
    }
  }
  for (const side of [-1, 1]) {
    const jz = side < 0 ? S.Z0 + 0.05 : S.Z1 - 0.05;
    const jab = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.25, 8, 8), velvet);
    const p = jab.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      // Cascade: zig-zag pleats and an angled hem.
      p.setZ(i, Math.abs(((x / 0.42 + 0.5) * 4) % 2 - 1) * 0.07);
      const hem = -0.62 + (side < 0 ? x / 0.42 + 0.5 : 0.5 - x / 0.42) * 0.5;
      if (y < hem) p.setY(i, hem);
    }
    jab.geometry.computeVertexNormals();
    jab.position.set(S.PX + S.PT + 0.02, valTop - 0.62, jz);
    jab.rotation.y = -Math.PI / 2;
    jab.userData.noBatch = true;
    g.add(jab);
  }
  // Valance rail hidden behind the arch.
  const rail = box(0.08, 0.08, span + 0.6, m.woodDark);
  rail.position.set(S.PX + S.PT + 0.08, valTop + 0.02, S.ZC);
  g.add(rail);

  // ------------------------------------------------------------------ the band's instruments
  const SF = S.SF;
  const stool = (x: number, z: number) => {
    const st = new THREE.Group();
    const seat = cyl(0.17, 0.17, 0.05, m.woodLight, 14);
    seat.position.y = 0.48;
    st.add(seat);
    for (let k = 0; k < 3; k++) {
      const b = (k / 3) * Math.PI * 2;
      const l = cyl(0.018, 0.024, 0.48, m.woodDark, 6);
      l.position.set(Math.cos(b) * 0.11, 0.24, Math.sin(b) * 0.11);
      st.add(l);
    }
    st.position.set(x, SF, z);
    g.add(st);
  };
  // Bass drum on its side, painted head toward the audience.
  {
    const dg = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.34, 32, 1, true), lacquer);
    shell.rotation.z = Math.PI / 2;
    dg.add(shell);
    const headMat = new THREE.MeshStandardMaterial({ map: drumHeadTexture(), roughness: 0.75 });
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.355, 32), headMat);
    head.rotation.y = -Math.PI / 2;
    head.position.x = -0.171;
    head.userData.noBatch = true;
    dg.add(head);
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.355, 24), m.parchment);
    back.rotation.y = Math.PI / 2;
    back.position.x = 0.171;
    dg.add(back);
    for (const x of [-0.17, 0.17]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.365, 0.022, 8, 40), m.brass);
      hoop.rotation.y = Math.PI / 2;
      hoop.position.x = x;
      dg.add(hoop);
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rod = cyl(0.006, 0.006, 0.34, m.brass, 4);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, Math.cos(a) * 0.372, Math.sin(a) * 0.372);
      dg.add(rod);
    }
    for (const z of [-0.2, 0.2]) {
      const leg = cyl(0.012, 0.012, 0.3, m.iron, 5);
      leg.position.set(-0.05, -0.3, z);
      leg.rotation.x = z > 0 ? -0.5 : 0.5;
      dg.add(leg);
    }
    dg.position.set(8.85, SF + 0.4, -1.75);
    dg.rotation.y = 0.25;
    g.add(dg);
  }
  // Kettle drums on tripods.
  const kettle = (x: number, z: number, r: number, h: number) => {
    const kg = new THREE.Group();
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * (Math.PI / 2);
      prof.push(new THREE.Vector2(Math.sin(a) * r, -Math.cos(a) * r * 0.85));
    }
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), copper);
    kg.add(bowl);
    const skin = new THREE.Mesh(new THREE.CircleGeometry(r, 24), m.parchment);
    skin.rotation.x = -Math.PI / 2;
    skin.position.y = 0.002;
    kg.add(skin);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 6, 32), m.brass);
    hoop.rotation.x = Math.PI / 2;
    kg.add(hoop);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      const leg = cyl(0.01, 0.012, h, m.iron, 5);
      leg.position.set(Math.cos(a) * r * 0.45, -h / 2 - 0.05, Math.sin(a) * r * 0.45);
      leg.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
      kg.add(leg);
    }
    kg.position.set(x, SF + h, z);
    g.add(kg);
  };
  kettle(9.45, -2.45, 0.27, 0.62);
  kettle(9.65, -1.05, 0.23, 0.58);
  // Mallets resting on a kettle.
  for (const dz of [-0.05, 0.05]) {
    const stick = cyl(0.008, 0.008, 0.36, m.woodLight, 5);
    stick.rotation.set(0, 0.4, Math.PI / 2 - 0.08);
    stick.position.set(9.45, SF + 0.64, -2.45 + dz);
    g.add(stick);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), m.parchment);
    ball.position.set(9.45 - 0.16, SF + 0.65, -2.45 + dz - 0.07);
    g.add(ball);
  }
  // Gong in a carved frame.
  {
    const gg = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.025, 48), new THREE.MeshStandardMaterial({ color: '#c8942e', metalness: 1, roughness: 0.22, emissive: '#2a1600', emissiveIntensity: 0.4 }));
    disc.rotation.z = Math.PI / 2;
    gg.add(disc);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), m.brass);
    boss.scale.set(0.35, 1, 1);
    boss.position.x = -0.015;
    gg.add(boss);
    for (const rr of [0.18, 0.3]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.006, 4, 40), m.brass);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = -0.014;
      gg.add(ring);
    }
    for (const z of [-0.56, 0.56]) {
      const post = box(0.08, 1.5, 0.08, m.woodDark);
      post.position.set(0, -0.08, z);
      gg.add(post);
      const foot = box(0.4, 0.06, 0.12, m.woodDark);
      foot.position.set(0, -0.8, z);
      gg.add(foot);
      const cord = cyl(0.004, 0.004, 0.22, m.leather, 4);
      cord.position.set(0, 0.52, z * 0.55);
      cord.rotation.x = z > 0 ? 0.9 : -0.9;
      gg.add(cord);
    }
    const bar = box(0.09, 0.09, 1.3, m.woodDark);
    bar.position.y = 0.67;
    gg.add(bar);
    for (const z of [-0.66, 0.66]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), giltMat);
      fin.position.set(0, 0.76, z);
      gg.add(fin);
    }
    gg.position.set(10.55, SF + 0.83, -2.0);
    gg.rotation.y = 0.18;
    g.add(gg);
  }
  stool(9.15, -0.55);
  // Bass viol on its endpin, leaning a touch, with a bow.
  {
    const vg = new THREE.Group();
    const bodyShape = new THREE.Shape();
    const half: THREE.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const k = i / 40;
      const y = -0.45 + k * 0.95;
      const lower = Math.exp(-Math.pow((k - 0.22) / 0.2, 2)) * 0.3;
      const upper = Math.exp(-Math.pow((k - 0.78) / 0.17, 2)) * 0.22;
      const waist = 0.13;
      half.push(new THREE.Vector2(Math.max(waist, lower + 0.02, upper + 0.02) * (k < 0.04 ? k / 0.04 : k > 0.97 ? (1 - k) / 0.03 + 0.4 : 1), y));
    }
    bodyShape.moveTo(0, -0.45);
    for (const p of half) bodyShape.lineTo(p.x, p.y);
    for (const p of [...half].reverse()) bodyShape.lineTo(-p.x, p.y);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(bodyShape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 4 }), varnish);
    body.position.z = -0.07;
    vg.add(body);
    for (const sx of [-0.08, 0.08]) {
      const fh = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.16), m.void);
      fh.position.set(sx, 0.02, 0.1);
      fh.rotation.z = sx > 0 ? -0.12 : 0.12;
      vg.add(fh);
    }
    const neck = box(0.06, 0.62, 0.05, ebony);
    neck.position.set(0, 0.78, 0.07);
    vg.add(neck);
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.018, 8, 16), varnish);
    scroll.position.set(0, 1.13, 0.05);
    scroll.rotation.y = Math.PI / 2;
    vg.add(scroll);
    const tail = box(0.07, 0.2, 0.02, ebony);
    tail.position.set(0, -0.32, 0.11);
    vg.add(tail);
    const bridge = box(0.12, 0.05, 0.03, m.woodLight);
    bridge.position.set(0, -0.12, 0.12);
    vg.add(bridge);
    const strMat = new THREE.LineBasicMaterial({ color: '#d8d0b8' });
    const sp: number[] = [];
    for (const sx of [-0.018, -0.006, 0.006, 0.018]) sp.push(sx, -0.3, 0.125, sx * 0.6, 1.07, 0.1);
    const strings = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)), strMat);
    vg.add(strings);
    const pin = cyl(0.008, 0.004, 0.16, m.iron, 5);
    pin.position.y = -0.55;
    vg.add(pin);
    vg.position.set(9.95, SF + 0.62, -0.35);
    vg.rotation.set(0, -Math.PI / 2 + 0.25, 0.12);
    g.add(vg);
    const bow = cyl(0.006, 0.006, 0.7, m.woodDark, 4);
    bow.position.set(9.7, SF + 0.5, -0.05);
    bow.rotation.set(0.3, 0, 0.9);
    g.add(bow);
  }
  // Harp.
  {
    const hg = new THREE.Group();
    const sbox = box(0.12, 1.25, 0.16, varnish);
    sbox.position.set(0, 0.64, -0.22);
    sbox.rotation.x = 0.3;
    hg.add(sbox);
    const pillar = cyl(0.03, 0.035, 1.45, m.woodLight, 10);
    pillar.position.set(0, 0.72, 0.42);
    hg.add(pillar);
    const neckPts = [new THREE.Vector3(0, 1.38, -0.38), new THREE.Vector3(0, 1.5, -0.12), new THREE.Vector3(0, 1.38, 0.12), new THREE.Vector3(0, 1.48, 0.42)];
    const neckM = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(neckPts), 24, 0.035, 8, false), m.woodLight);
    hg.add(neckM);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), giltMat);
    crown.position.set(0, 1.5, 0.42);
    hg.add(crown);
    const sp: number[] = [];
    const curve = new THREE.CatmullRomCurve3(neckPts);
    for (let i = 1; i < 14; i++) {
      const k = i / 14;
      const top = curve.getPoint(0.05 + k * 0.85);
      const by = 0.12 + (top.z + 0.38) / 0.8 * 1.0;
      const bz = -0.22 - 0.22 + (by - 0.04) * Math.tan(0.3) * 1.0;
      sp.push(0, top.y - 0.02, top.z, 0, by, bz + 0.07);
    }
    hg.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)), new THREE.LineBasicMaterial({ color: '#e8d8a8' })));
    const foot = box(0.2, 0.06, 0.95, m.woodDark);
    foot.position.set(0, 0.03, 0.05);
    hg.add(foot);
    hg.position.set(9.4, SF, 2.05);
    hg.rotation.y = -0.35;
    g.add(hg);
  }
  // Positive organ: a cabinet with a rank of pipes.
  {
    const og = new THREE.Group();
    const cab = box(0.62, 0.95, 1.35, panelWood);
    cab.position.y = 0.475;
    og.add(cab);
    const trim = box(0.64, 0.05, 1.38, giltMat, false);
    trim.position.y = 0.95;
    og.add(trim);
    const desk = box(0.36, 0.05, 1.3, m.woodDark);
    desk.position.set(-0.42, 0.78, 0);
    og.add(desk);
    const keys = box(0.18, 0.025, 1.12, ivory);
    keys.position.set(-0.5, 0.81, 0);
    og.add(keys);
    for (let k = 0; k < 16; k++) {
      if ([2, 6, 9, 13].includes(k)) continue;
      const bk = box(0.1, 0.025, 0.035, ebony, false);
      bk.position.set(-0.46, 0.83, -0.52 + k * 0.07);
      og.add(bk);
    }
    const pipeH = [0.55, 0.7, 0.86, 1.02, 1.2, 1.36, 1.2, 1.02, 0.86, 0.7, 0.55];
    pipeH.forEach((ph, k) => {
      const pz = -0.55 + k * 0.11;
      const pipe = cyl(0.04, 0.04, ph, tin, 12);
      pipe.position.set(0.05, 0.95 + ph / 2 + 0.12, pz);
      og.add(pipe);
      const footC = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 12), tin);
      footC.rotation.x = Math.PI;
      footC.position.set(0.05, 1.01, pz);
      og.add(footC);
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), m.void);
      mouth.position.set(0.009, 1.12, pz);
      mouth.rotation.y = -Math.PI / 2;
      og.add(mouth);
    });
    const crestBar = box(0.1, 0.12, 1.3, giltMat);
    crestBar.position.set(0.05, 2.38, 0);
    og.add(crestBar);
    const bench = plank(0.32, 0.06, 0.9, m.woodDark, 1);
    bench.position.set(-0.85, 0.46, 0);
    og.add(bench);
    for (const z of [-0.38, 0.38]) {
      const bl = box(0.26, 0.43, 0.05, m.woodDark);
      bl.position.set(-0.85, 0.215, z);
      og.add(bl);
    }
    og.position.set(10.55, SF, 2.95);
    og.rotation.y = -0.2;
    g.add(og);
  }
  // Lute on a stand and two music stands.
  {
    const lg = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), varnish);
    bowl.scale.set(1, 0.9, 1.35);
    bowl.rotation.x = Math.PI / 2;
    lg.add(bowl);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), m.woodLight);
    face.scale.set(1, 1.35, 1);
    lg.add(face);
    const rose = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 16), m.void);
    rose.position.set(0, 0.06, 0.002);
    lg.add(rose);
    const neck = box(0.07, 0.42, 0.03, ebony);
    neck.position.set(0, 0.46, 0.01);
    lg.add(neck);
    const head = box(0.08, 0.16, 0.03, varnish);
    head.position.set(0, 0.72, -0.04);
    head.rotation.x = -0.9;
    lg.add(head);
    lg.position.set(8.75, SF + 0.42, 3.55);
    lg.rotation.set(-0.25, -Math.PI / 2 + 0.3, 0);
    g.add(lg);
    const stand = cyl(0.01, 0.01, 0.4, m.iron, 4);
    stand.position.set(8.82, SF + 0.2, 3.55);
    stand.rotation.z = 0.3;
    g.add(stand);
  }
  for (const [x, z, ry] of [
    [9.1, -0.9, 0.3],
    [9.0, 2.7, -0.4],
  ]) {
    const ms = new THREE.Group();
    const rod = cyl(0.008, 0.008, 1.0, m.iron, 5);
    rod.position.y = 0.5;
    ms.add(rod);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = cyl(0.006, 0.006, 0.24, m.iron, 4);
      leg.position.set(Math.cos(a) * 0.08, 0.08, Math.sin(a) * 0.08);
      leg.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      ms.add(leg);
    }
    const desk = box(0.02, 0.26, 0.4, m.iron);
    desk.position.set(0, 1.02, 0);
    desk.rotation.z = -0.4;
    ms.add(desk);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), m.parchment);
    sheet.position.set(-0.016, 1.03, 0);
    sheet.rotation.set(0, -Math.PI / 2, 0.4);
    ms.add(sheet);
    ms.position.set(x, SF, z);
    ms.rotation.y = ry;
    g.add(ms);
  }
  stool(9.35, 3.35);
  // Candelabras at the stage corners.
  for (const z of [S.Z0 + 0.35, S.Z1 - 0.35]) {
    const stand = cyl(0.02, 0.07, 1.3, m.iron, 8);
    stand.position.set(S.PX + S.PT + 0.45, SF + 0.65, z);
    g.add(stand);
    const arm = box(0.04, 0.03, 0.34, m.iron);
    arm.position.set(S.PX + S.PT + 0.45, SF + 1.3, z);
    g.add(arm);
    for (let k = -1; k <= 1; k++) {
      const c = candle(m, flames, new THREE.Vector3(S.PX + S.PT + 0.45, SF + 1.32, z + k * 0.14), 0.12, 0.02);
      g.add(c.group);
    }
  }

  // ------------------------------------------------------------------ windows in the flanks
  const winCenters: THREE.Vector3[] = [];
  for (const wdw of windows) {
    const wg = new THREE.Group();
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(wdw.w * 2.4, wdw.h * 1.6), new THREE.MeshBasicMaterial({ map: skyTexture(wdw.seed, wdw.moon), color: new THREE.Color(1.15, 1.15, 1.25) }));
    sky.position.set(S.PX + S.PT + 0.9, wdw.sill + wdw.h * 0.55, wdw.z);
    sky.rotation.y = -Math.PI / 2;
    wg.add(sky);
    // Tracery: mullion, transoms, a quatrefoil in the arch.
    const tr = m.woodDark;
    const mull = box(0.06, wdw.h - 0.2, 0.05, tr);
    mull.position.set(S.PX + S.PT * 0.5, wdw.sill + (wdw.h - 0.2) / 2, wdw.z);
    wg.add(mull);
    for (const yy of [0.62, 1.28]) {
      const tb = box(0.05, 0.045, wdw.w, tr);
      tb.position.set(S.PX + S.PT * 0.5, wdw.sill + yy, wdw.z);
      wg.add(tb);
    }
    const qf = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 24), tr);
    qf.position.set(S.PX + S.PT * 0.5, wdw.sill + wdw.h - 0.42, wdw.z);
    qf.rotation.y = Math.PI / 2;
    wg.add(qf);
    // Leaded panes: a fine diamond lattice over the glass.
    const lat = paint(128, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(20,14,10,0.9)';
      ctx.lineWidth = 2;
      for (let d = -h; d < w + h; d += 22) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + h * 0.6, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(d, h);
        ctx.lineTo(d + h * 0.6, 0);
        ctx.stroke();
      }
    });
    const lead = new THREE.Mesh(new THREE.PlaneGeometry(wdw.w, wdw.h), new THREE.MeshBasicMaterial({ map: lat, transparent: true, depthWrite: false }));
    lead.position.set(S.PX + S.PT * 0.6, wdw.sill + wdw.h / 2, wdw.z);
    lead.rotation.y = -Math.PI / 2;
    lead.userData.noBatch = true;
    wg.add(lead);
    const sill = box(0.3, 0.07, wdw.w + 0.3, m.stoneHearth);
    sill.position.set(S.PX - 0.06, wdw.sill - 0.035, wdw.z);
    wg.add(sill);
    // Moonlight spilling in.
    const spill = new THREE.Mesh(
      new THREE.PlaneGeometry(wdw.w * 1.9, wdw.h * 1.4),
      new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(0.16, 0.24, 0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    spill.position.set(S.PX - 0.04, wdw.sill + wdw.h * 0.55, wdw.z);
    spill.rotation.y = -Math.PI / 2;
    spill.userData.noBatch = true;
    wg.add(spill);
    g.add(wg);
    winCenters.push(new THREE.Vector3(S.PX + S.PT + 0.3, wdw.sill + wdw.h / 2, wdw.z));
  }

  // ------------------------------------------------------------------ stage lighting: lantern spots, beams, dust
  const spot = new THREE.SpotLight('#ffcf8a', 60, 12, 0.62, 0.75, 1.3);
  spot.position.set(S.PX - 1.6, 4.1, S.ZC);
  spot.target.position.set(10.0, SF, S.ZC);
  spot.castShadow = false;
  g.add(spot, spot.target);
  const footLight = new THREE.PointLight('#ffb060', 7, 5.5, 1.6);
  footLight.position.set(S.PX - 0.3, SF + 0.35, S.ZC);
  g.add(footLight);

  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uI: { value: 0.11 }, uColor: { value: new THREE.Color('#ffd49a') }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        vT = clamp(-position.y, 0.0, 1.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uI; uniform vec3 uColor; uniform float uTime;
      varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float along = smoothstep(0.0, 0.08, vT) * pow(1.0 - vT, 1.3);
        float drift = 0.85 + 0.15 * sin(vW.y * 3.0 + vW.z * 2.0 + uTime * 0.6);
        gl_FragColor = vec4(uColor * uI * edge * along * drift, 1.0);
      }`,
  });
  const beams: THREE.Mesh[] = [];
  const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.5) });
  const lanternSpot = (pos: THREE.Vector3, target: THREE.Vector3, len: number, rad: number) => {
    const lg = new THREE.Group();
    lg.position.copy(pos);
    lg.lookAt(target);
    // Brass can with a cooling crown and a glowing lens, on an iron yoke.
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.26, 16), m.brass);
    can.rotation.x = Math.PI / 2;
    can.position.z = -0.06;
    lg.add(can);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.06, 12), m.iron);
    crown.rotation.x = Math.PI / 2;
    crown.position.z = -0.21;
    lg.add(crown);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 6, 24), m.brass);
    rim.position.z = 0.07;
    lg.add(rim);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.095, 24), lensMat);
    lens.position.z = 0.072;
    lg.add(lens);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.75, 0.45), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.z = 0.09;
    halo.scale.setScalar(0.55);
    lg.add(halo);
    const cone = new THREE.ConeGeometry(rad, len, 24, 1, true);
    cone.translate(0, -len / 2, 0);
    cone.scale(1, 1 / len, 1);
    const beam = new THREE.Mesh(cone, beamMat);
    beam.scale.set(1, len, 1);
    beam.rotation.x = -Math.PI / 2;
    beam.position.z = 0.08;
    beam.userData.noBatch = true;
    lg.add(beam);
    beams.push(beam);
    g.add(lg);
    return lg;
  };
  // Two big lanterns in the top corners of the arch, two smaller ones on the pilaster capitals.
  lanternSpot(new THREE.Vector3(S.PX + 0.05, S.ARCH_SIDE - 0.12, S.Z0 + 0.35), new THREE.Vector3(10.0, SF, -0.4), 3.4, 0.75);
  lanternSpot(new THREE.Vector3(S.PX + 0.05, S.ARCH_SIDE - 0.12, S.Z1 - 0.35), new THREE.Vector3(10.0, SF, 1.8), 3.4, 0.75);
  lanternSpot(new THREE.Vector3(S.PX - 0.25, S.ARCH_SIDE + 0.62, S.Z0 - 0.26), new THREE.Vector3(9.2, SF, -1.6), 3.6, 0.6);
  lanternSpot(new THREE.Vector3(S.PX - 0.25, S.ARCH_SIDE + 0.62, S.Z1 + 0.26), new THREE.Vector3(9.4, SF, 2.6), 3.6, 0.6);

  // Dust drifting in the light.
  const N = quality === 'low' ? 140 : 320;
  const dpos = new Float32Array(N * 3);
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    dpos[i * 3] = S.PX - 0.6 + Math.random() * 3.6;
    dpos[i * 3 + 1] = SF + Math.random() * 2.8;
    dpos[i * 3 + 2] = S.Z0 + Math.random() * (S.Z1 - S.Z0);
    seeds[i] = Math.random();
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uK: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * (0.04 + aSeed * 0.05);
        p.y += mod(t + aSeed * 3.0, 2.8) - 1.4;
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.12;
        p.z += cos(uTime * 0.23 + aSeed * 23.0) * 0.12;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.5 + aSeed * 2.5) * (300.0 / -mv.z) * 0.02;
        vA = 0.5 + 0.5 * sin(uTime * (0.8 + aSeed) + aSeed * 30.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK; varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * a * vA * 0.55 * uK, 1.0);
      }`,
  });
  const dust = new THREE.Points(dgeo, dustMat);
  dust.frustumCulled = false;
  g.add(dust);

  const baseSpot = spot.intensity;
  const baseFoot = footLight.intensity;
  return {
    group: g,
    spot,
    footLight,
    stageBannerSpots: [new THREE.Vector3(S.PX - 0.2, 2.05, S.Z0 - 0.26), new THREE.Vector3(S.PX - 0.2, 2.05, S.Z1 + 0.26)],
    windows: winCenters,
    valance,
    backdropX: S.BACK - 0.2,
    update(t: number) {
      beamMat.uniforms.uTime.value = t;
      dustMat.uniforms.uTime.value = t;
      footLight.intensity = baseFoot * (1 + Math.sin(t * 7.3) * 0.04 + Math.sin(t * 13.1) * 0.03) * level;
      for (let i = 0; i < bulbs.length; i++) bulbs[i].material.opacity = 0.55;
    },
    setLevel(k: number) {
      level = k;
      spot.intensity = baseSpot * k;
      beamMat.uniforms.uI.value = 0.11 * k;
      dustMat.uniforms.uK.value = k;
    },
  };
}

let level = 1;
