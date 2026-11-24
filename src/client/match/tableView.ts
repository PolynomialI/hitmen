import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import type { PlayerId, SeatInfo } from '../../shared/types';
import type { App } from '../app';
import type { CardTexSet } from '../cards/cardTextures';
import { damp, ease, tweens } from '../core/tween';
import { paint } from '../gfx/textures';
import { accessoryFor, Figure } from '../world/figure';
import { FONT3D } from '../world/fonts3d';
import { buildCharm, buildSeat } from '../cosmetics/art';
import { makeText, type Tavern } from '../world/tavern';
import { CARD_H, CARD_R, CARD_THICK, CARD_W, CardMesh, roundedWallGeometry } from './cardMesh';

export const Q_FLAT_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ'));
export const Q_FLAT_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, -Math.PI / 2, 0, 'YXZ'));
export const Q_FACE_PLAYER = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
export const Q_FACE_RIVAL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));

const CARD_T = 0.0016;
const PILE_STEP = CARD_THICK + 0.00018;
const PILE_MAX = 16;
/** Visual deck height: full thickness for the first 30 cards, then compressed. */
const deckHeight = (n: number) => Math.max(0.0005, Math.min(n, 30) * CARD_T + Math.max(0, n - 30) * 0.0007);
const SEAT_R = 1.34;
const TEAM_COLORS = ['#e0503a', '#3a8ae0'];

/** Angles (radians, 0 = across the table from the player) for k rivals. */
function rivalAngles(k: number): number[] {
  switch (k) {
    case 1:
      return [0];
    case 2:
      return [-0.62, 0.62];
    case 3:
      return [-1.12, 0, 1.12];
    case 4:
      return [-1.45, -0.5, 0.5, 1.45];
    default:
      return [-1.7, -0.86, 0, 0.86, 1.7];
  }
}

export interface SeatView {
  info: SeatInfo;
  angle: number;
  /** Floor position of the chair. */
  pos: THREE.Vector3;
  /** Unit vector from the table centre toward the seat (xz). */
  out: THREE.Vector3;
  figure: Figure;
  chair: THREE.Group;
  hand: CardMesh[];
  name: Text;
  badge: THREE.Sprite;
  badgeTex: THREE.CanvasTexture | null;
  ward: THREE.Mesh;
  wardK: number;
  wardOn: boolean;
  marker: THREE.Mesh;
  markerK: number;
  markerOn: boolean;
  markerHover: number;
  glow: THREE.Mesh;
  glowK: number;
  alive: boolean;
  mate: boolean;
}

/** Everything physical on and around the card table during a match. */
export class TableView {
  readonly group = new THREE.Group();
  readonly tv: Tavern;
  readonly tex: CardTexSet;
  readonly deckPos: THREE.Vector3;
  readonly pilePos: THREE.Vector3;
  readonly center: THREE.Vector3;
  private deckBox: THREE.Mesh;
  private deckEdgeTex: THREE.Texture;
  readonly deckTop: CardMesh;
  readonly deckHit: THREE.Mesh;
  private deckGlow: THREE.Mesh;
  deckGlowTarget = 0;
  private deckGlowK = 0;
  deckCount = 0;
  private label: Text;
  readonly pile: CardMesh[] = [];
  private hg = new THREE.Group();
  private sandTop!: THREE.Mesh;
  private sandBot!: THREE.Mesh;
  hgFrac = 1;
  readonly seats = new Map<PlayerId, SeatView>();
  /** Seat marker for "yourself" (Aegis) near the player's edge. */
  readonly selfMarker: THREE.Mesh;
  selfMarkerOn = false;
  selfMarkerHover = 0;
  private selfMarkerK = 0;
  private ring: THREE.Mesh;
  private ringMat: THREE.ShaderMaterial;
  private orderRing: THREE.Mesh;
  orderDir: 1 | -1 = 1;
  private orderSpin = 0;
  private orderFlash = 0;
  private chains: THREE.Group | null = null;
  private signLit = 0;
  private signTarget = 0;
  private plaqueVals = { odds: '', hands: '', souls: '' };
  me: PlayerId = '';
  myTeam: number | undefined;

  constructor(private app: App) {
    this.tv = app.tavern;
    this.tex = app.cards;
    const T = this.tv.tableCenter;
    this.center = T.clone();
    const top = this.tv.tableTop + 0.0015;
    this.deckPos = new THREE.Vector3(T.x - 0.12, top, T.z - 0.42);
    this.pilePos = new THREE.Vector3(T.x + 0.12, top, T.z + 0.08);

    // Deck: a rounded slab whose sides show one ivory layer per card.
    const edge = paint(8, 16, (ctx, w, h) => {
      ctx.fillStyle = '#efe3c6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(120,90,50,0.55)';
      ctx.fillRect(0, h - 3, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(0, 0, w, 2);
    });
    edge.wrapS = edge.wrapT = THREE.RepeatWrapping;
    this.deckEdgeTex = edge;
    const deckGeo = roundedWallGeometry(CARD_H * 0.992, CARD_W * 0.992, CARD_R, 1);
    deckGeo.rotateX(-Math.PI / 2);
    this.deckBox = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: edge, roughness: 0.7 }));
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

    this.selfMarker = this.makeMarker();
    this.selfMarker.position.set(T.x - 0.78, top + 0.002, T.z);
    this.selfMarker.rotation.z = Math.PI;
    this.group.add(this.selfMarker);

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

    // Turn-order ring: faint gilded chevrons circling the felt in the direction of play.
    const chevrons = paint(1024, 1024, (ctx, w) => {
      ctx.translate(w / 2, w / 2);
      ctx.strokeStyle = 'rgba(255,210,120,0.9)';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.translate(0, -w * 0.43);
        ctx.beginPath();
        ctx.moveTo(-18, -16);
        ctx.lineTo(4, 0);
        ctx.lineTo(-18, 16);
        ctx.stroke();
        ctx.restore();
      }
    });
    this.orderRing = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0),
      new THREE.MeshBasicMaterial({ map: chevrons, color: new THREE.Color(0.9, 0.7, 0.35), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.orderRing.rotation.x = -Math.PI / 2;
    this.orderRing.position.set(T.x, top + 0.0015, T.z);
    this.orderRing.renderOrder = 5;
    this.group.add(this.orderRing);

    app.gfx.scene.add(this.group);
    this.setDeckCount(0);
  }

  private makeMarker(): THREE.Mesh {
    const tri = new THREE.Shape();
    tri.moveTo(0, 0.07);
    tri.lineTo(-0.06, -0.04);
    tri.lineTo(0.06, -0.04);
    tri.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 25;
    return m;
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
    const h = deckHeight(n);
    this.deckBox.scale.y = h;
    this.deckEdgeTex.repeat.set(1, Math.max(1, n - 1));
    this.deckBox.position.copy(this.deckPos).add(new THREE.Vector3(0, h / 2, 0));
    this.deckBox.visible = n > 1;
    this.deckTop.root.visible = n > 0;
    this.deckTop.root.position.copy(this.deckPos).add(new THREE.Vector3(0, h + CARD_THICK / 2 + 0.0002, 0));
    this.label.text = n === 1 ? '1 card left' : `${n} cards left`;
    this.label.sync();
  }

  deckTopWorld(): THREE.Vector3 {
    return this.deckPos.clone().add(new THREE.Vector3(0, deckHeight(this.deckCount) + CARD_THICK + 0.002, 0));
  }

  pileSlot(): { p: THREE.Vector3; q: THREE.Quaternion } {
    const n = this.pile.length;
    const yaw = Math.sin(n * 12.9898) * 0.25;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(Q_FLAT_UP);
    const p = this.pilePos.clone().add(new THREE.Vector3(Math.sin(n * 3.1) * 0.014, CARD_THICK / 2 + 0.0004 + n * PILE_STEP, Math.cos(n * 4.7) * 0.014));
    return { p, q };
  }

  pushPile(c: CardMesh): void {
    this.pile.push(c);
    if (this.pile.length > PILE_MAX) {
      // Drop the buried card and settle the rest one layer down so heights stay unique.
      this.pile.shift()!.dispose();
      for (const pc of this.pile) pc.root.position.y -= PILE_STEP;
    }
  }

  pileTop(): CardMesh | undefined {
    return this.pile[this.pile.length - 1];
  }

  /** Remove a specific card mesh from the pile (it is leaving: burned, retaken). */
  takeFromPile(id: number): CardMesh | undefined {
    const i = this.pile.findIndex((c) => c.card?.id === id);
    if (i < 0) return undefined;
    return this.pile.splice(i, 1)[0];
  }

  // ------------------------------------------------------------------ seats

  setSeats(seats: SeatInfo[], me: PlayerId): void {
    this.me = me;
    this.myTeam = seats.find((s) => s.id === me)?.team;
    const myIdx = seats.findIndex((s) => s.id === me);
    const order = myIdx < 0 ? [...seats] : [...seats.slice(myIdx + 1), ...seats.slice(0, myIdx)];
    const angles = rivalAngles(order.length);
    // Hide the tavern's single display chair; we place our own.
    const oldChair = this.tv.group.children.find((o) => o.position.distanceTo(this.tv.opponentSeat) < 0.01);
    if (oldChair) oldChair.visible = false;
    order.forEach((info, i) => {
      // Turn order goes clockwise from the player's left, so seat 1 sits at the far left angle.
      const angle = angles[angles.length - 1 - i];
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const pos = this.center.clone().setY(0).addScaledVector(out, SEAT_R);
      const chair = buildSeat(info.look?.seat ?? 'oak', this.tv.mats);
      chair.position.copy(pos).addScaledVector(out, 0.02);
      chair.lookAt(this.center.clone().setY(0));
      this.group.add(chair);
      if (info.look?.charm && info.look.charm !== 'none') {
        const ch = buildCharm(info.look.charm, this.tv.mats);
        const cp = this.center.clone().addScaledVector(out, 0.86).add(new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(0.28));
        ch.position.set(cp.x, this.tv.tableTop + 0.002, cp.z);
        ch.lookAt(this.center.x, ch.position.y, this.center.z);
        this.group.add(ch);
      }
      const f = new Figure({ cloak: info.cloak, eyes: info.team != null ? TEAM_COLORS[info.team] : '#ffb347', seated: true, accessory: accessoryFor(info.name), trim: info.team != null ? TEAM_COLORS[info.team] : undefined });
      f.root.position.copy(pos).add(new THREE.Vector3(0, 0.47, 0));
      f.root.lookAt(this.center.clone().setY(0.47));
      f.setReach(0.55, 'L');
      f.setReach(0.55, 'R');
      this.group.add(f.root);
      const mate = this.myTeam != null && info.team === this.myTeam;
      const nameColor = info.team != null ? TEAM_COLORS[info.team] : '#f3e6c4';
      const name = makeText(info.name, { size: 0.07, color: nameColor, glow: 1.1, font: FONT3D.gothic, outline: 0.005 });
      // Just above the hood tip (hood top is ~1.14 above the figure root), drawn over everything so it is never hidden.
      name.position.copy(f.root.position).add(new THREE.Vector3(0, 1.2, 0));
      for (const mt of ([] as THREE.Material[]).concat(name.material)) mt.depthTest = false;
      name.renderOrder = 27;
      this.group.add(name);
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      badge.scale.setScalar(0.0001);
      badge.position.copy(f.root.position).add(new THREE.Vector3(0, 0.84, 0)).addScaledVector(out, -0.05);
      badge.renderOrder = 26;
      this.group.add(badge);
      const ward = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      ward.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
      ward.scale.set(1, 1.5, 1);
      this.group.add(ward);
      const marker = this.makeMarker();
      const mp = this.center.clone().addScaledVector(out, 0.78);
      marker.position.set(mp.x, this.tv.tableTop + 0.0035, mp.z);
      marker.rotation.z = -angle - Math.PI / 2;
      this.group.add(marker);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.5),
        new THREE.MeshBasicMaterial({ map: this.tv.glowTex, color: new THREE.Color(1.6, 1.1, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.rotation.z = -angle;
      const gp = this.center.clone().addScaledVector(out, 0.82);
      glow.position.set(gp.x, this.tv.tableTop + 0.003, gp.z);
      this.group.add(glow);
      this.seats.set(info.id, {
        info,
        angle,
        pos,
        out,
        figure: f,
        chair,
        hand: [],
        name,
        badge,
        badgeTex: null,
        ward,
        wardK: 0,
        wardOn: false,
        marker,
        markerK: 0,
        markerOn: false,
        markerHover: 0,
        glow,
        glowK: 0,
        alive: true,
        mate,
      });
    });
  }

  /** Your own charm, at your place at the table. */
  setMyCharm(model: string | undefined): void {
    if (!model || model === 'none') return;
    const ch = buildCharm(model, this.tv.mats);
    ch.scale.setScalar(1.3);
    ch.position.set(this.center.x - 0.72, this.tv.tableTop + 0.002, this.center.z - 0.62);
    ch.rotation.y = Math.PI / 2 + 0.4;
    this.group.add(ch);
    this.myCharm = ch;
  }
  myCharm: THREE.Group | null = null;

  seat(id: PlayerId): SeatView | undefined {
    return this.seats.get(id);
  }

  /** Transform for card i of n held by a seat (backs toward the table, or faces to us for teammates). */
  handSlot(id: PlayerId, i: number, n: number): { p: THREE.Vector3; q: THREE.Quaternion; s: number } {
    const sv = this.seats.get(id)!;
    const d = i - (n - 1) / 2;
    const side = new THREE.Vector3(-sv.out.z, 0, sv.out.x);
    const base = sv.pos.clone().setY(1.0).addScaledVector(sv.out, -0.36);
    const spread = n > 6 ? 0.028 : 0.04;
    const p = base.addScaledVector(side, d * spread).add(new THREE.Vector3(0, -Math.abs(d) * 0.006, 0)).addScaledVector(sv.out, Math.abs(d) * 0.004);
    const dummy = new THREE.Object3D();
    dummy.position.copy(p);
    if (sv.mate) {
      // Teammates show you their hand.
      dummy.lookAt(this.app.gfx.camera.position);
      dummy.rotateX(-0.1);
    } else {
      dummy.lookAt(sv.figure.root.position.clone().add(new THREE.Vector3(0, 0.45, 0)));
      dummy.rotateX(0.25);
    }
    dummy.rotateZ(sv.mate ? -d * 0.08 : d * 0.13);
    return { p, q: dummy.quaternion.clone(), s: sv.mate ? 0.8 : 0.72 };
  }

  layoutSeat(id: PlayerId, dur = 0.35): Promise<void> {
    const sv = this.seats.get(id);
    if (!sv) return Promise.resolve();
    const n = sv.hand.length;
    const jobs = sv.hand.map((c, i) => {
      const s = this.handSlot(id, i, n);
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

  setBadge(id: PlayerId, turns: number): void {
    const sv = this.seats.get(id);
    if (!sv) return;
    if (turns <= 1) {
      if (sv.badge.scale.x > 0.001) void tweens.to(0.3, (k) => sv.badge.scale.setScalar(Math.max(0.0001, 0.15 * (1 - k))));
      return;
    }
    sv.badgeTex?.dispose();
    sv.badgeTex = paint(128, 128, (ctx, w, h) => {
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
    const mat = sv.badge.material as THREE.SpriteMaterial;
    mat.map = sv.badgeTex;
    mat.needsUpdate = true;
    void tweens.to(0.45, (k) => sv.badge.scale.setScalar(Math.max(0.0001, 0.15 * k)), { ease: ease.outBack });
  }

  clearBadges(): void {
    for (const id of this.seats.keys()) this.setBadge(id, 0);
  }

  setWard(id: PlayerId, on: boolean): void {
    const sv = this.seats.get(id);
    if (sv) sv.wardOn = on;
  }

  setTurn(id: PlayerId | null): void {
    for (const sv of this.seats.values()) {
      const on = sv.info.id === id;
      sv.name.color = new THREE.Color(on ? '#ffd27a' : sv.info.team != null ? TEAM_COLORS[sv.info.team] : '#f3e6c4').multiplyScalar(on ? 1.8 : 1.05);
      if (on) sv.figure.lookPitch = 0.25;
      else sv.figure.lookPitch = 0;
    }
    this.turnId = id;
  }
  private turnId: PlayerId | null = null;

  setMarkers(ids: PlayerId[], self = false): void {
    for (const sv of this.seats.values()) sv.markerOn = ids.includes(sv.info.id) && sv.alive;
    this.selfMarkerOn = self;
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

  /** Spin the turn-order ring the other way. */
  reverse(dir: 1 | -1): void {
    this.orderDir = dir;
    this.orderSpin = 6 * -dir;
    this.orderFlash = 1;
  }

  // ------------------------------------------------------------------ shackles

  showChains(on: boolean): void {
    if (on && !this.chains) {
      const g = new THREE.Group();
      const linkGeo = new THREE.TorusGeometry(0.018, 0.0055, 6, 12);
      const mat = this.tv.mats.iron;
      const N = 26;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const l = new THREE.Mesh(linkGeo, mat);
        l.position.set(Math.cos(a) * 0.15, 0.01 + Math.sin(a * 3) * 0.004, Math.sin(a) * 0.15);
        l.rotation.y = -a;
        l.rotation.x = i % 2 ? Math.PI / 2 : 0;
        l.castShadow = true;
        g.add(l);
      }
      const lock = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.02), this.tv.mats.brass);
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 12, Math.PI), this.tv.mats.iron);
      shackle.position.y = 0.022;
      lock.add(body, shackle);
      lock.position.set(-0.15, 0.03, 0);
      lock.rotation.y = Math.PI / 2;
      g.add(lock);
      g.position.copy(this.pilePos);
      g.scale.setScalar(0.01);
      this.group.add(g);
      this.chains = g;
      void tweens.to(0.6, (k) => {
        g.scale.setScalar(Math.max(0.01, k));
        g.rotation.y = (1 - k) * 2;
      }, { ease: ease.outBack });
    } else if (!on && this.chains) {
      const g = this.chains;
      this.chains = null;
      void tweens.to(0.5, (k) => {
        g.scale.setScalar(1 + k * 0.6);
        g.children.forEach((c, i) => c.position.addScaledVector(new THREE.Vector3(Math.cos(i), 0.6, Math.sin(i)), 0.012));
      }).then(() => this.group.remove(g));
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
    const f = Math.max(0, Math.min(1, this.hgFrac));
    this.sandTop.scale.set(Math.max(0.05, Math.sqrt(f)), Math.max(0.02, f), Math.max(0.05, Math.sqrt(f)));
    this.sandBot.scale.set(Math.max(0.05, Math.sqrt(1 - f)), Math.max(0.02, 1 - f), Math.max(0.05, Math.sqrt(1 - f)));
    this.deckGlowK = damp(this.deckGlowK, this.deckGlowTarget, 6, dt);
    (this.deckGlow.material as THREE.MeshBasicMaterial).opacity = this.deckGlowK * (0.55 + Math.sin(t * 3) * 0.2);
    const cam = this.app.gfx.camera;
    for (const sv of this.seats.values()) {
      if (sv.figure.root.visible) sv.figure.update(t, dt);
      sv.name.quaternion.copy(cam.quaternion);
      sv.markerK = damp(sv.markerK, sv.markerOn ? 1 : 0, 8, dt);
      const mm = sv.marker.material as THREE.MeshBasicMaterial;
      mm.opacity = sv.markerK;
      mm.color.setRGB(3 - sv.markerHover * 2.2, 3, 3 - sv.markerHover * 2.4);
      sv.marker.scale.setScalar(0.8 + sv.markerK * 0.3 + Math.sin(t * 5) * 0.06 * sv.markerK + sv.markerHover * 0.25);
      sv.wardK = damp(sv.wardK, sv.wardOn ? 1 : 0, 4, dt);
      (sv.ward.material as THREE.MeshBasicMaterial).opacity = sv.wardK * (0.16 + Math.sin(t * 2.4) * 0.05);
      sv.ward.visible = sv.wardK > 0.01;
      sv.glowK = damp(sv.glowK, this.turnId === sv.info.id ? 1 : 0, 4, dt);
      (sv.glow.material as THREE.MeshBasicMaterial).opacity = sv.glowK * (0.5 + Math.sin(t * 3) * 0.12);
    }
    this.selfMarkerK = damp(this.selfMarkerK, this.selfMarkerOn ? 1 : 0, 8, dt);
    const sm = this.selfMarker.material as THREE.MeshBasicMaterial;
    sm.opacity = this.selfMarkerK;
    sm.color.setRGB(3 - this.selfMarkerHover * 2.2, 3, 3 - this.selfMarkerHover * 2.4);
    // Turn-order ring.
    this.orderSpin = damp(this.orderSpin, 0, 2.5, dt);
    this.orderFlash = damp(this.orderFlash, 0, 2, dt);
    this.orderRing.rotation.z += dt * (0.05 * this.orderDir + this.orderSpin);
    this.orderRing.scale.x = this.orderDir;
    (this.orderRing.material as THREE.MeshBasicMaterial).opacity = 0.14 + this.orderFlash * 0.6;
    if (this.chains) this.chains.rotation.y += dt * 0.15;
    const sp = this.myCharm?.userData.spin as THREE.Object3D | undefined;
    if (sp) sp.rotation.y += dt * 0.8;
    this.signLit = damp(this.signLit, this.signTarget, 5, dt);
    const flick = 0.92 + Math.sin(t * 17) * 0.04 + Math.sin(t * 7.3) * 0.04;
    this.tv.sign.text.color = new THREE.Color(1, 0.82, 0.48).multiplyScalar(0.25 + this.signLit * 2.6 * flick);
  }

  dispose(): void {
    this.app.gfx.scene.remove(this.group);
    for (const sv of this.seats.values()) sv.hand.forEach((c) => c.dispose());
    const oldChair = this.tv.group.children.find((o) => o.position.distanceTo(this.tv.opponentSeat) < 0.01);
    if (oldChair) oldChair.visible = true;
    for (const f of this.tv.sign.flames) this.tv.flames.setLit(f, 0);
    for (const k of ['odds', 'hands', 'souls'] as const) {
      this.tv.plaques[k].text = '—';
      this.tv.plaques[k].sync();
    }
  }
}

export { CARD_W, CARD_H, TEAM_COLORS };
