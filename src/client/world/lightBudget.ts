import * as THREE from 'three';

type Local = THREE.PointLight | THREE.SpotLight;

interface Entry {
  light: Local;
  /** How much of the light is let through (fades between 0 and 1 as lights swap in and out). */
  w: number;
  score: number;
  saved: number;
  /** Importance at full strength (bright, far-reaching lights win ties). */
  weight: number;
}

const FADE_S = 0.45;
const _cam = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _focus = new THREE.Vector3();
const _pos = new THREE.Vector3();

/**
 * Every lit shader pays for every live light on every pixel, and the tavern has a light for each corner of the room.
 * This keeps a fixed number of point and spot lights live: the ones that matter for what the camera is looking at.
 * Lights leaving the set fade out before the newcomer fades in, and the live counts never change, so swapping lights
 * never recompiles a shader (three.js keys its programs on the number of lights).
 *
 * Owners keep setting their lights as before (flicker, dimming): the budget scales intensities only for the draw
 * (`apply`/`restore` around the render).
 */
export class LightBudget {
  private points: Entry[];
  private spots: Entry[];
  private first = true;
  private lastCam = new THREE.Vector3(1e9, 0, 0);

  constructor(
    lights: Local[],
    private readonly pointSlots: number,
    private readonly spotSlots: number
  ) {
    const entry = (light: Local): Entry => ({ light, w: 0, score: 0, saved: 0, weight: 1 + Math.log10(1 + light.intensity) });
    this.points = lights.filter((l): l is THREE.PointLight => (l as THREE.PointLight).isPointLight).map(entry);
    this.spots = lights.filter((l): l is THREE.SpotLight => (l as THREE.SpotLight).isSpotLight).map(entry);
  }

  /** Pick the live lights for this frame (call before `apply`). */
  update(camera: THREE.Camera, dt: number): void {
    camera.getWorldPosition(_cam);
    camera.getWorldDirection(_fwd);
    _focus.copy(_cam).addScaledVector(_fwd, 3);
    // A camera cut (not a glide) swaps lights at once instead of fading.
    if (_cam.distanceTo(this.lastCam) > 1.2) this.first = true;
    this.lastCam.copy(_cam);
    const step = this.first ? 1 : Math.min(1, dt / FADE_S);
    this.pick(this.points, this.pointSlots, step);
    this.pick(this.spots, this.spotSlots, step);
    this.first = false;
  }

  /** Jump straight to the right lights (after a camera cut). */
  snap(): void {
    this.first = true;
  }

  private pick(list: Entry[], slots: number, step: number): void {
    if (!list.length) return;
    for (const e of list) {
      e.light.getWorldPosition(_pos);
      const range = e.light.distance > 0 ? e.light.distance : 12;
      // How much this light reaches what is looked at, and the space around the viewer.
      const atFocus = Math.max(0, 1 - _pos.distanceTo(_focus) / range);
      const atCam = Math.max(0, 1 - _pos.distanceTo(_cam) / range) * 0.6;
      e.score = Math.max(atFocus, atCam) * e.weight * (e.w > 0 ? 1.25 : 1); // live lights hold their place a while
    }
    const wanted = new Set([...list].sort((a, b) => b.score - a.score).slice(0, slots).filter((e) => e.score > 0));
    // Lights still lit keep their slot until faded out; newcomers take free slots, best first.
    const live = list.filter((e) => e.w > 0);
    const waiting = [...wanted].filter((e) => e.w === 0).sort((a, b) => b.score - a.score);
    const occupants = new Set(live.slice(0, slots));
    for (const e of waiting) if (occupants.size < slots) occupants.add(e);
    // Keep the live count fixed: pad with unlit lights (they draw nothing).
    for (const e of list) if (occupants.size < slots) occupants.add(e);
    for (const e of list) {
      const on = occupants.has(e);
      const target = on && wanted.has(e) ? 1 : 0;
      e.w = on ? (target > e.w ? Math.min(1, e.w + step) : Math.max(0, e.w - step)) : 0;
      e.light.visible = on;
    }
  }

  /** Scale intensities by the fade weights for the draw. */
  apply(): void {
    for (const e of this.points) if (e.light.visible) (e.saved = e.light.intensity), (e.light.intensity *= e.w);
    for (const e of this.spots) if (e.light.visible) (e.saved = e.light.intensity), (e.light.intensity *= e.w);
  }

  /** Give the owners their intensities back. */
  restore(): void {
    for (const e of this.points) if (e.light.visible) e.light.intensity = e.saved;
    for (const e of this.spots) if (e.light.visible) e.light.intensity = e.saved;
  }

  /** Live lights, for tests. */
  get live(): Local[] {
    return [...this.points, ...this.spots].filter((e) => e.light.visible && e.w > 0).map((e) => e.light);
  }
}
