import * as THREE from 'three';
import { Noise2 } from '../gfx/noise';

let clothNormal: THREE.Texture | null = null;
function clothNormalMap(): THREE.Texture {
  if (clothNormal) return clothNormal;
  const size = 256;
  const n = new Noise2(77);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.25;
      const folds = n.fbm(x / 64, y / 18, 3, 4, 14);
      h[y * size + x] = weave * 0.3 + folds;
    }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const nx = -dx * 3;
      const ny = -dy * 3;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  clothNormal = t;
  return t;
}

export interface FigureOpts {
  cloak: string;
  eyes?: string;
  seated?: boolean;
  scale?: number;
}

/**
 * A hooded figure: lathe-turned robe and hood, a void where the face should be and two ember eyes.
 * Rig: root > body (breathes) > head (looks around) / armL / armR (reach for cards).
 */
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

  constructor(o: FigureOpts) {
    const s = o.scale ?? 1;
    this.cloakMat = new THREE.MeshStandardMaterial({
      color: o.cloak,
      roughness: 0.92,
      normalMap: clothNormalMap(),
      normalScale: new THREE.Vector2(0.7, 0.7),
      side: THREE.DoubleSide,
    });
    const inner = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.cloak).multiplyScalar(0.35), roughness: 1, side: THREE.DoubleSide });
    const glove = new THREE.MeshStandardMaterial({ color: '#1c1410', roughness: 0.6 });
    this.eyeColor = new THREE.Color(o.eyes ?? '#ffb347');
    this.eyesMat = new THREE.MeshBasicMaterial({ color: this.eyeColor.clone().multiplyScalar(6) });

    const seated = o.seated ?? true;
    // Torso / robe profile (y up from seat or ground).
    const torsoPts = seated
      ? [
          [0.0, -0.02],
          [0.3, 0.0],
          [0.31, 0.1],
          [0.27, 0.32],
          [0.25, 0.5],
          [0.27, 0.62],
          [0.24, 0.7],
          [0.12, 0.76],
          [0.0, 0.77],
        ]
      : [
          [0.0, 0.0],
          [0.42, 0.0],
          [0.36, 0.4],
          [0.27, 0.9],
          [0.26, 1.15],
          [0.28, 1.3],
          [0.24, 1.38],
          [0.12, 1.44],
          [0.0, 1.45],
        ];
    const torso = new THREE.Mesh(
      new THREE.LatheGeometry(torsoPts.map(([r, y]) => new THREE.Vector2(r, y)), 28),
      this.cloakMat
    );
    torso.castShadow = true;
    torso.scale.set(1, 1, 0.78);
    this.body.add(torso);
    const neckY = seated ? 0.74 : 1.42;

    // Mantle over the shoulders.
    const mantle = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0.0, 0.2],
          [0.16, 0.18],
          [0.3, 0.06],
          [0.36, -0.08],
          [0.35, -0.16],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        28
      ),
      this.cloakMat
    );
    mantle.position.y = neckY - 0.08;
    mantle.scale.set(1, 1, 0.8);
    mantle.castShadow = true;
    this.body.add(mantle);

    // Hood: lathe with an opening at the front (+z).
    const hoodProfile = [
      [0.15, -0.06],
      [0.19, 0.04],
      [0.205, 0.14],
      [0.19, 0.24],
      [0.15, 0.32],
      [0.08, 0.39],
      [0.015, 0.43],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const gap = 1.25;
    const hood = new THREE.Mesh(new THREE.LatheGeometry(hoodProfile, 30, gap / 2, Math.PI * 2 - gap), this.cloakMat);
    hood.castShadow = true;
    // Bend the hood tip backwards slightly for a soft, draped silhouette.
    const pos = hood.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setZ(i, pos.getZ(i) - Math.max(0, y - 0.2) * 0.35);
    }
    hood.geometry.computeVertexNormals();
    this.head.add(hood);
    // Inner hood lining (darker) and the void.
    const lining = new THREE.Mesh(new THREE.LatheGeometry(hoodProfile.map((v) => new THREE.Vector2(v.x * 0.94, v.y)), 30, gap / 2, Math.PI * 2 - gap), inner);
    lining.geometry.attributes.position = hood.geometry.attributes.position.clone();
    lining.scale.setScalar(0.96);
    this.head.add(lining);
    const voidMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshBasicMaterial({ color: '#020101' }));
    voidMesh.position.set(0, 0.15, -0.015);
    voidMesh.scale.set(1, 1.15, 1);
    this.head.add(voidMesh);
    // Eyes.
    const eyeGeo = new THREE.SphereGeometry(0.013, 10, 6);
    eyeGeo.scale(1.5, 0.75, 0.6);
    for (const x of [-0.048, 0.048]) {
      const e = new THREE.Mesh(eyeGeo, this.eyesMat);
      e.position.set(x, 0.155, 0.13);
      e.rotation.z = x < 0 ? -0.22 : 0.22;
      this.eyes.push(e);
      this.head.add(e);
    }
    this.head.position.y = neckY - 0.03;
    this.body.add(this.head);

    // Arms (sleeves) with gloved hands.
    const sleeveGeo = new THREE.CylinderGeometry(0.075, 0.1, 0.46, 14, 1, true);
    sleeveGeo.translate(0, -0.23, 0);
    const forearmGeo = new THREE.CylinderGeometry(0.065, 0.085, 0.36, 14, 1, true);
    forearmGeo.translate(0, -0.18, 0);
    const handGeo = new THREE.SphereGeometry(0.055, 14, 10);
    handGeo.scale(1, 0.8, 1.35);
    const mkArm = (arm: THREE.Group, hand: THREE.Object3D, side: number) => {
      arm.position.set(side * 0.27, neckY - 0.14, 0);
      const upper = new THREE.Mesh(sleeveGeo, this.cloakMat);
      upper.castShadow = true;
      arm.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.44;
      arm.add(elbow);
      const fore = new THREE.Mesh(forearmGeo, this.cloakMat);
      fore.castShadow = true;
      elbow.add(fore);
      const h = new THREE.Mesh(handGeo, glove);
      h.position.y = -0.38;
      h.castShadow = true;
      elbow.add(h);
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

    this.root.add(this.body);
    this.root.scale.setScalar(s);
  }

  /** Reach the right arm forward (0..1) — used when playing/drawing a card. */
  setReach(k: number, side: 'R' | 'L' = 'R'): void {
    const arm = side === 'R' ? this.armR : this.armL;
    arm.rotation.x = -0.35 - k * 0.75;
    (arm.userData.elbow as THREE.Group).rotation.x = -1.35 + k * 0.85;
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
