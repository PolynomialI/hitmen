import * as THREE from 'three';
import { mergeLocal } from './batch';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise2 } from '../gfx/noise';

interface ClothMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}
let cloth: ClothMaps | null = null;

/**
 * Shared wool for every cloak (grayscale, tinted by each cloak's colour): a fine twill weave, fibres, deep vertical
 * folds, wear and stains, and an embroidered band along the hems (the bottom edge of each lathe: robe, capelet,
 * hood). Albedo, normal and roughness maps from one height field; tiles around the circumference.
 */
function clothMaps(): ClothMaps {
  if (cloth) return cloth;
  const S = 512;
  const n = new Noise2(77);
  const nf = new Noise2(131);
  const ns = new Noise2(911);
  const height = new Float32Array(S * S);
  const alb = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const TAU = Math.PI * 2;
  for (let y = 0; y < S; y++) {
    const v = 1 - y / S; // texture v (0 = bottom edge of the garment)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const twill = 0.5 + 0.5 * Math.sin((x + y) * (TAU / 8));
      const fiber = nf.fbm(x / 2, y / 8, 2, S / 2, S / 8) - 0.5;
      const folds = n.fbm(x / 32, y / 128, 4, S / 32, S / 128);
      const stain = Math.max(0, ns.fbm(x / 64, y / 64, 3, S / 64, S / 64) - 0.6) * 3;
      // Dust and wear gather toward the hem.
      const wear = Math.max(0, 0.25 - v) * 1.6 * (0.6 + nf.value(x / 6, y / 6, S / 6, S / 6) * 0.8);
      // Embroidered band just above the hem: lozenges of raised, brighter thread.
      let emb = 0;
      if (v > 0.018 && v < 0.07) {
        const bx = ((x % 32) - 16) / 16;
        const by = (v - 0.044) / 0.026;
        const d = Math.abs(bx) + Math.abs(by);
        emb = d < 0.62 && d > 0.38 ? 1 : Math.abs(by) > 0.86 ? 0.8 : 0.25;
      }
      height[i] = folds * 1.7 + twill * 0.18 + fiber * 0.22 + emb * 0.25;
      alb[i] = 0.78 + (twill - 0.5) * 0.07 + fiber * 0.09 + (folds - 0.5) * 0.3 - stain * 0.16 + wear * 0.18 + emb * 0.32;
      rough[i] = 0.9 - stain * 0.25 - emb * 0.3 + fiber * 0.06;
    }
  }
  const toTex = (fill: (img: ImageData) => void, srgb: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    fill(img);
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1);
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const map = toTex((img) => {
    for (let i = 0; i < S * S; i++) {
      const g = Math.max(0, Math.min(1, alb[i])) * 255;
      img.data[i * 4] = g;
      img.data[i * 4 + 1] = g * 0.985;
      img.data[i * 4 + 2] = g * 0.96;
      img.data[i * 4 + 3] = 255;
    }
  }, true);
  const normalMap = toTex((img) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = height[y * S + ((x + 1) % S)] - height[y * S + ((x - 1 + S) % S)];
        const dy = height[((y + 1) % S) * S + x] - height[((y - 1 + S) % S) * S + x];
        const nx = -dx * 2.2;
        const ny = -dy * 2.2;
        const l = Math.hypot(nx, ny, 1);
        const i = (y * S + x) * 4;
        img.data[i] = (nx / l * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
        img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
  }, false);
  const roughnessMap = toTex((img) => {
    for (let i = 0; i < S * S; i++) {
      const r = Math.max(0, Math.min(1, rough[i])) * 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = r;
      img.data[i * 4 + 3] = 255;
    }
  }, false);
  cloth = { map, normalMap, roughnessMap };
  return cloth;
}

let leatherN: THREE.Texture | null = null;
/** Pebbled leather grain for gloves and belts. */
function leatherNormal(): THREE.Texture {
  if (leatherN) return leatherN;
  const S = 128;
  const n = new Noise2(5);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = n.fbm(x / 6, y / 6, 3, S / 6, S / 6);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
      const l = Math.hypot(dx * 4, dy * 4, 1);
      const i = (y * S + x) * 4;
      img.data[i] = (-dx * 4 / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy * 4 / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  leatherN = new THREE.CanvasTexture(c);
  leatherN.wrapS = leatherN.wrapT = THREE.RepeatWrapping;
  leatherN.repeat.set(2, 2);
  return leatherN;
}

export type Accessory =
  | 'none'
  | 'feathercap'
  | 'tricorn'
  | 'beak'
  | 'beard'
  | 'wimple'
  | 'scarf'
  | 'witchhat'
  | 'tam'
  | 'circlet'
  | 'souwester'
  | 'monk'
  | 'headscarf';

export const ACCESSORIES: Accessory[] = ['feathercap', 'tricorn', 'beak', 'beard', 'wimple', 'scarf', 'witchhat', 'tam', 'circlet', 'souwester', 'monk', 'headscarf'];

const BY_NAME: Record<string, Accessory> = {
  'Mordecai Vane': 'feathercap',
  'Sister Ysolde': 'wimple',
  'Old Bertram': 'beard',
  'Gideon Crowe': 'beak',
  'Wynn the Quiet': 'scarf',
  'Agnes Thorne': 'witchhat',
  'Hamish Grey': 'tam',
  'Lady Morwenna': 'circlet',
  'Tobias Fenn': 'souwester',
  'Brother Cuthbert': 'monk',
  'Brother Aldric': 'monk',
  'Silas Rook': 'tricorn',
  'Mags the Ferrywoman': 'headscarf',
};

/** Every character at the table gets something of their own; strangers get one picked from their name. */
export function accessoryFor(name: string): Accessory {
  if (BY_NAME[name]) return BY_NAME[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCESSORIES[h % ACCESSORIES.length];
}

export interface FigureOpts {
  cloak: string;
  eyes?: string;
  seated?: boolean;
  scale?: number;
  /** Hem and hood-edge colour. Defaults to a warm gold-brown. */
  trim?: string;
  accessory?: Accessory;
}

/** Right-arm angles (the left arm mirrors y and z): cards held up at the chest, and a reach onto the table. */
const HOLD_POSE = { ax: -0.2, ay: -0.65, az: 0.35, ex: -2.15 };
const REACH_POSE = { ax: -1.05, ay: -0.3, az: -0.15, ex: -0.4 };

/** Merge a group's direct mesh children that share a material (keeps draw calls down per figure). */
function mergeChildren(g: THREE.Object3D, keep: Set<THREE.Object3D> = new Set()): void {
  const by = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of g.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || keep.has(m) || Array.isArray(m.material)) continue;
    const list = by.get(m.material as THREE.Material) ?? [];
    list.push(m);
    by.set(m.material as THREE.Material, list);
  }
  for (const [mat, list] of by) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', src.getAttribute('position'));
      out.setAttribute('normal', src.getAttribute('normal') ?? (src.computeVertexNormals(), src.getAttribute('normal')));
      out.setAttribute('uv', src.getAttribute('uv') ?? new THREE.Float32BufferAttribute(new Float32Array(src.getAttribute('position').count * 2), 2));
      out.applyMatrix4(m.matrix);
      return out;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = list.some((m) => m.castShadow);
    for (const m of list) g.remove(m);
    g.add(mesh);
  }
}

const tube = (pts: THREE.Vector3[], r: number, mat: THREE.Material, seg = 32, closed = false) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), seg, r, 8, closed), mat);

/**
 * A hooded figure: a shaped robe with a belt, a trimmed capelet and hood, bell sleeves with cuffs and
 * gloved hands, a void where the face should be and two ember eyes, plus one accessory of their own.
 * Rig: root > body (breathes) > head (looks around) / armL / armR (reach for cards).
 */
let bloodTex: THREE.CanvasTexture | null = null;

export class Figure {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly handL = new THREE.Object3D();
  readonly handR = new THREE.Object3D();
  readonly eyesMat: THREE.MeshBasicMaterial;
  readonly cloakMat: THREE.MeshStandardMaterial;
  private eyes: THREE.Mesh[] = [];
  private seed = Math.random() * 100;
  private blinkT = 2 + Math.random() * 3;
  private eyeColor: THREE.Color;
  /** 0..1, how "alive" the eyes are (for death). */
  eyesOn = 1;
  /** Extra look target offsets set by the presenter. */
  lookYaw = 0;
  lookPitch = 0;
  breathe = 1;
  /** Lean toward the table (+) or recoil (-). Smoothed. */
  lean = 0;
  private leanK = 0;
  private flinchT = 0;
  private yawK = 0;
  private sway: THREE.Object3D[] = [];

  constructor(o: FigureOpts) {
    const s = o.scale ?? 1;
    const cloak = new THREE.Color(o.cloak);
    const cm = clothMaps();
    this.cloakMat = new THREE.MeshStandardMaterial({
      // The wool map averages ~0.8: lift the base colour so cloaks keep their brightness.
      color: cloak.clone().offsetHSL(0, 0.06, 0.02).multiplyScalar(1.22),
      map: cm.map,
      roughness: 1,
      roughnessMap: cm.roughnessMap,
      normalMap: cm.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      side: THREE.DoubleSide,
    });
    const inner = new THREE.MeshStandardMaterial({ color: cloak.clone().multiplyScalar(0.32), map: cm.map, normalMap: cm.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 1, side: THREE.DoubleSide });
    const trimC = new THREE.Color(o.trim ?? '#b88a3a');
    const trim = new THREE.MeshStandardMaterial({ color: trimC, roughness: 0.45, metalness: 0.55 });
    const leather = new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.55, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
    const glove = new THREE.MeshStandardMaterial({ color: '#2a1c14', roughness: 0.48, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.7, 0.7) });
    const gold = new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 1, roughness: 0.28, emissive: '#3a2200', emissiveIntensity: 0.4 });
    this.eyeColor = new THREE.Color(o.eyes ?? '#ffb347');
    this.eyesMat = new THREE.MeshBasicMaterial({ color: this.eyeColor.clone().multiplyScalar(6) });

    const seated = o.seated ?? true;
    // ---------------------------------------------------------------- robe
    const torsoPts = seated
      ? [
          [0.0, -0.02],
          [0.31, 0.0],
          [0.33, 0.08],
          [0.29, 0.26],
          [0.245, 0.42],
          [0.27, 0.55],
          [0.31, 0.64],
          [0.26, 0.71],
          [0.12, 0.76],
          [0.0, 0.77],
        ]
      : [
          [0.0, 0.0],
          [0.44, 0.0],
          [0.4, 0.2],
          [0.33, 0.6],
          [0.265, 0.98],
          [0.28, 1.18],
          [0.31, 1.3],
          [0.25, 1.38],
          [0.12, 1.44],
          [0.0, 1.45],
        ];
    const neckY = seated ? 0.74 : 1.42;
    const beltY = seated ? 0.42 : 0.98;
    const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoPts.map(([r, y]) => new THREE.Vector2(r, y)), 32), this.cloakMat);
    torso.castShadow = true;
    torso.scale.set(1, 1, 0.8);
    this.body.add(torso);
    // Hem trim (standing figures only; seated hems are under the table).
    if (!seated) {
      const hem = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.02, 6, 40), trim);
      hem.rotation.x = Math.PI / 2;
      hem.scale.set(1, 0.8, 1);
      hem.position.y = 0.02;
      this.body.add(hem);
    }
    // Front opening of the robe: a trimmed seam from the collar to the belt.
    const seam: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const y = beltY + (neckY - 0.08 - beltY) * (i / 8);
      const r = seated ? 0.245 + (0.3 - 0.245) * (i / 8) : 0.265 + (0.3 - 0.265) * (i / 8);
      seam.push(new THREE.Vector3(0, y, r * 0.8 + 0.004));
    }
    this.body.add(tube(seam, 0.012, trim, 12));
    // Belt with a buckle, and a little purse.
    const belt = new THREE.Mesh(new THREE.TorusGeometry(seated ? 0.248 : 0.268, 0.028, 8, 40), leather);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.8, 1.6);
    belt.position.y = beltY;
    this.body.add(belt);
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 4), gold);
    buckle.rotation.z = Math.PI / 4;
    buckle.position.set(0, beltY, (seated ? 0.248 : 0.268) * 0.8 + 0.012);
    this.body.add(buckle);
    const purse = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), leather);
    purse.scale.set(1, 1.2, 0.6);
    purse.position.set(0.17, beltY - 0.06, 0.15);
    this.body.add(purse);

    // ---------------------------------------------------------------- capelet with trim and a brooch
    const capPts = [
      [0.0, 0.2],
      [0.16, 0.18],
      [0.3, 0.07],
      [0.37, -0.07],
      [0.375, -0.17],
    ];
    const mantle = new THREE.Mesh(new THREE.LatheGeometry(capPts.map(([r, y]) => new THREE.Vector2(r, y)), 32), this.cloakMat);
    mantle.position.y = neckY - 0.08;
    mantle.scale.set(1, 1, 0.82);
    mantle.castShadow = true;
    this.body.add(mantle);
    const capHem = new THREE.Mesh(new THREE.TorusGeometry(0.375, 0.016, 6, 48), trim);
    capHem.rotation.x = Math.PI / 2;
    capHem.scale.set(1, 0.82, 1);
    capHem.position.y = neckY - 0.25;
    this.body.add(capHem);
    const brooch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.015, 16), gold);
    brooch.rotation.x = Math.PI / 2;
    brooch.position.set(0, neckY - 0.06, 0.2);
    this.body.add(brooch);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: trimC.clone().offsetHSL(0.5, 0.3, 0), roughness: 0.15, metalness: 0.2, emissive: trimC.clone().offsetHSL(0.5, 0.3, -0.2), emissiveIntensity: 0.5 }));
    gem.position.set(0, neckY - 0.06, 0.212);
    this.body.add(gem);

    // ---------------------------------------------------------------- hood
    const hoodProfile = [
      [0.155, -0.06],
      [0.2, 0.04],
      [0.215, 0.15],
      [0.2, 0.26],
      [0.16, 0.35],
      [0.09, 0.42],
      [0.015, 0.47],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    // A full cowl with an oval opening cut out of the front, peaked forward over the face.
    const profR = (y: number) => {
      for (let i = 1; i < hoodProfile.length; i++) {
        const a0 = hoodProfile[i - 1];
        const a1 = hoodProfile[i];
        if (y <= a1.y) return a0.x + ((y - a0.y) / (a1.y - a0.y)) * (a1.x - a0.x);
      }
      return hoodProfile[hoodProfile.length - 1].x;
    };
    const bend = (y: number) => -Math.max(0, y - 0.24) * 0.45 + Math.exp(-Math.pow((y - 0.3) / 0.06, 2)) * 0.03;
    const OX = 0.122;
    const OY0 = 0.15;
    const OYR = 0.155;
    const inOpening = (x: number, y: number, z: number) => z > 0.02 && (x / OX) ** 2 + ((y - OY0) / OYR) ** 2 < 1;
    const denseProfile: THREE.Vector2[] = [];
    for (let i = 0; i <= 28; i++) {
      const y = -0.06 + (i / 28) * 0.53;
      denseProfile.push(new THREE.Vector2(profR(y), y));
    }
    const cowl = (scaleR: number) => {
      const geo = new THREE.LatheGeometry(denseProfile.map((v) => new THREE.Vector2(v.x * scaleR, v.y)), 48);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + bend(pos.getY(i)));
      const idx = geo.index!.array;
      const keep: number[] = [];
      for (let t = 0; t < idx.length; t += 3) {
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (let k = 0; k < 3; k++) {
          cx += pos.getX(idx[t + k]) / 3;
          cy += pos.getY(idx[t + k]) / 3;
          cz += pos.getZ(idx[t + k]) / 3;
        }
        if (!inOpening(cx, cy, cz)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      geo.setIndex(keep);
      geo.computeVertexNormals();
      return geo;
    };
    const hood = new THREE.Mesh(cowl(1), this.cloakMat);
    hood.castShadow = true;
    this.head.add(hood);
    const lining = new THREE.Mesh(cowl(0.94), inner);
    this.head.add(lining);
    // Rolled trim around the face opening, following the cowl's surface.
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const x = Math.cos(t) * OX * 1.02;
      const y = OY0 + Math.sin(t) * OYR * 1.02;
      const r = profR(y);
      ring.push(new THREE.Vector3(x, y, Math.sqrt(Math.max(0, r * r - x * x)) + bend(y)));
    }
    this.head.add(tube(ring, 0.017, trim, 64, true));
    const voidMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshBasicMaterial({ color: '#020101' }));
    voidMesh.position.set(0, 0.15, -0.015);
    voidMesh.scale.set(1, 1.15, 1);
    this.head.add(voidMesh);
    // Eyes.
    const eyeGeo = new THREE.SphereGeometry(0.015, 10, 6);
    eyeGeo.scale(1.5, 0.72, 0.6);
    for (const x of [-0.05, 0.05]) {
      const e = new THREE.Mesh(eyeGeo, this.eyesMat);
      e.position.set(x, 0.155, 0.13);
      e.rotation.z = x < 0 ? -0.22 : 0.22;
      this.eyes.push(e);
      this.head.add(e);
    }
    this.head.position.y = neckY - 0.03;
    this.body.add(this.head);

    // ---------------------------------------------------------------- arms: bell sleeves, cuffs, gloves
    const sleeveGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.46, 16, 1, true);
    sleeveGeo.translate(0, -0.23, 0);
    const foreGeo = new THREE.CylinderGeometry(0.068, 0.105, 0.34, 16, 1, true);
    foreGeo.translate(0, -0.17, 0);
    const palmGeo = new THREE.SphereGeometry(0.05, 14, 10);
    palmGeo.scale(1.05, 0.75, 1.25);
    const fingerGeo = new THREE.CapsuleGeometry(0.02, 0.06, 4, 8);
    const thumbGeo = new THREE.CapsuleGeometry(0.017, 0.04, 4, 8);
    const mkArm = (arm: THREE.Group, hand: THREE.Object3D, side: number) => {
      arm.position.set(side * 0.28, neckY - 0.14, 0);
      const upper = new THREE.Mesh(sleeveGeo, this.cloakMat);
      upper.castShadow = true;
      arm.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.44;
      arm.add(elbow);
      const fore = new THREE.Mesh(foreGeo, this.cloakMat);
      fore.castShadow = true;
      elbow.add(fore);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.103, 0.011, 6, 24), inner);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.335;
      elbow.add(cuff);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.06, 10), glove);
      wrist.position.y = -0.35;
      elbow.add(wrist);
      const palm = new THREE.Mesh(palmGeo, glove);
      palm.position.y = -0.39;
      palm.castShadow = true;
      elbow.add(palm);
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(fingerGeo, glove);
        f.position.set(-0.03 + k * 0.02, -0.43, 0.035);
        f.rotation.x = 0.9;
        elbow.add(f);
      }
      const th = new THREE.Mesh(thumbGeo, glove);
      th.position.set(-side * 0.045, -0.39, 0.03);
      th.rotation.set(0.6, 0, side * 0.9);
      elbow.add(th);
      mergeChildren(elbow);
      hand.position.y = -0.4;
      elbow.add(hand);
      elbow.rotation.x = -1.35;
      arm.rotation.x = -0.35;
      arm.rotation.z = side * 0.12;
      arm.userData.elbow = elbow;
      this.body.add(arm);
    };
    mkArm(this.armL, this.handL, -1);
    mkArm(this.armR, this.handR, 1);

    // ---------------------------------------------------------------- accessory
    this.addAccessory(o.accessory ?? 'none', { neckY, beltY, gold, leather, trim, seated });

    // One draw call per material for all static parts, accessories included (blinking eyes, swaying tails, the head
    // and the arms move on their own and stay separate).
    mergeLocal(this.head, [...this.eyes, ...this.sway]);
    mergeLocal(this.body, [this.head, this.armL, this.armR, ...this.sway]);
    this.root.add(this.body);
    this.root.scale.setScalar(s);
  }

  private addAccessory(a: Accessory, c: { neckY: number; beltY: number; gold: THREE.Material; leather: THREE.Material; trim: THREE.Material; seated: boolean }): void {
    const H = this.head;
    const B = this.body;
    const std = (color: string, rough = 0.7, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
    const add = (parent: THREE.Object3D, m: THREE.Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const hatOn = (g: THREE.Object3D) => {
      // Hats sit on the hood, tipped back with it.
      g.position.set(0, 0.34, -0.05);
      g.rotation.x = -0.28;
      H.add(g);
    };
    switch (a) {
      case 'feathercap': {
        const felt = std('#2a1e2e');
        const g = new THREE.Group();
        add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.02, 32), felt), 0, 0, 0);
        add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.15, 24), felt), 0, 0.08, 0);
        add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.035, 24), std('#7a1418', 0.5)), 0, 0.025, 0);
        const plume = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), std('#e03a2a', 0.6, { emissive: '#3a0a06' }));
        plume.scale.set(0.42, 0.3, 1.9);
        add(g, plume, 0.13, 0.13, -0.08, 0.9, 0.4, 0);
        hatOn(g);
        break;
      }
      case 'tricorn': {
        const felt = std('#3a2a22', 0.8);
        const g = new THREE.Group();
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.09, 3, 1), felt);
        brim.rotation.y = Math.PI / 6 + Math.PI;
        g.add(brim);
        add(g, new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), felt), 0, 0.03, 0);
        for (let i = 0; i < 3; i++) {
          const a2 = (i / 3) * Math.PI * 2 + Math.PI / 2;
          add(g, new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), c.gold), Math.cos(a2) * 0.27, 0.05, Math.sin(a2) * 0.27);
        }
        hatOn(g);
        // Eye patch over the right eye.
        this.eyes[1].visible = false;
        add(H, new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), std('#0a0a0a', 0.5)), 0.05, 0.157, 0.135);
        add(H, new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.006, 4, 24, Math.PI), std('#0a0a0a', 0.5)), 0, 0.17, 0.0, 0, 0, -0.35);
        break;
      }
      case 'beak': {
        const mask = std('#d8ccb0', 0.55);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 16), mask);
        add(H, beak, 0, 0.1, 0.3, Math.PI / 2 + 0.45, 0, 0);
        add(H, new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), mask), 0, 0.15, 0.1).scale.set(1.1, 0.85, 0.8);
        for (const x of [-0.05, 0.05]) {
          add(H, new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 18), c.gold), x, 0.158, 0.17);
          add(H, new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), new THREE.MeshStandardMaterial({ color: '#100606', roughness: 0.1, metalness: 0.5 })), x, 0.158, 0.168);
        }
        for (const e of this.eyes) e.position.z = 0.175;
        add(H, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 4, 24, Math.PI), c.leather), 0, 0.15, 0.06, 0, 0, Math.PI);
        break;
      }
      case 'beard': {
        const hair = std('#e2ddd2', 0.95);
        const g = new THREE.Group();
        const blobs: Array<[number, number, number, number]> = [
          [0, 0.02, 0.12, 0.085],
          [-0.06, 0.04, 0.11, 0.06],
          [0.06, 0.04, 0.11, 0.06],
          [0, -0.06, 0.13, 0.07],
          [-0.04, -0.12, 0.13, 0.05],
          [0.04, -0.12, 0.13, 0.05],
          [0, -0.18, 0.12, 0.04],
        ];
        for (const [x, y, z, r] of blobs) add(g, new THREE.Mesh(new THREE.SphereGeometry(r * 1.35, 12, 8), hair), x * 1.3, y * 1.25, z + 0.03);
        for (const sd of [-1, 1]) add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.07, 4, 8), hair), sd * 0.045, 0.085, 0.15, 0, 0, sd * 1.25);
        g.position.y = 0.04;
        H.add(g);
        // Bushy brows over the eyes.
        for (const sd of [-1, 1]) add(H, new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.04, 4, 6), hair), sd * 0.05, 0.19, 0.13, 0, 0, sd * 1.35);
        break;
      }
      case 'wimple': {
        const linen = std('#f0ebe0', 0.85);
        add(H, new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24, Math.PI), linen), 0, 0.17, 0.04, 0, 0, 0).scale.set(1, 1.05, 1);
        const bib = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), linen);
        add(B, bib, 0, c.neckY - 0.08, 0.02).scale.set(1, 0.5, 0.9);
        const cross = new THREE.Group();
        add(cross, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.012), c.gold), 0, 0, 0);
        add(cross, new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.02, 0.012), c.gold), 0, 0.02, 0);
        cross.position.set(0, c.neckY - 0.16, 0.315);
        cross.rotation.x = -0.25;
        B.add(cross);
        break;
      }
      case 'scarf': {
        const wool = std('#c9a24a', 0.9, { map: tartan('#8a5a1a', '#d8b860', '#3a2410') });
        add(H, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.055, 10, 24), wool), 0, 0.06, 0.04, Math.PI / 2 - 0.15, 0, 0).scale.set(1.05, 1, 1);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.03), wool);
        add(B, tail, 0.1, c.neckY - 0.2, 0.32, -0.25, 0, 0.12);
        this.sway.push(tail);
        break;
      }
      case 'witchhat': {
        const felt = std('#1c1424');
        const g = new THREE.Group();
        add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 32), felt), 0, 0, 0);
        const cone: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const k = i / 10;
          cone.push(new THREE.Vector3(Math.sin(k * 2.2) * 0.06 * k, k * 0.45, -k * k * 0.18));
        }
        const pts = cone.map((p, i) => new THREE.Vector2(0.17 * (1 - i / 10) + 0.004, p.y));
        const coneM = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), felt);
        const pos = coneM.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const k = y / 0.45;
          pos.setZ(i, pos.getZ(i) - k * k * 0.2);
          pos.setX(i, pos.getX(i) + Math.sin(k * 2.2) * 0.04 * k);
        }
        coneM.geometry.computeVertexNormals();
        g.add(coneM);
        add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 24), std('#5a1a3a', 0.6)), 0, 0.03, 0);
        add(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std('#c41a3a', 0.4, { emissive: '#3a0010' })), 0.12, 0.05, 0.11);
        hatOn(g);
        break;
      }
      case 'tam': {
        const g = new THREE.Group();
        const wool = std('#3a5a3a', 0.9, { map: tartan('#2a4a2a', '#7a1a1a', '#d8c070') });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 10), wool);
        cap.scale.set(1, 0.32, 1);
        g.add(cap);
        add(g, new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), std('#1a2a1a', 0.8)), 0, -0.02, 0, Math.PI / 2, 0, 0);
        add(g, new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), std('#b02a2a', 0.95)), 0, 0.08, 0);
        hatOn(g);
        g.rotation.z = 0.25;
        break;
      }
      case 'circlet': {
        add(H, new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 6, 32), c.gold), 0, 0.25, 0.0, Math.PI / 2 + 0.25, 0, 0).scale.set(1, 1.15, 1);
        add(H, new THREE.Mesh(new THREE.OctahedronGeometry(0.03), std('#3a8ae0', 0.1, { emissive: '#0a2a6a', emissiveIntensity: 0.8, metalness: 0.3 })), 0, 0.3, 0.17);
        // Pearls.
        for (let i = 0; i < 13; i++) {
          const a2 = -1.1 + (i / 12) * 2.2;
          add(B, new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), std('#f4efe6', 0.25, { metalness: 0.2 })), Math.sin(a2) * 0.17, c.neckY - 0.1 - Math.cos(a2 * 0.8) * 0.06, Math.cos(a2) * 0.17 + 0.07);
        }
        break;
      }
      case 'souwester': {
        const oil = std('#e0b030', 0.4);
        const g = new THREE.Group();
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.025, 32), oil);
        brim.position.set(0, 0, -0.04);
        brim.rotation.x = -0.12;
        g.add(brim);
        add(g, new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), oil), 0, 0.0, 0);
        g.position.set(0, 0.32, -0.02);
        g.rotation.x = -0.2;
        H.add(g);
        // Pipe.
        const pipe = new THREE.Group();
        add(pipe, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), c.leather), 0, 0, 0, Math.PI / 2, 0, 0);
        add(pipe, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.045, 10), c.leather), 0, 0.02, 0.07);
        pipe.position.set(0.04, 0.08, 0.17);
        pipe.rotation.y = -0.3;
        H.add(pipe);
        break;
      }
      case 'monk': {
        const rope = std('#e8d4a0', 0.95);
        add(B, new THREE.Mesh(new THREE.TorusGeometry(c.seated ? 0.255 : 0.275, 0.018, 6, 40), rope), 0, c.beltY + 0.04, 0, Math.PI / 2, 0, 0).scale.set(1, 0.8, 1);
        const cross = new THREE.Group();
        add(cross, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.025), std('#8a5a2e', 0.6)), 0, 0, 0);
        add(cross, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.025), std('#8a5a2e', 0.6)), 0, 0.05, 0);
        cross.position.set(0, c.neckY - 0.17, 0.33);
        cross.rotation.x = -0.25;
        B.add(cross);
        for (let i = 0; i < 16; i++) {
          const a2 = -1.2 + (i / 15) * 2.4;
          add(B, new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), std('#4a2a14', 0.5)), Math.sin(a2) * 0.19, c.neckY - 0.08 - Math.cos(a2 * 0.7) * 0.13, Math.cos(a2) * 0.19 + 0.06);
        }
        break;
      }
      case 'headscarf': {
        const cloth = std('#a8302a', 0.85, { map: dots('#a8302a', '#f0d8a0') });
        const scarf = new THREE.Mesh(new THREE.SphereGeometry(0.215, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), cloth);
        add(H, scarf, 0, 0.19, -0.04, -0.4, 0, 0).scale.set(1.12, 1.1, 1.12);
        add(H, new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), cloth), 0, 0.08, -0.2);
        for (const sd of [-1, 1]) add(H, new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 8), cloth), sd * 0.04, -0.01, -0.22, 0.3, 0, sd * 0.4);
        add(H, new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 18), c.gold), 0.17, 0.08, 0.06, 0, Math.PI / 2, 0);
        // Ferry coin on a cord.
        add(B, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 18), c.gold), 0, c.neckY - 0.15, 0.315, Math.PI / 2 - 0.35, 0, 0);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Seated players hold their cards up in front of the chest; their reaches (drawing, playing) blend out from that
   * pose and back to it at 0. Other figures (barkeep, peddler) keep the plain reach.
   */
  holding = false;

  /** Reach an arm forward (0..1) — used when playing/drawing a card. */
  setReach(k: number, side: 'R' | 'L' = 'R'): void {
    const arm = side === 'R' ? this.armR : this.armL;
    const elbow = arm.userData.elbow as THREE.Group;
    if (this.holding) {
      // Angles solved so the hands sit at the bottom of the held card row (hold) or on the table (reach).
      const s = side === 'R' ? 1 : -1;
      const H = HOLD_POSE;
      const R = REACH_POSE;
      arm.rotation.set(H.ax + (R.ax - H.ax) * k, s * (H.ay + (R.ay - H.ay) * k), s * (H.az + (R.az - H.az) * k));
      elbow.rotation.x = H.ex + (R.ex - H.ex) * k;
      return;
    }
    arm.rotation.x = -0.35 - k * 0.75;
    elbow.rotation.x = -1.35 + k * 0.85;
  }

  /** Turn the head toward a world point (clamped), or back to rest with null. */
  lookToward(p: THREE.Vector3 | null): void {
    if (!p) {
      this.lookYaw = 0;
      return;
    }
    const local = this.root.worldToLocal(p.clone());
    this.lookYaw = Math.max(-1.1, Math.min(1.1, Math.atan2(local.x, local.z)));
  }

  /** A sharp startled jerk backwards. */
  /** Shot: a dark blood mark at the side of the hood (`side` -1 left / +1 right of the figure), with a run below it. */
  addBloodMark(side: number): void {
    if (!bloodTex) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 192;
      const x = c.getContext('2d')!;
      x.fillStyle = '#5a0606';
      x.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const r = 30 + Math.sin(i * 2.7) * 9 + Math.cos(i * 5.1) * 6;
        x.lineTo(64 + Math.cos(a) * r, 62 + Math.sin(a) * r * 0.85);
      }
      x.fill();
      for (const [dx, len, w] of [[-14, 96, 9], [6, 120, 7], [20, 70, 6]]) {
        x.fillRect(64 + dx - w / 2, 62, w, len);
        x.beginPath();
        x.arc(64 + dx, 62 + len, w * 0.8, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = 'rgba(150,20,20,0.6)';
      x.beginPath();
      x.arc(56, 54, 12, 0, Math.PI * 2);
      x.fill();
      bloodTex = new THREE.CanvasTexture(c);
      bloodTex.colorSpace = THREE.SRGBColorSpace;
    }
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.165),
      new THREE.MeshStandardMaterial({ map: bloodTex, transparent: true, roughness: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    m.position.set(side * 0.172, 0.1, 0.03);
    m.rotation.y = side * Math.PI * 0.5;
    this.head.add(m);
  }

  flinch(): void {
    this.flinchT = 1;
  }

  update(t: number, dt: number): void {
    const s = this.seed;
    this.leanK += (this.lean - this.leanK) * (1 - Math.exp(-5 * dt));
    this.flinchT = Math.max(0, this.flinchT - dt * 2.2);
    const fl = Math.sin(this.flinchT * Math.PI) * this.flinchT;
    this.body.position.z = this.leanK * 0.07 - fl * 0.12;
    this.body.rotation.x = this.leanK * 0.12 - fl * 0.25;
    this.yawK += (this.lookYaw - this.yawK) * (1 - Math.exp(-4 * dt));
    const br = Math.sin(t * 1.3 + s) * 0.012 * this.breathe;
    this.body.scale.set(1 + br * 0.5, 1 + br, 1 + br * 0.5);
    this.head.rotation.y = Math.sin(t * 0.37 + s) * 0.12 * (1 - Math.min(1, Math.abs(this.yawK))) + this.yawK;
    this.head.rotation.x = Math.sin(t * 0.29 + s * 2) * 0.05 + this.lookPitch;
    this.head.rotation.z = Math.sin(t * 0.23 + s) * 0.04;
    for (const o of this.sway) o.rotation.z = 0.12 + Math.sin(t * 1.1 + s) * 0.05;
    // Blink.
    this.blinkT -= dt;
    let lid = 1;
    if (this.blinkT < 0) {
      lid = Math.min(1, Math.abs(this.blinkT + 0.08) / 0.08);
      if (this.blinkT < -0.16) this.blinkT = 2.5 + Math.random() * 4;
    }
    for (const e of this.eyes) e.scale.y = Math.max(0.05, lid);
    const flick = 0.85 + Math.sin(t * 11 + s) * 0.05 + Math.sin(t * 23.7 + s) * 0.04;
    this.eyesMat.color.copy(this.eyeColor).multiplyScalar(6 * flick * this.eyesOn);
  }
}

// ------------------------------------------------------------------------------------------- textures

const texCache = new Map<string, THREE.CanvasTexture>();

function tartan(a: string, b: string, c: string): THREE.CanvasTexture {
  const key = `t${a}${b}${c}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = b;
  ctx.fillRect(0, 20, 64, 10);
  ctx.fillRect(20, 0, 10, 64);
  ctx.fillStyle = c;
  ctx.fillRect(0, 44, 64, 3);
  ctx.fillRect(44, 0, 3, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  texCache.set(key, t);
  return t;
}

function dots(base: string, dot: string): THREE.CanvasTexture {
  const key = `d${base}${dot}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = dot;
  for (const [x, y] of [
    [12, 12],
    [44, 28],
    [20, 50],
    [54, 58],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  texCache.set(key, t);
  return t;
}
