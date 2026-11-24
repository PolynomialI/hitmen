import * as THREE from 'three';
import type { Card } from '../../shared/cards';
import type { CardTexSet } from '../cards/cardTextures';
import { damp } from '../core/tween';
import { CARD_H, CARD_W, CardMesh } from './cardMesh';

/**
 * The player's hand: real 3D cards parented to the camera, fanned along the bottom of the view.
 * Cards ease toward their slots every frame, so adding/removing/hovering always looks smooth.
 */
export class HandView {
  readonly group = new THREE.Group();
  readonly cards: CardMesh[] = [];
  hovered: CardMesh | null = null;
  /** Cards that should pulse (e.g. the Guardian Angel during a rescue). */
  readonly highlight = new Set<number>();
  /** When true, highlighted cards pulse gently (just "playable"), not urgently. */
  softHighlight = false;
  private dist = 0.56;
  private t = 0;
  /** Card type currently shackled (drawn dark with a padlock). */
  private lockedType: string | null = null;
  private lockTex: THREE.Texture | null = null;
  /** Lowered while the player aims or watches a cinematic. */
  lowered = 0;
  private loweredK = 0;

  constructor(private cam: THREE.PerspectiveCamera, private tex: CardTexSet) {
    this.group.position.set(0, 0, 0);
    cam.add(this.group);
  }

  private frame(): { halfW: number; halfH: number } {
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2) * this.dist;
    return { halfH, halfW: halfH * this.cam.aspect };
  }

  /** Scale that makes a card ~31% of the screen tall. */
  cardScale(): number {
    const { halfH } = this.frame();
    return (halfH * 0.64) / CARD_H;
  }

  /** Where a card should sit in camera space. */
  private slot(i: number, n: number, hover: number): { p: THREE.Vector3; r: THREE.Euler; s: number } {
    const { halfW, halfH } = this.frame();
    const s = this.cardScale();
    const cw = CARD_W * s;
    const ch = CARD_H * s;
    const maxSpan = Math.min(halfW * 1.25, cw * 0.72 * Math.max(1, n - 1));
    const step = n > 1 ? maxSpan / (n - 1) : 0;
    const d = i - (n - 1) / 2;
    let x = d * step;
    // Spread neighbours away from the hovered card.
    if (this.hovered && this.cards.indexOf(this.hovered) >= 0) {
      const hi = this.cards.indexOf(this.hovered);
      if (i < hi) x -= cw * 0.18;
      if (i > hi) x += cw * 0.18;
    }
    const arc = Math.abs(d) * Math.abs(d) * ch * 0.012;
    const lowered = this.loweredK * ch * 0.7;
    const y = -halfH + ch * 0.36 - arc + hover * ch * 0.32 - lowered;
    const z = -this.dist + i * 0.0024 + hover * 0.04;
    const r = new THREE.Euler(-0.08 * (1 - hover), 0, -d * 0.045 * (1 - hover));
    return { p: new THREE.Vector3(x, y, z), r, s: s * (1 + hover * 0.14) };
  }

  /** Camera-space transform for a card at slot i (used for flights into the hand). */
  slotWorld(i: number, n: number): { p: THREE.Vector3; q: THREE.Quaternion; s: number } {
    const sl = this.slot(i, n, 0);
    this.cam.updateMatrixWorld();
    const p = sl.p.clone().applyMatrix4(this.cam.matrixWorld);
    const q = this.cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(sl.r));
    return { p, q, s: sl.s };
  }

  create(card: Card): CardMesh {
    return new CardMesh(this.tex, card, 'hand');
  }

  /** Insert an existing card mesh (any parent) into the hand at the end. Keeps its world transform. */
  add(cm: CardMesh): void {
    cm.setVariant('hand');
    this.group.attach(cm.root);
    this.cards.push(cm);
    cm.animating = false;
    this.applyLock(cm);
  }

  /** Take a card out of the hand into world space (for flights). */
  take(cardId: number, scene: THREE.Object3D): CardMesh | null {
    const i = this.cards.findIndex((c) => c.card?.id === cardId);
    if (i < 0) return null;
    const cm = this.cards[i];
    this.cards.splice(i, 1);
    if (this.hovered === cm) this.hovered = null;
    scene.attach(cm.root);
    const lk = cm.root.getObjectByName('lock');
    if (lk) {
      cm.root.remove(lk);
      cm.tint(1, 1, 1);
    }
    cm.setVariant('table');
    return cm;
  }

  find(cardId: number): CardMesh | undefined {
    return this.cards.find((c) => c.card?.id === cardId);
  }

  ofType(type: string): CardMesh | undefined {
    return this.cards.find((c) => c.card?.type === type);
  }

  setLocked(type: string | null): void {
    this.lockedType = type;
    for (const c of this.cards) this.applyLock(c);
  }

  private applyLock(c: CardMesh): void {
    const on = !!c.card && c.card.type === this.lockedType;
    const has = c.root.getObjectByName('lock');
    if (on && !has) {
      if (!this.lockTex) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 128;
        const x = cv.getContext('2d')!;
        x.fillStyle = 'rgba(20,14,10,0.85)';
        x.beginPath();
        x.arc(64, 64, 60, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = '#c9c2b6';
        x.lineWidth = 10;
        x.beginPath();
        x.arc(64, 52, 20, Math.PI, 0);
        x.stroke();
        x.fillStyle = '#d8b25a';
        x.fillRect(36, 52, 56, 40);
        x.fillStyle = '#2a1a0a';
        x.beginPath();
        x.arc(64, 68, 7, 0, Math.PI * 2);
        x.fill();
        this.lockTex = new THREE.CanvasTexture(cv);
        this.lockTex.colorSpace = THREE.SRGBColorSpace;
      }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), new THREE.MeshBasicMaterial({ map: this.lockTex, transparent: true, depthWrite: false }));
      m.name = 'lock';
      m.position.set(0, 0, 0.002);
      c.root.add(m);
      c.tint(0.42, 0.42, 0.48);
    } else if (!on && has) {
      c.root.remove(has);
      c.tint(1, 1, 1);
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.loweredK = damp(this.loweredK, this.lowered, 6, dt);
    const n = this.cards.length;
    for (let i = 0; i < n; i++) {
      const c = this.cards[i];
      if (c.animating) continue;
      c.hover = damp(c.hover, this.hovered === c ? 1 : 0, 14, dt);
      const sl = this.slot(i, n, c.hover);
      const k = 1 - Math.exp(-12 * dt);
      c.root.position.lerp(sl.p, k);
      const q = new THREE.Quaternion().setFromEuler(sl.r);
      c.root.quaternion.slerp(q, k);
      let sc = sl.s;
      if (c.card && this.highlight.has(c.card.id)) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 7);
        const amp = this.softHighlight ? 0.012 : 0.06;
        sc *= 1 + pulse * amp;
        c.root.position.y += pulse * (this.softHighlight ? 0.001 : 0.004);
      }
      c.root.scale.setScalar(c.root.scale.x + (sc - c.root.scale.x) * k);
    }
  }

  dispose(): void {
    for (const c of this.cards) c.dispose();
    this.cards.length = 0;
    this.cam.remove(this.group);
  }
}
