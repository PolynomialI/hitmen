import * as THREE from 'three';
import { ease, tweens } from '../core/tween';
import type { Fx } from './fx';

export type XForm = { p: THREE.Vector3; q: THREE.Quaternion; s: number };

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

function bezier(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t;
  return out
    .copy(a)
    .multiplyScalar(u * u * u)
    .addScaledVector(b, 3 * u * u * t)
    .addScaledVector(c, 3 * u * t * t)
    .addScaledVector(d, t * t * t);
}

/**
 * Fly an object along a smooth cubic curve to a (possibly moving) target: it lifts off along `lift`, leans into the
 * travel, can spin about its long axis on the way (`spins` whole turns: start and end orientations unchanged) and
 * lands with the target's orientation (a face-down card turning face-up on the way reveals itself). Optional trail.
 */
export function flyCurve(
  obj: THREE.Object3D,
  to: () => XForm,
  dur: number,
  o: { lift?: number; spins?: number; roll?: number; ease?: (k: number) => number; trail?: { fx: Fx; color: THREE.ColorRepresentation; every?: number }; startLift?: number } = {}
): Promise<void> {
  const p0 = obj.position.clone();
  const q0 = obj.quaternion.clone();
  const s0 = obj.scale.x;
  const lift = o.lift ?? 0.15;
  const c1 = p0.clone().addScaledVector(UP, o.startLift ?? lift);
  let lastTrail = -1;
  const every = o.trail?.every ?? 0.06;
  const flipQ = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  return tweens.to(
    dur,
    (k, raw) => {
      const t = to();
      const c2 = t.p.clone().addScaledVector(UP, lift * 0.8);
      bezier(obj.position, p0, c1, c2, t.p, k);
      obj.quaternion.slerpQuaternions(q0, t.q, k);
      if (o.spins) obj.quaternion.multiply(flipQ.setFromAxisAngle(axis, o.spins * Math.PI * 2 * k));
      if (o.roll) obj.quaternion.multiply(flipQ.setFromAxisAngle(tmp.set(0, 0, 1), Math.sin(k * Math.PI) * o.roll));
      obj.scale.setScalar(s0 + (t.s - s0) * k);
      if (o.trail && raw - lastTrail > every / dur && raw < 0.95) {
        lastTrail = raw;
        o.trail.fx.burst({ at: obj.position.clone(), count: 2, color: o.trail.color, intensity: 2.6, speed: 0.08, up: 0.2, life: 0.45, size: 0.018, gravity: 0.05, drag: 3 });
      }
    },
    { ease: o.ease ?? ease.inOutCubic }
  );
}

/** A small landing bounce: settle down onto the spot with a wobble. */
export function settle(obj: THREE.Object3D, amp = 0.012, dur = 0.22): Promise<void> {
  const y0 = obj.position.y;
  const q0 = obj.quaternion.clone();
  const wob = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0.4).normalize();
  return tweens.to(
    dur,
    (k) => {
      const d = Math.sin(k * Math.PI * 2) * (1 - k);
      obj.position.y = y0 + Math.max(0, d) * amp;
      obj.quaternion.copy(q0).multiply(wob.setFromAxisAngle(ax, d * 0.05));
    },
    { ease: ease.linear }
  );
}

/** Lift a held card up and out of its row before it travels (so it is clear which card leaves). */
export function liftOut(obj: THREE.Object3D, toward: THREE.Vector3, dur = 0.2, up = 0.11): Promise<void> {
  const p0 = obj.position.clone();
  const dir = toward.clone().sub(p0).setY(0).normalize();
  return tweens.to(dur, (k) => obj.position.copy(p0).addScaledVector(UP, up * k).addScaledVector(dir, 0.04 * k), { ease: ease.outCubic });
}

/** A glowing bolt that streaks along an arc from a to b (attacks, marks). Resolves on impact. */
export function streak(fx: Fx, glowTex: THREE.Texture, parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, dur = 0.42, arc = 0.35): Promise<void> {
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color.clone().multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  head.scale.setScalar(0.12);
  head.renderOrder = 31;
  parent.add(head);
  const c1 = a.clone().lerp(b, 0.25).addScaledVector(UP, arc);
  const c2 = a.clone().lerp(b, 0.75).addScaledVector(UP, arc * 0.7);
  let last = -1;
  return tweens
    .to(
      dur,
      (k, raw) => {
        bezier(head.position, a, c1, c2, b, k);
        head.scale.setScalar(0.1 + Math.sin(raw * Math.PI) * 0.06);
        if (raw - last > 0.04) {
          last = raw;
          fx.burst({ at: head.position.clone(), count: 3, color, intensity: 3.2, speed: 0.12, up: 0, life: 0.35, size: 0.03, gravity: 0, drag: 4 });
        }
      },
      { ease: ease.inQuad }
    )
    .then(() => {
      parent.remove(head);
      head.material.dispose();
    });
}
