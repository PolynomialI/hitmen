import * as THREE from 'three';
import type { Card, CardType } from '../../shared/cards';
import type { CardTexSet } from '../cards/cardTextures';

export const CARD_W = 0.16;
export const CARD_H = 0.224;

let geo: THREE.PlaneGeometry | null = null;
const faceMats = new Map<string, THREE.MeshStandardMaterial>();
const backMats = new Map<string, THREE.MeshStandardMaterial>();

/** 'table' cards are lit by the room; 'hand' cards get a little self-light so they stay readable. */
export type CardVariant = 'table' | 'hand';

function plane(): THREE.PlaneGeometry {
  if (!geo) geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  return geo;
}

function faceMat(tex: CardTexSet, type: CardType, v: CardVariant): THREE.MeshStandardMaterial {
  const key = type + v;
  let m = faceMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex.faces[type], roughness: 0.55, metalness: 0, alphaTest: 0.5, side: THREE.FrontSide });
    if (v === 'hand') {
      m.emissiveMap = tex.faces[type];
      m.emissive.setRGB(0.42, 0.38, 0.34);
    }
    faceMats.set(key, m);
  }
  return m;
}

function backMaterial(tex: CardTexSet, v: CardVariant): THREE.MeshStandardMaterial {
  let m = backMats.get(v);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex.back, roughness: 0.5, alphaTest: 0.5 });
    if (v === 'hand') {
      m.emissiveMap = tex.back;
      m.emissive.setRGB(0.35, 0.3, 0.28);
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
  card: Card | null;
  private tex: CardTexSet;
  private ownMat: THREE.MeshStandardMaterial | null = null;
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
    this.face.castShadow = this.back.castShadow = true;
    this.face.receiveShadow = this.back.receiveShadow = true;
    this.root.add(this.face, this.back);
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
    this.setCard(this.card);
  }

  /** Per-card tint (dim when cancelled, warm glow when playable). */
  tint(r: number, g: number, b: number, emissive = 0): void {
    if (!this.card) return;
    if (!this.ownMat) {
      this.ownMat = (this.face.material as THREE.MeshStandardMaterial).clone();
      this.face.material = this.ownMat;
    }
    this.ownMat.color.setRGB(r, g, b);
    if (this.ownMat.emissiveMap) this.ownMat.emissive.setRGB(0.42 * r + emissive, 0.38 * g + emissive * 0.7, 0.34 * b + emissive * 0.3);
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.ownMat?.dispose();
  }
}
