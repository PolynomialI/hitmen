import * as THREE from 'three';
import { CameraRig } from './core/cameraRig';
import { Gfx, TIERS } from './core/gfx';
import { settings } from './ui/settings';
import { tweens } from './core/tween';
import { buildCardTextures, type CardTexSet } from './cards/cardTextures';
import { loadFonts } from './fonts';
import { preload3DFonts } from './world/fonts3d';
import { Tavern } from './world/tavern';

export interface Screen {
  update?(t: number, dt: number): void;
  dispose?(): void;
}

export class App {
  gfx!: Gfx;
  rig!: CameraRig;
  tavern!: Tavern;
  cards!: CardTexSet;
  readonly ui: HTMLElement;
  readonly root: HTMLElement;
  screen: Screen | null = null;
  time = 0;
  private last = 0;
  private extraUpdates = new Set<(t: number, dt: number) => void>();
  /** Max frame step. Raised only by the ?dtcap= test parameter (slow headless renderers). */
  private dtCap = Number(new URLSearchParams(location.search).get('dtcap')) || 0.05;

  constructor(root: HTMLElement, ui: HTMLElement) {
    this.root = root;
    this.ui = ui;
  }

  onUpdate(fn: (t: number, dt: number) => void): () => void {
    this.extraUpdates.add(fn);
    return () => this.extraUpdates.delete(fn);
  }

  async init(progress: (k: number, label: string) => void): Promise<void> {
    progress(0.02, 'Lighting the candles');
    await loadFonts();
    this.gfx = new Gfx(this.root, settings);
    this.gfx.minInterval = settings.cap30 ? 1000 / 30 : 0;
    this.rig = new CameraRig(this.gfx.camera);
    progress(0.08, 'Painting the cards');
    await preload3DFonts();
    this.cards = await buildCardTextures(this.gfx.renderer, (k) => progress(0.08 + k * 0.3, 'Painting the cards'));
    progress(0.4, 'Building the tavern');
    await nextFrame();
    this.tavern = new Tavern(this.cards.back, this.gfx.quality);
    this.gfx.scene.add(this.tavern.group);
    this.gfx.shadowFocus = new THREE.Sphere(this.tavern.tableCenter.clone(), 2.8);
    this.gfx.beforeRender = (cam, dt) => this.tavern.beforeRender(cam, dt);
    this.gfx.afterRender = () => this.tavern.afterRender();
    this.gfx.onQualityChange = (q, full) => full && this.tavern.applyTier(TIERS[q]);
    progress(0.8, 'Warming the hearth');
    await nextFrame();
    // Compile shaders up front to avoid hitches later.
    this.rig.snap(this.tavern.stations.intro);
    this.rig.update(0);
    // With the live lights chosen, so the shaders compiled are the ones used.
    this.tavern.lightBudget.update(this.gfx.camera, 0);
    this.gfx.renderer.compile(this.gfx.scene, this.gfx.camera);
    progress(1, 'Ready');
    this.last = performance.now();
    this.gfx.renderer.setAnimationLoop((now) => this.frame(now));
  }

  private frame(now: number): void {
    // A frame-rate cap (settings): skip display refreshes until the interval is up (4 ms of slack so a 60 Hz screen
    // renders exactly every other refresh at 30).
    const cap = this.gfx.minInterval;
    if (cap && now - this.last < cap - 4) return;
    const dt = Math.min(this.dtCap, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    // Each stage is guarded so one bug cannot freeze the whole tavern.
    guard(() => tweens.update(dt));
    guard(() => this.tavern.update(this.time, dt));
    guard(() => this.screen?.update?.(this.time, dt));
    for (const f of this.extraUpdates) guard(() => f(this.time, dt));
    guard(() => this.rig.update(dt));
    this.gfx.render(dt, this.time);
  }

  setScreen(s: Screen | null): void {
    this.screen?.dispose?.();
    this.screen = s;
  }
}

let lastErr = 0;
function guard(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    const now = performance.now();
    if (now - lastErr > 2000) console.error(e);
    lastErr = now;
  }
}

export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export { THREE };
