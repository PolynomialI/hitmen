import * as THREE from 'three';
import { CARD_ORDER, type CardType } from '../../shared/cards';
import { renderCard } from '../art/cardArt';

export interface CardTexSet {
  faces: Record<CardType, THREE.Texture>;
  back: THREE.Texture;
  /** Image URLs for HTML previews (codex, hover panel). */
  urls: Record<CardType | 'back', string>;
}

let cache: CardTexSet | null = null;

/** Copy of a card canvas with the rim colour behind the rounded corners (no dark fringes when filtered). */
export function opaqueCard(c: HTMLCanvasElement): HTMLCanvasElement {
  const o = document.createElement('canvas');
  o.width = c.width;
  o.height = c.height;
  const ctx = o.getContext('2d')!;
  ctx.fillStyle = '#ece0c3';
  ctx.fillRect(0, 0, o.width, o.height);
  ctx.drawImage(c, 0, 0);
  return o;
}

export async function buildCardTextures(renderer: THREE.WebGLRenderer, onProgress?: (k: number) => void): Promise<CardTexSet> {
  if (cache) return cache;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const faces = {} as Record<CardType, THREE.Texture>;
  const urls = {} as Record<CardType | 'back', string>;
  const all: Array<CardType | 'back'> = [...CARD_ORDER, 'back'];
  let i = 0;
  let back!: THREE.Texture;
  for (const t of all) {
    const c = await renderCard(t, 512);
    const tex = new THREE.CanvasTexture(opaqueCard(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    urls[t] = c.toDataURL('image/webp', 0.92);
    if (t === 'back') back = tex;
    else faces[t] = tex;
    onProgress?.(++i / all.length);
  }
  cache = { faces, back, urls };
  return cache;
}
