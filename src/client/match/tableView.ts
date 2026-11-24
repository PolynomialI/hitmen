import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import type { SeatInfo } from '../../shared/types';
import type { App } from '../app';
import type { CardTexSet } from '../cards/cardTextures';
import { damp, ease, tweens } from '../core/tween';
import { paint } from '../gfx/textures';
import { Figure } from '../world/figure';
import { FONT3D } from '../world/fonts3d';
import { makeText, type Tavern } from '../world/tavern';
import { CARD_H, CARD_W, CardMesh } from './cardMesh';

export const Q_FLAT_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ'));
export const Q_FLAT_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, -Math.PI / 2, 0, 'YXZ'));
/** Standing upright, face toward the player's seat (-x). */
export const Q_FACE_PLAYER = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
/** Standing upright, face toward the rival (+x) — i.e. back toward the player. */
export const Q_FACE_RIVAL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));

const CARD_T = 0.0011;

/** Everything physical on and around the card table during a match. */
export class TableView {
  readonly group = new THREE.Group();
  readonly tv: Tavern;
  readonly tex: CardTexSet;
  readonly deckPos: THREE.Vector3;
  readonly pilePos: THREE.Vector3;
  private deckBox: THREE.Mesh;
  readonly deckTop: CardMesh;
  readonly deckHit: THREE.Mesh;
  private deckGlow: THREE.Mesh;
  deckGlowTarget = 0;
  private deckGlowK = 0;
  deckCount = 0;
  private label: Text;
  readonly pile: CardMesh[] = [];
  // Hourglass.
  private hg = new THREE.Group();
  private sandTop!: THREE.Mesh;
  private sandBot!: THREE.Mesh;
  hgFrac = 1;
  // Rival.
  rival: Figure | null = null;
  rivalSeat: SeatInfo | null = null;
  readonly rivalHand: CardMesh[] = [];
  private rivalName: Text | null = null;
  private rivalBadge: THREE.Sprite;
  private rivalBadgeTex: THREE.CanvasTexture | null = null;
  readonly marker: THREE.Mesh;
  markerHover = 0;
  private markerK = 0;
  markerOn = false;
  private ring: THREE.Mesh;
  private ringMat: THREE.ShaderMaterial;
  private signLit = 0;
  private signTarget = 0;
  private plaqueVals = { odds: '', hands: '', souls: '' };
  private chairBase: { obj: THREE.Object3D; pos: THREE.Vector3; rot: THREE.Euler } | null = null;

  constructor(private app: App) {
    this.tv = app.tavern;
    this.tex = app.cards;
    const T = this.tv.tableCenter;
    const top = this.tv.tableTop + 0.0015;
    this.deckPos = new THREE.Vector3(T.x - 0.12, top, T.z - 0.42);
    this.pilePos = new THREE.Vector3(T.x + 0.12, top, T.z + 0.08);

    // Deck: a block of card edges plus a real card on top.
    const edge = paint(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#e6d4ac';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        ctx.fillStyle = `rgba(90,60,30,${0.15 + Math.random() * 0.2})`;
        ctx.fillRect(0, y, w, 1);
      }
    });
    edge.wrapS = edge.wrapT = THREE.RepeatWrapping;
    const edgeMat = new THREE.MeshStandardMaterial({ map: edge, roughness: 0.85 });
    this.deckBox = new THREE.Mesh(new THREE.BoxGeometry(CARD_H * 0.985, 1, CARD_W * 0.985), edgeMat);
    this.deckBox.castShadow = this.deckBox.receiveShadow = true;
    this.group.add(this.deckBox);
    this.deckTop = new CardMesh(this.tex, null);
    this.deckTop.root.quaternion.copy(Q_FLAT_DOWN);
    this.group.add(this.deckTop.root);
    this.deckHit = new THREE.Mesh(new THREE.BoxGeometry(CARD_H * 1.3, 0.12, CARD_W * 1.4), new THREE.MeshBasicMaterial({ visible: false }));
    this.deckHit.position.copy(this.deckPos).add(new THREE.Vector3(0, 0.04, 0));
    this.group.add(this.deckHit);
    this.deckGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_H * 2.2, CARD_W * 2.4),
      new THREE.MeshBasicMaterial({ map: this.tv.glowTex, color: new THREE.Color(1.6, 1.0, 0.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.deckGlow.rotation.x = -Math.PI / 2;
    this.deckGlow.position.copy(this.deckPos).add(new THREE.Vector3(0, 0.002, 0));
    this.group.add(this.deckGlow);

    this.label = makeText('', { font: FONT3D.fell, size: 0.038, color: '#f3e6c4', glow: 0.9, letterSpacing: 0.04 });
    this.label.quaternion.copy(Q_FLAT_UP);
    this.label.position.copy(this.deckPos).add(new THREE.Vector3(-0.19, 0.001, 0));
    this.group.add(this.label);

    this.buildHourglass();

    // Target marker (in front of the rival's place).
    const tri = new THREE.Shape();
    tri.moveTo(0, 0.07);
    tri.lineTo(-0.06, -0.04);
    tri.lineTo(0.06, -0.04);
    tri.closePath();
    this.marker = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, opacity: 0, depthWrite: false }));
    this.marker.quaternion.copy(Q_FLAT_UP);
    this.marker.position.set(T.x + 0.78, top + 0.002, T.z);
    this.marker.renderOrder = 25;
    this.group.add(this.marker);

    // Reaction window ring around the discard pile.
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uP: { value: 0 }, uCol: { value: new THREE.Color(2.4, 1.3, 0.4) }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uP; uniform vec3 uCol; uniform float uA; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.x, p.y) / 6.28318 + 0.5;
          float band = smoothstep(0.80, 0.84, r) * smoothstep(1.0, 0.95, r);
          float on = step(a, uP);
          gl_FragColor = vec4(uCol * band * (0.25 + on * 0.75), band * uA); }`,
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), this.ringMat);
    this.ring.quaternion.copy(Q_FLAT_UP);
    this.ring.position.copy(this.pilePos).add(new THREE.Vector3(0, 0.003, 0));
    this.ring.renderOrder = 24;
    this.group.add(this.ring);

    this.rivalBadge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.rivalBadge.scale.setScalar(0.0001);
    this.rivalBadge.renderOrder = 26;
    this.group.add(this.rivalBadge);

    app.gfx.scene.add(this.group);
    this.setDeckCount(0);
  }

  private buildHourglass(): void {
    const m = this.tv.mats;
    const hg = this.hg;
    const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const bulb = new THREE.LatheGeometry(
      [
        [0.002, 0],
        [0.03, 0.006],
        [0.036, 0.03],
        [0.024, 0.058],
        [0.005, 0.072],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      18
    );
    const lower = new THREE.Mesh(bulb, glassMat);
    lower.position.y = 0.012;
    const upper = new THREE.Mesh(bulb, glassMat);
    upper.rotation.x = Math.PI;
    upper.position.y = 0.012 + 0.144;
    hg.add(lower, upper);
    const sandMat = new THREE.MeshStandardMaterial({ color: '#e0b070', roughness: 0.9, emissive: '#3a2000', emissiveIntensity: 0.3 });
    this.sandBot = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.04, 16), sandMat);
    this.sandBot.position.y = 0.012 + 0.02;
    this.sandTop = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.045, 16), sandMat);
    this.sandTop.rotation.x = Math.PI;
    this.sandTop.position.y = 0.012 + 0.1;
    hg.add(this.sandBot, this.sandTop);
    for (const y of [0.006, 0.162]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), m.woodDark);
      cap.position.y = y;
      cap.castShadow = true;
      hg.add(cap);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.156, 6), m.brass);
      post.position.set(Math.cos(a) * 0.042, 0.084, Math.sin(a) * 0.042);
      hg.add(post);
    }
    const T = this.tv.tableCenter;
    hg.position.set(T.x - 0.55, this.tv.tableTop, T.z + 0.6);
    this.group.add(hg);
  }

  // ------------------------------------------------------------------ deck & pile

  setDeckCount(n: number): void {
    this.deckCount = n;
    const h = Math.max(0.0005, n * CARD_T);
    this.deckBox.scale.y = h;
    this.deckBox.position.copy(this.deckPos).add(new THREE.Vector3(0, h / 2, 0));
    this.deckBox.visible = n > 1;
    this.deckTop.root.visible = n > 0;
    this.deckTop.root.position.copy(this.deckPos).add(new THREE.Vector3(0, h + 0.0004, 0));
    this.label.text = n === 1 ? '1 card left' : `${n} cards left`;
    this.label.sync();
  }

  deckTopWorld(): THREE.Vector3 {
    return this.deckPos.clone().add(new THREE.Vector3(0, this.deckCount * CARD_T + 0.002, 0));
  }

  /** World transform for the next card on the discard pile. */
  pileSlot(): { p: THREE.Vector3; q: THREE.Quaternion } {
    const n = this.pile.length;
    const yaw = (Math.sin(n * 12.9898) * 0.5) * 0.5;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(Q_FLAT_UP);
    const p = this.pilePos.clone().add(new THREE.Vector3(Math.sin(n * 3.1) * 0.012, 0.0006 + Math.min(n, 40) * 0.0009, Math.cos(n * 4.7) * 0.012));
    return { p, q };
  }

  pushPile(c: CardMesh): void {
    this.pile.push(c);
    if (this.pile.length > 28) {
      const old = this.pile.shift()!;
      old.dispose();
    }
  }

  pileTop(): CardMesh | undefined {
    return this.pile[this.pile.length - 1];
  }

  // ------------------------------------------------------------------ rival

  setRival(seat: SeatInfo): void {
    this.rivalSeat = seat;
    const f = new Figure({ cloak: seat.cloak, eyes: '#ffb347', seated: true });
    f.root.position.copy(this.tv.opponentSeat).add(new THREE.Vector3(0, 0.47, 0));
    f.root.rotation.y = -Math.PI / 2;
    f.setReach(0.55, 'L');
    f.setReach(0.55, 'R');
    this.group.add(f.root);
    this.rival = f;
    this.rivalName = makeText(seat.name, { size: 0.06, color: '#f3e6c4', glow: 1.1, font: FONT3D.gothic, outline: 0.004 });
    this.rivalName.position.copy(f.root.position).add(new THREE.Vector3(0, 0.98, 0));
    this.group.add(this.rivalName);
  }

  rivalSlot(i: number, n: number): { p: THREE.Vector3; q: THREE.Quaternion; s: number } {
    const d = i - (n - 1) / 2;
    const base = this.tv.opponentSeat.clone().add(new THREE.Vector3(-0.36, 1.0, 0));
    const p = base.add(new THREE.Vector3(Math.abs(d) * 0.004, -Math.abs(d) * 0.006, d * 0.04));
    const q = Q_FACE_RIVAL.clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), d * 0.13));
    return { p, q, s: 0.72 };
  }

  layoutRival(dur = 0.35): Promise<void> {
    const n = this.rivalHand.length;
    const jobs = this.rivalHand.map((c, i) => {
      const s = this.rivalSlot(i, n);
      const p0 = c.root.position.clone();
      const q0 = c.root.quaternion.clone();
      const s0 = c.root.scale.x;
      return tweens.to(dur, (k) => {
        c.root.position.lerpVectors(p0, s.p, k);
        c.root.quaternion.slerpQuaternions(q0, s.q, k);
        c.root.scale.setScalar(s0 + (s.s - s0) * k);
      });
    });
    return Promise.all(jobs).then(() => undefined);
  }

  showRivalBadge(turns: number): void {
    if (!this.rival) return;
    if (turns <= 1) {
      void tweens.to(0.3, (k) => this.rivalBadge.scale.setScalar(Math.max(0.0001, 0.16 * (1 - k))));
      return;
    }
    this.rivalBadgeTex?.dispose();
    this.rivalBadgeTex = paint(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.4, h * 0.35, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#e0503a');
      g.addColorStop(1, '#6a0c06');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const r = (i % 2 ? 0.46 : 0.5) * w;
        ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
      }
      ctx.fill();
      ctx.fillStyle = '#ffe2b0';
      ctx.font = '800 58px "Grenze Gotisch"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×' + turns, w / 2, h / 2 + 4);
    });
    const mat = this.rivalBadge.material as THREE.SpriteMaterial;
    mat.map = this.rivalBadgeTex;
    mat.needsUpdate = true;
    this.rivalBadge.position.copy(this.rival.root.position).add(new THREE.Vector3(0, 0.88, 0.22));
    void tweens.to(0.45, (k) => this.rivalBadge.scale.setScalar(Math.max(0.0001, 0.16 * k)), { ease: ease.outBack });
  }

  /** Remember the chair so the death animation can knock it over (and we can stand it back up). */
  rivalChair(): THREE.Object3D | null {
    if (this.chairBase) return this.chairBase.obj;
    let found: THREE.Object3D | null = null;
    const seat = this.tv.opponentSeat;
    this.tv.group.children.forEach((o) => {
      if (o.position.distanceTo(seat) < 0.01) found = o;
    });
    if (found) this.chairBase = { obj: found, pos: (found as THREE.Object3D).position.clone(), rot: (found as THREE.Object3D).rotation.clone() };
    return found;
  }

  resetChair(): void {
    if (!this.chairBase) return;
    this.chairBase.obj.position.copy(this.chairBase.pos);
    this.chairBase.obj.rotation.copy(this.chairBase.rot);
  }

  // ------------------------------------------------------------------ boards & sign

  setPlaques(odds: number, hands: number, souls: number): void {
    const vals = { odds: `${Math.round(odds * 100)}%`, hands: String(hands), souls: String(souls) };
    const pl = this.tv.plaques;
    for (const k of ['odds', 'hands', 'souls'] as const) {
      if (this.plaqueVals[k] === vals[k]) continue;
      this.plaqueVals[k] = vals[k];
      const t = pl[k];
      t.text = vals[k];
      t.sync();
      void tweens.to(0.5, (q) => t.scale.setScalar(1 + Math.sin(q * Math.PI) * 0.25), { ease: ease.outCubic });
    }
  }

  setSign(on: boolean): void {
    this.signTarget = on ? 1 : 0;
    const flames = this.tv.sign.flames;
    const n = flames.length / 2;
    for (let i = 0; i < n; i++) {
      const idx = on ? i : n - 1 - i;
      setTimeout(() => {
        this.tv.flames.setLit(flames[idx * 2], on ? 1 : 0);
        this.tv.flames.setLit(flames[idx * 2 + 1], on ? 1 : 0);
      }, i * 45);
    }
  }

  // ------------------------------------------------------------------ timers

  flipHourglass(): void {
    const g = this.hg;
    const r0 = g.rotation.z;
    this.hgFrac = 1;
    void tweens.to(0.6, (k) => (g.rotation.z = r0 + Math.PI * k), { ease: ease.inOutCubic }).then(() => (g.rotation.z = 0));
  }

  setRing(frac: number, alpha: number): void {
    this.ringMat.uniforms.uP.value = frac;
    this.ringMat.uniforms.uA.value = alpha;
  }

  update(t: number, dt: number): void {
    this.rival?.update(t, dt);
    // Hourglass sand.
    const f = Math.max(0, Math.min(1, this.hgFrac));
    this.sandTop.scale.set(Math.max(0.05, Math.sqrt(f)), Math.max(0.02, f), Math.max(0.05, Math.sqrt(f)));
    this.sandBot.scale.set(Math.max(0.05, Math.sqrt(1 - f)), Math.max(0.02, 1 - f), Math.max(0.05, Math.sqrt(1 - f)));
    // Deck glow when it is drawable.
    this.deckGlowK = damp(this.deckGlowK, this.deckGlowTarget, 6, dt);
    (this.deckGlow.material as THREE.MeshBasicMaterial).opacity = this.deckGlowK * (0.55 + Math.sin(t * 3) * 0.2);
    // Target marker.
    this.markerK = damp(this.markerK, this.markerOn ? 1 : 0, 8, dt);
    const mm = this.marker.material as THREE.MeshBasicMaterial;
    mm.opacity = this.markerK;
    mm.color.setRGB(3 - this.markerHover * 2.2, 3, 3 - this.markerHover * 2.4);
    this.marker.scale.setScalar(0.8 + this.markerK * 0.3 + Math.sin(t * 5) * 0.06 * this.markerK + this.markerHover * 0.2);
    // Sign glow.
    this.signLit = damp(this.signLit, this.signTarget, 5, dt);
    const s = this.signLit;
    const flick = 0.92 + Math.sin(t * 17) * 0.04 + Math.sin(t * 7.3) * 0.04;
    this.tv.sign.text.color = new THREE.Color(1, 0.82, 0.48).multiplyScalar(0.25 + s * 2.6 * flick);
    // Name tag faces the camera.
    if (this.rivalName) this.rivalName.quaternion.copy(this.app.gfx.camera.quaternion);
  }

  dispose(): void {
    this.app.gfx.scene.remove(this.group);
    this.rival = null;
    this.resetChair();
    for (const f of this.tv.sign.flames) this.tv.flames.setLit(f, 0);
    for (const k of ['odds', 'hands', 'souls'] as const) {
      this.tv.plaques[k].text = '—';
      this.tv.plaques[k].sync();
    }
  }
}

export { CARD_W, CARD_H };
