import * as THREE from 'three';

export interface Pickable {
  object: THREE.Object3D;
  onHover?: (on: boolean) => void;
  onClick?: (hit: THREE.Intersection) => void;
  /** Lower = checked first when overlapping. */
  priority?: number;
  enabled?: () => boolean;
}

/** Pointer hover/click on 3D objects (mouse and touch). */
export class Picker {
  private items: Pickable[] = [];
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2(-9, -9);
  private hovered: Pickable | null = null;
  private downAt = new THREE.Vector2();
  private dirty = true;
  enabled = true;

  constructor(private cam: THREE.Camera, private dom: HTMLElement) {
    dom.addEventListener('pointermove', (e) => this.move(e));
    dom.addEventListener('pointerdown', (e) => {
      this.move(e);
      this.downAt.set(e.clientX, e.clientY);
    });
    dom.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 14) return;
      this.move(e);
      this.pick();
      const hit = this.hit();
      if (hit && this.enabled) hit.item.onClick?.(hit.hit);
    });
    dom.addEventListener('pointerleave', () => {
      this.ndc.set(-9, -9);
      this.dirty = true;
    });
  }

  private move(e: PointerEvent): void {
    this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.dirty = true;
  }

  add(p: Pickable): () => void {
    this.items.push(p);
    this.dirty = true;
    return () => this.remove(p);
  }

  remove(p: Pickable): void {
    this.items = this.items.filter((i) => i !== p);
    if (this.hovered === p) {
      p.onHover?.(false);
      this.hovered = null;
    }
  }

  clear(): void {
    if (this.hovered) this.hovered.onHover?.(false);
    this.hovered = null;
    this.items = [];
  }

  private hit(): { item: Pickable; hit: THREE.Intersection } | null {
    if (!this.enabled) return null;
    this.ray.setFromCamera(this.ndc, this.cam);
    let best: { item: Pickable; hit: THREE.Intersection } | null = null;
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      if (!it.object.visible) continue;
      const hits = this.ray.intersectObject(it.object, true);
      if (!hits.length) continue;
      const h = hits[0];
      if (
        !best ||
        (it.priority ?? 0) < (best.item.priority ?? 0) ||
        ((it.priority ?? 0) === (best.item.priority ?? 0) && h.distance < best.hit.distance)
      )
        best = { item: it, hit: h };
    }
    return best;
  }

  private pick(): void {
    const h = this.hit();
    const it = h?.item ?? null;
    if (it !== this.hovered) {
      this.hovered?.onHover?.(false);
      this.hovered = it;
      it?.onHover?.(true);
      this.dom.style.cursor = it ? 'pointer' : '';
    }
  }

  update(): void {
    // Re-pick each frame (the camera drifts with look-around, so hover can change without pointer moves).
    this.pick();
    this.dirty = false;
  }
}
