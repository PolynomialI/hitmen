import * as THREE from 'three';
import type { SeatInfo } from '../../shared/types';
import type { App } from '../app';
import { addGlint, backGlint } from '../match/cardMesh';
import { profile } from '../ui/profile';
import { bannerSVG, buildCharm, buildSeat, feltCanvas, sleeveCanvas, svgCanvas } from './art';
import { item, type Mutation } from './catalog';

export function mutOf(id: string): Mutation {
  return (profile.equippedMut[id] as Mutation) ?? (profile.owned[id]?.[0] as Mutation) ?? 'basic';
}

/** What others see of you (passed into the match as your seat's look). */
export function lookFromProfile(): SeatInfo['look'] {
  const e = profile.equipped;
  return {
    sleeve: e.sleeve,
    impact: item(e.impact)?.style.fx ?? 'dust',
    charm: item(e.charm)?.style.model ?? 'none',
    seat: item(e.seat)?.style.model ?? 'oak',
    banner: e.banner,
  };
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let feltCache = new Map<string, THREE.Texture>();
export function playmatTexture(id: string): THREE.Texture {
  const key = id + ':' + mutOf(id);
  let t = feltCache.get(key);
  if (!t) {
    const it = item(id);
    t = tex(feltCanvas(it?.style ?? { base: '#1a4a2e', ring: '#d6aa50', print: 'arcs' }, mutOf(id)));
    feltCache.set(key, t);
  }
  return t;
}

export async function bannerTexture(id: string): Promise<THREE.Texture> {
  const it = item(id);
  const c = await svgCanvas(bannerSVG(it?.style ?? { field: '#d8c8a0', charge: 'none', accent: '#6a4a2a' }, mutOf(id)), 256, 512);
  return tex(c);
}

let glintClock = false;

/** Apply everything you have equipped to the shared world (deck backs, table felt, banners, display). */
export async function applyCosmetics(app: App): Promise<void> {
  const e = profile.equipped;
  // Sleeve: replace the shared back texture in place, so every card back updates.
  const sl = item(e.sleeve);
  // Legendary and contraband sleeves (and any prismatic one) shimmer in their accent colour.
  const shimmer = !!sl && (sl.rarity === 'legendary' || sl.rarity === 'contraband' || mutOf(e.sleeve) === 'prismatic');
  backGlint.strength.value = shimmer ? 1.7 : 0;
  backGlint.color.value.set(sl?.style.accent ?? '#f6d270');
  if (!glintClock) {
    glintClock = true;
    app.onUpdate((_t, dt) => (backGlint.time.value += dt));
  }
  if (sl) {
    const c = await sleeveCanvas(sl.style, mutOf(e.sleeve), 512);
    app.cards.back.image = c;
    app.cards.back.needsUpdate = true;
    app.cards.urls.back = c.toDataURL('image/webp', 0.9);
  }
  // Playmat on the card table.
  const felt = app.tavern.mats.felt;
  felt.map = playmatTexture(e.playmat);
  felt.needsUpdate = true;
  // Banners in the den.
  const bt = await bannerTexture(e.banner);
  for (const b of app.tavern.stageBanners) {
    const m = b.material as THREE.MeshStandardMaterial;
    m.map = bt;
    m.needsUpdate = true;
  }
  updateDisplay(app, bt);
}

export function updateDisplay(app: App, bannerTex?: THREE.Texture): void {
  const D = app.tavern.display;
  const e = profile.equipped;
  if (D.felt) {
    const m = D.felt.material as THREE.MeshStandardMaterial;
    m.map = playmatTexture(e.playmat);
    m.needsUpdate = true;
  }
  if (D.card) {
    const m = D.card.material as THREE.MeshStandardMaterial;
    addGlint(m);
    m.map = app.cards.back;
    m.needsUpdate = true;
  }
  D.charm.clear();
  const model = item(e.charm)?.style.model ?? 'none';
  if (model !== 'none') {
    const c = buildCharm(model, app.tavern.mats);
    c.scale.setScalar(1.6);
    D.charm.add(c);
    D.charm.userData.spin = c.userData.spin;
  } else D.charm.userData.spin = undefined;
  D.seat.clear();
  D.seat.add(buildSeat(item(e.seat)?.style.model ?? 'oak', app.tavern.mats));
  if (bannerTex && D.banner) {
    const m = D.banner.material as THREE.MeshStandardMaterial;
    m.map = bannerTex;
    m.needsUpdate = true;
  }
}
