import * as THREE from 'three';
import { CameraRig } from './core/cameraRig';
import { Gfx } from './core/gfx';
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
    this.gfx = new Gfx(this.root);
    this.rig = new CameraRig(this.gfx.camera);
    progress(0.08, 'Painting the cards');
    await preload3DFonts();
    this.cards = await buildCardTextures(this.gfx.renderer, (k) => progress(0.08 + k * 0.3, 'Painting the cards'));
    progress(0.4, 'Building the tavern');
    await nextFrame();
    this.tavern = new Tavern(this.cards.back);
    this.gfx.scene.add(this.tavern.group);
    progress(0.8, 'Warming the hearth');
    await nextFrame();
    // Compile shaders up front to avoid hitches later.
    this.rig.snap(this.tavern.stations.intro);
    this.rig.update(0);
    this.gfx.renderer.compile(this.gfx.scene, this.gfx.camera);
    progress(1, 'Ready');
    this.last = performance.now();
    this.gfx.renderer.setAnimationLoop((now) => this.frame(now));
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    tweens.update(dt);
    this.tavern.update(this.time, dt);
    this.screen?.update?.(this.time, dt);
    for (const f of this.extraUpdates) f(this.time, dt);
    this.rig.update(dt);
    this.gfx.render(dt, this.time);
  }

  setScreen(s: Screen | null): void {
    this.screen?.dispose?.();
    this.screen = s;
  }
}

export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export { THREE };
