import * as THREE from 'three';
import type { Card, CardType } from '../../shared/cards';
import type { CardTexSet } from '../cards/cardTextures';

/** Brightness of pile cards (kept under the bloom threshold: no glare). */
const PILE_GLOW = 0.56;

export const CARD_W = 0.16;
export const CARD_H = 0.224;
/** Cardstock thickness: chunky on purpose, so cards read as solid little slabs. */
export const CARD_THICK = 0.0018;
/** Corner radius (matches the 44/500 rim radius of the card art). */
export const CARD_R = (CARD_W * 44) / 500;

/** Points around a rounded rectangle centred on the origin (counter-clockwise). */
export function roundedRectPoints(w: number, h: number, r: number, seg = 6): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const corners: Array<[number, number, number]> = [
    [w / 2 - r, -h / 2 + r, -Math.PI / 2],
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  return pts;
}

/** Side walls of a rounded slab, extruded along z from -t/2 to t/2. v runs 0..1 across the thickness. */
export function roundedWallGeometry(w: number, h: number, r: number, t: number, seg = 6): THREE.BufferGeometry {
  const pts = roundedRectPoints(w, h, r, seg);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let per = 0;
  const n = pts.length;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    if (i > 0) per += p.distanceTo(prev);
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const l = Math.hypot(tx, ty) || 1;
    const nx = ty / l;
    const ny = -tx / l;
    for (const z of [-t / 2, t / 2]) {
      pos.push(p.x, p.y, z);
      nor.push(nx, ny, 0);
      uv.push(per / (2 * (w + h)), z > 0 ? 1 : 0);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Flat rounded-rectangle face with UVs spanning the card art. */
export function roundedFaceGeometry(w: number, h: number, r: number, seg = 6): THREE.BufferGeometry {
  const shape = new THREE.Shape(roundedRectPoints(w, h, r, seg));
  const g = new THREE.ShapeGeometry(shape, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

let faceGeo: THREE.BufferGeometry | null = null;
let edgeGeo: THREE.BufferGeometry | null = null;
const edgeMats = new Map<string, THREE.MeshStandardMaterial>();
const faceMats = new Map<string, THREE.MeshStandardMaterial>();
const backMats = new Map<string, THREE.MeshStandardMaterial>();

/** 'table' cards are lit by the room; 'hand' cards get a little self-light so they stay readable. */
/**
 * table: lit like the room; hand: self-lit, held before the camera; pile: on the pile, the deck or floating up when
 * played: it shows only its own picture at a fixed brightness (no lamp highlight, no bloom glare), always readable.
 */
export type CardVariant = 'table' | 'hand' | 'pile';

function plane(): THREE.BufferGeometry {
  if (!faceGeo) faceGeo = roundedFaceGeometry(CARD_W, CARD_H, CARD_R);
  return faceGeo;
}

function edge(): THREE.BufferGeometry {
  if (!edgeGeo) edgeGeo = roundedWallGeometry(CARD_W, CARD_H, CARD_R, CARD_THICK);
  return edgeGeo;
}

function edgeMaterial(v: CardVariant): THREE.MeshStandardMaterial {
  let m = edgeMats.get(v);
  if (!m) {
    // The card's thin edge: a dark neutral (cards have no border).
    m = new THREE.MeshStandardMaterial({ color: v === 'pile' ? '#000000' : '#2e2622', roughness: v === 'pile' ? 1 : 0.7 });
    if (v === 'hand') m.emissive.setRGB(0.05, 0.04, 0.035);
    if (v === 'pile') m.emissive.set('#241c18');
    edgeMats.set(v, m);
  }
  return m;
}

/**
 * The self-light of the cards in your hand: brighter and whiter on your turn, a little dimmer when it is not
 * (`setHandGlow`, eased by the hand view).
 */
const HAND_LIT = new THREE.Color(0.68, 0.67, 0.65);
const HAND_DIM = new THREE.Color(0.34, 0.31, 0.28);
const handGlow = new THREE.Color(0.42, 0.38, 0.34);
const handFaces: THREE.MeshStandardMaterial[] = [];

/** 0: not your turn, 1: your turn. */
export function setHandGlow(k: number): void {
  handGlow.lerpColors(HAND_DIM, HAND_LIT, k);
  for (const m of handFaces) m.emissive.copy(handGlow);
}

function faceMat(tex: CardTexSet, type: CardType, v: CardVariant): THREE.MeshStandardMaterial {
  const key = type + v;
  let m = faceMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: v === 'pile' ? null : tex.faces[type], color: v === 'pile' ? '#000000' : '#ffffff', roughness: v === 'pile' ? 1 : 0.62, metalness: 0, side: THREE.FrontSide });
    if (v === 'hand') {
      m.emissiveMap = tex.faces[type];
      m.emissive.copy(handGlow);
      handFaces.push(m);
    }
    if (v === 'pile') {
      m.emissiveMap = tex.faces[type];
      m.emissive.setScalar(PILE_GLOW);
    }
    faceMats.set(key, m);
  }
  return m;
}

/** Top-rarity sleeves shimmer: every few seconds a band of light sweeps across every card back. */
export const backGlint = { time: { value: 0 }, strength: { value: 0 }, color: { value: new THREE.Color(1, 0.8, 0.45) } };

/** Teach a card-back material the shimmer (off while backGlint.strength is 0). */
export function addGlint(m: THREE.MeshStandardMaterial): void {
  if (m.userData.glint) return;
  m.userData.glint = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlintT = backGlint.time;
    sh.uniforms.uGlintK = backGlint.strength;
    sh.uniforms.uGlintC = backGlint.color;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlintT;\nuniform float uGlintK;\nuniform vec3 uGlintC;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#ifdef USE_MAP
  float gp = fract(uGlintT * 0.2);
  float gd = (vMapUv.x + vMapUv.y * 0.7) - (gp * 4.0 - 0.6);
  float band = exp(-gd * gd * 160.0) + 0.4 * exp(-(gd + 0.13) * (gd + 0.13) * 1100.0);
  totalEmissiveRadiance += uGlintC * band * uGlintK;
#endif`
      );
  };
  m.customProgramCacheKey = () => 'card-back-glint';
  m.needsUpdate = true;
}

function backMaterial(tex: CardTexSet, v: CardVariant): THREE.MeshStandardMaterial {
  let m = backMats.get(v);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: v === 'pile' ? null : tex.back, color: v === 'pile' ? '#000000' : '#ffffff', roughness: v === 'pile' ? 1 : 0.66 });
    // The back plane alone casts the card's shadow, from either side (one shadow draw per card instead of two).
    m.shadowSide = THREE.DoubleSide;
    if (v !== 'pile') addGlint(m);
    if (v === 'hand') {
      m.emissiveMap = tex.back;
      m.emissive.setRGB(0.35, 0.3, 0.28);
    }
    if (v === 'pile') {
      m.emissiveMap = tex.back;
      m.emissive.setScalar(PILE_GLOW);
    }
    backMats.set(v, m);
  }
  return m;
}

/**
 * A two-sided card: a face plane (+z) and a back plane (-z). Each instance owns its face material
 * clone only when it needs per-card tinting (dimming, glow).
 */
export class CardMesh {
  readonly root = new THREE.Group();
  readonly face: THREE.Mesh;
  readonly back: THREE.Mesh;
  readonly edge: THREE.Mesh;
  card: Card | null;
  private tex: CardTexSet;
  private ownMat: THREE.MeshStandardMaterial | null = null;
  /** The last tint (reapplied when your hand's glow changes). */
  private tinted: [number, number, number, number] = [1, 1, 1, 0];
  /** Free-form per-card animation state. */
  hover = 0;
  hoverTarget = 0;
  glow = 0;
  glowTarget = 0;
  slot = new THREE.Vector3();
  slotRot = new THREE.Euler();
  slotScale = 1;
  animating = false;

  variant: CardVariant;

  constructor(tex: CardTexSet, card: Card | null, variant: CardVariant = 'table') {
    this.tex = tex;
    this.card = card;
    this.variant = variant;
    this.face = new THREE.Mesh(plane(), card ? faceMat(tex, card.type, variant) : backMaterial(tex, variant));
    this.back = new THREE.Mesh(plane(), backMaterial(tex, variant));
    this.back.rotation.y = Math.PI;
    this.face.position.z = CARD_THICK / 2;
    this.back.position.z = -CARD_THICK / 2;
    this.edge = new THREE.Mesh(edge(), edgeMaterial(variant));
    this.back.castShadow = true;
    this.face.receiveShadow = this.back.receiveShadow = true;
    this.root.add(this.face, this.back, this.edge);
  }

  setCard(card: Card | null): void {
    this.card = card;
    this.ownMat = null;
    this.face.material = card ? faceMat(this.tex, card.type, this.variant) : backMaterial(this.tex, this.variant);
  }

  setVariant(v: CardVariant): void {
    if (v === this.variant) return;
    this.variant = v;
    this.back.material = backMaterial(this.tex, v);
    this.edge.material = edgeMaterial(v);
    this.setCard(this.card);
  }

  /** Per-card tint (dim when cancelled, warm glow when playable). */
  tint(r: number, g: number, b: number, emissive = 0): void {
    if (!this.card) return;
    if (!this.ownMat) {
      this.ownMat = (this.face.material as THREE.MeshStandardMaterial).clone();
      this.face.material = this.ownMat;
    }
    if (this.variant === 'pile') {
      // Light-independent: dim or warm it through its own glow only.
      this.ownMat.emissive.setRGB(PILE_GLOW * r + emissive, PILE_GLOW * g + emissive * 0.7, PILE_GLOW * b + emissive * 0.3);
      return;
    }
    this.tinted = [r, g, b, emissive];
    this.ownMat.color.setRGB(r, g, b);
    if (this.ownMat.emissiveMap) this.ownMat.emissive.setRGB(handGlow.r * r + emissive, handGlow.g * g + emissive * 0.7, handGlow.b * b + emissive * 0.3);
  }

  /** A tinted card in your hand follows the hand's glow too. */
  refreshGlow(): void {
    if (this.ownMat && this.variant === 'hand') this.tint(...this.tinted);
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.ownMat?.dispose();
  }
}
