import * as THREE from 'three';
import type { Station } from '../world/tavern';
import { clamp, damp, ease, tweens } from './tween';

/**
 * Camera that sits at a "station" and gently looks around following the pointer (immersive menus),
 * with smooth glides between stations and optional shake.
 */
export class CameraRig {
  readonly cam: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private baseFov = 48;
  private look: [number, number, number?] = [0.1, 0.05];
  /** Pointer in -1..1 (x right, y up). */
  pointer = new THREE.Vector2();
  private yaw = 0;
  private pitch = 0;
  /** Multiplier for look-around (0 disables, e.g. during cinematics). */
  lookScale = 1;
  /** Extra offsets applied by cinematics (world space). */
  readonly offset = new THREE.Vector3();
  readonly targetOffset = new THREE.Vector3();
  private shakeAmp = 0;
  private time = 0;
  fovKick = 0;
  /** Idle breathing sway amount. */
  sway = 1;

  constructor(cam: THREE.PerspectiveCamera) {
    this.cam = cam;
    addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    });
  }

  snap(s: Station): void {
    this.pos.copy(s.pos);
    this.target.copy(s.target);
    this.look = s.look;
    this.baseFov = s.fov ?? 48;
  }

  /** Glide to a station along a gentle arc. */
  async glide(s: Station, dur = 1.6, arc = 0.35): Promise<void> {
    const p0 = this.pos.clone();
    const t0 = this.target.clone();
    const f0 = this.baseFov;
    const lift = new THREE.Vector3(0, arc, 0);
    await tweens.to(
      dur,
      (k) => {
        this.pos.lerpVectors(p0, s.pos, k).addScaledVector(lift, Math.sin(k * Math.PI));
        this.target.lerpVectors(t0, s.target, k);
        this.baseFov = f0 + ((s.fov ?? 48) - f0) * k;
      },
      { ease: ease.inOutCubic }
    );
    this.look = s.look;
  }

  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  getTarget(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.target);
  }

  update(dt: number): void {
    this.time += dt;
    const px = clamp(this.pointer.x, -1, 1);
    const py = clamp(this.pointer.y, -1, 1);
    // Soft response curve: more sensitive near the edges.
    const ex = Math.sign(px) * Math.pow(Math.abs(px), 1.35);
    const ey = Math.sign(py) * Math.pow(Math.abs(py), 1.35);
    this.yaw = damp(this.yaw, -ex * this.look[0] * this.lookScale, 3.2, dt);
    const pitchRange = ey < 0 ? (this.look[2] ?? this.look[1]) : this.look[1];
    this.pitch = damp(this.pitch, ey * pitchRange * this.lookScale, 3.2, dt);
    const swayX = Math.sin(this.time * 0.5) * 0.004 * this.sway;
    const swayY = Math.sin(this.time * 0.7 + 1) * 0.003 * this.sway;

    const p = this.cam.position.copy(this.pos).add(this.offset);
    const dir = new THREE.Vector3().subVectors(this.target.clone().add(this.targetOffset), p);
    const dist = dir.length();
    dir.normalize();
    // Apply yaw/pitch around the camera.
    const up = new THREE.Vector3(0, 1, 0);
    dir.applyAxisAngle(up, this.yaw + swayX);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    dir.applyAxisAngle(right, this.pitch + swayY);
    const look = p.clone().addScaledVector(dir, dist);
    if (this.shakeAmp > 0.0001) {
      const s = this.shakeAmp;
      p.x += (Math.random() - 0.5) * s;
      p.y += (Math.random() - 0.5) * s;
      look.x += (Math.random() - 0.5) * s * 0.5;
      this.shakeAmp = damp(this.shakeAmp, 0, 7, dt);
    }
    this.cam.lookAt(look);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(this.cam.fov - fov) > 0.01) {
      // Respect portrait adjustment done by Gfx.resize: only override in landscape.
      if (this.cam.aspect >= 1.25) {
        this.cam.fov = fov;
        this.cam.updateProjectionMatrix();
      }
    }
  }
}
