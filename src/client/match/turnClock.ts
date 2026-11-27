import * as THREE from 'three';
import { audio } from '../audio/audio';
import { damp, ease, tweens } from '../core/tween';
import { paint } from '../gfx/textures';
import type { Mats } from '../world/materials';
import { mergeLocal } from '../world/batch';
import { makeText } from '../world/tavern';
import { FONT3D } from '../world/fonts3d';

/** Radius of the ring the clock travels around the table (between the seats and the deck). */
const RING = 0.6;
/** In front of you it comes a little nearer the middle so it stays above your hand. */
const RING_ME = 0.56;
const FACE_R = 0.1;

/**
 * The turn clock: a double-faced brass table clock that stands in front of whoever's turn it is and travels around
 * the table (in the order of play) to the next player. Its red wedge is the time left; a red enamel medallion shows
 * how many turns the player still has to take (2 or more after a Bounty).
 */
export class TurnClock {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hands: THREE.Object3D[] = [];
  private wedges: THREE.ShaderMaterial[] = [];
  private bells: THREE.Object3D[] = [];
  private medal = new THREE.Group();
  private medalTexts: Array<ReturnType<typeof makeText>> = [];
  private angle = Math.PI;
  private moving = false;
  private ring = 0;
  private shake = 0;
  private lastTick = -1;
  private wobble = 0;
  /** 0..1 time left this turn (1 = full), or -1 for untimed turns. */
  frac = -1;

  constructor(
    private center: THREE.Vector3,
    private tableTop: number,
    mats: Mats
  ) {
    const brass = mats.brass;
    // Plinth: dark carved wood with a brass band.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.11), mats.woodDark);
    plinth.position.y = 0.0175;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.226, 0.008, 0.116), brass);
    band.position.y = 0.03;
    const feet = [-1, 1].flatMap((x) => [-1, 1].map((z) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), brass);
      f.position.set(x * 0.095, 0.004, z * 0.042);
      return f;
    }));
    // Pillar and drum-shaped case standing on edge, dial facing both ways.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.034, 0.05, 16), brass);
    neck.position.y = 0.058;
    const caseGeo = new THREE.CylinderGeometry(FACE_R + 0.016, FACE_R + 0.016, 0.06, 40);
    caseGeo.rotateX(Math.PI / 2);
    const drum = new THREE.Mesh(caseGeo, brass);
    const cy = 0.083 + FACE_R + 0.016;
    drum.position.y = cy;
    this.body.add(plinth, band, ...feet, neck, drum);
    const dial = dialTexture();
    const discMat = new THREE.MeshStandardMaterial({ map: dial, roughness: 0.45, emissiveMap: dial, emissive: new THREE.Color(0.25, 0.22, 0.18) });
    const glassMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.4 });
    for (const side of [1, -1]) {
      const face = new THREE.Group();
      face.position.set(0, cy, side * 0.031);
      if (side < 0) face.rotation.y = Math.PI;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(FACE_R, 48), discMat);
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(FACE_R + 0.006, 0.009, 10, 48), brass);
      // Time left: a translucent red wedge over the dial that shrinks clockwise.
      const wedgeMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uFrac: { value: 0 }, uA: { value: 0 } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec2 vP; uniform float uFrac; uniform float uA;
          void main(){
            float a = atan(vP.x, vP.y); // 0 at twelve, clockwise positive
            if (a < 0.0) a += 6.2831853;
            float r = length(vP) / ${FACE_R.toFixed(3)};
            if (a > uFrac * 6.2831853 || r > 0.8) discard;
            gl_FragColor = vec4(0.85, 0.08, 0.04, uA * (0.35 + 0.2 * smoothstep(0.8, 0.4, r)));
          }`,
      });
      this.wedges.push(wedgeMat);
      const wedge = new THREE.Mesh(new THREE.CircleGeometry(FACE_R, 48), wedgeMat);
      wedge.position.z = 0.001;
      const hourHand = hand(0.05, 0.007, mats.iron);
      hourHand.rotation.z = -1.2;
      const minHand = hand(0.078, 0.005, mats.iron);
      minHand.position.z = 0.003;
      this.hands.push(minHand);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10), brass);
      pin.rotation.x = Math.PI / 2;
      pin.position.z = 0.005;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(FACE_R, 32), glassMat);
      glass.position.z = 0.008;
      face.add(disc, wedge, hourHand, minHand, pin, glass, bezel);
      this.body.add(face);
    }
    // Twin alarm bells and a hammer on top; they ring when the clock arrives.
    for (const x of [-1, 1]) {
      const bell = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.034, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), brass);
      bell.add(dome);
      bell.position.set(x * 0.058, cy + FACE_R + 0.02, 0);
      bell.rotation.z = -x * 0.5;
      this.bells.push(bell);
      this.body.add(bell);
    }
    const finial = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 20), brass);
    finial.position.y = cy + FACE_R + 0.035;
    this.body.add(finial);
    this.body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    // Owed turns: a red enamel medallion on each side, hanging below the dial.
    const enamel = new THREE.MeshStandardMaterial({ color: '#8a1410', roughness: 0.3, metalness: 0.2, emissive: new THREE.Color(0.35, 0.03, 0.02) });
    for (const side of [1, -1]) {
      const m = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.036, 28), enamel);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.005, 8, 28), brass);
      const txt = makeText('×2', { size: 0.036, color: '#ffe6b0', glow: 1.6, font: FONT3D.gothicBlack });
      txt.position.z = 0.002;
      this.medalTexts.push(txt);
      m.add(disc, rim, txt);
      m.position.z = side * 0.062;
      if (side < 0) m.rotation.y = Math.PI;
      this.medal.add(m);
    }
    this.medal.position.y = 0.062;
    this.medal.scale.setScalar(0.0001);
    this.medal.visible = false;
    this.body.add(this.medal);
    // One draw call per material for everything that doesn't move on its own (the clock had 31 meshes).
    mergeLocal(this.body, [...this.hands, ...this.bells, this.medal]);
    this.root.add(this.body);
    this.root.scale.setScalar(1.3);
    this.place(this.angle);
  }

  private radiusAt(a: number): number {
    // Nearer the middle in front of you (angle π), the full ring elsewhere.
    const k = Math.max(0, -Math.cos(a));
    return RING + (RING_ME - RING) * k * k;
  }

  private place(a: number, hop = 0): void {
    const r = this.radiusAt(a);
    this.root.position.set(this.center.x + Math.cos(a) * r, this.tableTop + hop, this.center.z + Math.sin(a) * r);
    // One dial faces the player it stands in front of, turned partly toward your seat (the table cameras look
    // from -x) so a side player's clock is not seen edge-on; the other dial faces the rest of the table.
    const fx = Math.cos(a) - 0.65;
    const fz = Math.sin(a);
    this.root.rotation.y = Math.atan2(fx, fz);
  }

  /**
   * Travel around the table to `target` (an angle), in the direction of play (+1 = clockwise from above).
   * `quiet`: no swish or bells (arriving at your own place: your turn has no sound of its own).
   */
  async goTo(target: number, dir: 1 | -1, turnsLeft: number, quiet = false): Promise<void> {
    const TWO = Math.PI * 2;
    let delta = (((target - this.angle) % TWO) + TWO) % TWO; // 0..2π clockwise
    if (dir < 0 && delta > 0) delta -= TWO;
    this.setTurns(turnsLeft);
    if (Math.abs(delta) < 0.01) {
      this.ringBells(quiet);
      return;
    }
    const a0 = this.angle;
    const dur = 0.55 + (Math.abs(delta) / Math.PI) * 0.45;
    this.moving = true;
    if (!quiet) audio.play('swish', { vol: 0.35 });
    await tweens.to(
      dur,
      (k, raw) => {
        const a = a0 + delta * k;
        this.angle = a;
        this.place(a, Math.sin(raw * Math.PI) * 0.035);
        // Lean into the travel, settle on arrival.
        this.body.rotation.z = -Math.sign(delta) * Math.sin(raw * Math.PI) * 0.18;
      },
      { ease: ease.inOutCubic }
    );
    this.angle = ((target % TWO) + TWO) % TWO;
    this.place(this.angle);
    this.body.rotation.z = 0;
    this.moving = false;
    this.ringBells(quiet);
  }

  /** Jump straight to a player (match start). */
  snapTo(target: number): void {
    this.angle = target;
    this.place(target);
  }

  setTurns(n: number): void {
    const on = n >= 2;
    if (on)
      for (const t of this.medalTexts) {
        t.text = `×${n}`;
        t.sync();
      }
    const s0 = this.medal.scale.x;
    if (on) this.medal.visible = true;
    void tweens
      .to(0.45, (k) => this.medal.scale.setScalar(Math.max(0.0001, s0 + ((on ? 1 : 0) - s0) * k)), { ease: on ? ease.outBack : ease.inQuad })
      .then(() => (this.medal.visible = this.medal.scale.x > 0.001));
  }

  private ringBells(quiet = false): void {
    this.ring = 1;
    if (!quiet) audio.play('chime', { vol: 0.5 });
  }

  update(t: number, dt: number): void {
    // Minute hands sweep; the wedge shows the time left.
    for (const h of this.hands) h.rotation.z = -t * 0.9;
    const timed = this.frac >= 0;
    for (const w of this.wedges) {
      w.uniforms.uFrac.value = timed ? this.frac : 0;
      w.uniforms.uA.value = damp(w.uniforms.uA.value, timed && !this.moving ? 1 : 0, 6, dt);
    }
    // Last seconds: tick and tremble.
    if (timed && this.frac > 0 && this.frac < 0.18 && !this.moving) {
      const tick = Math.floor(t * 2);
      if (tick !== this.lastTick) {
        this.lastTick = tick;
        audio.play('tick', { vol: 0.35 });
        this.shake = 1;
      }
    }
    this.shake = damp(this.shake, 0, 10, dt);
    this.ring = damp(this.ring, 0, 3.2, dt);
    this.wobble += dt * 38;
    const r = this.ring * Math.sin(this.wobble) * 0.25;
    this.bells.forEach((b, i) => (b.rotation.x = i ? r : -r));
    if (!this.moving) this.body.rotation.z = Math.sin(t * 60) * 0.012 * this.shake + Math.sin(this.wobble) * 0.02 * this.ring;
  }
}

function hand(len: number, w: number, mat: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w, -len * 0.18);
  s.lineTo(w, -len * 0.18);
  s.lineTo(w * 0.6, len * 0.72);
  s.lineTo(w * 1.8, len * 0.8);
  s.lineTo(0, len);
  s.lineTo(-w * 1.8, len * 0.8);
  s.lineTo(-w * 0.6, len * 0.72);
  s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
  m.position.z = 0.002;
  return m;
}

let dialCache: THREE.Texture | null = null;
/** Ivory enamel dial: chapter rings, Roman numerals, minute track and a small hooded crest. */
function dialTexture(): THREE.Texture {
  if (dialCache) return dialCache;
  const t = paint(512, 512, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c * 0.8, 20, c, c, c);
    g.addColorStop(0, '#fbf3dc');
    g.addColorStop(0.75, '#efdfb6');
    g.addColorStop(1, '#c9a86a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.94, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (const r of [0.86, 0.6]) {
      ctx.beginPath();
      ctx.arc(c, c, c * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Minute track.
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const major = i % 5 === 0;
      const r0 = c * (major ? 0.8 : 0.84);
      ctx.lineWidth = major ? 5 : 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0);
      ctx.lineTo(c + Math.sin(a) * c * 0.9, c - Math.cos(a) * c * 0.9);
      ctx.stroke();
    }
    // Roman numerals, upright like a real dial.
    const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    ctx.fillStyle = '#2a170a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.save();
      ctx.translate(c + Math.sin(a) * c * 0.7, c - Math.cos(a) * c * 0.7);
      ctx.rotate(a);
      ctx.font = `700 ${i % 3 === 0 ? 50 : 40}px "IM Fell English SC", serif`;
      ctx.fillText(R[i], 0, 0);
      ctx.restore();
    }
    // Hooded crest in the centre.
    ctx.fillStyle = '#7a1a12';
    ctx.beginPath();
    ctx.moveTo(c, c - 70);
    ctx.bezierCurveTo(c + 46, c - 40, c + 50, c + 30, c + 36, c + 52);
    ctx.lineTo(c - 36, c + 52);
    ctx.bezierCurveTo(c - 50, c + 30, c - 46, c - 40, c, c - 70);
    ctx.fill();
    ctx.fillStyle = '#1a0b05';
    ctx.beginPath();
    ctx.ellipse(c, c + 4, 20, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcf5a';
    for (const x of [-8, 8]) {
      ctx.beginPath();
      ctx.arc(c + x, c, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  dialCache = t;
  return t;
}
