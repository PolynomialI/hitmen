import { CARD_DEFS, type CardType } from '../../shared/cards';
import { emblemHalo, frameBody, frameDefs, mix } from './cardFrame';
import { CARTOON, cartoonCrest, W } from './cartoon';

export const CARD_W = 500;
export const CARD_H = 700;


function badge(kind: 'instant' | 'target', color: string, D: string): string {
  const cx = 412;
  const cy = 90;
  const icon =
    kind === 'instant'
      ? // Playable at any time: an orange-gold lightning bolt.
        `<path d="M ${cx + 8},${cy - 30} L ${cx - 17},${cy + 6} L ${cx - 1},${cy + 6} L ${cx - 9},${cy + 31} L ${cx + 18},${cy - 6} L ${cx + 2},${cy - 6} Z" fill="#f7a81e" stroke="#e0601a" stroke-width="5" stroke-linejoin="round"/>`
      : `<circle cx="${cx}" cy="${cy}" r="20" fill="none" stroke="${color}" stroke-width="8"/>
         <circle cx="${cx}" cy="${cy}" r="7" fill="${color}"/>
         <path d="M ${cx},${cy - 31} L ${cx},${cy - 19} M ${cx},${cy + 19} L ${cx},${cy + 31} M ${cx - 31},${cy} L ${cx - 19},${cy} M ${cx + 19},${cy} L ${cx + 31},${cy}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
  return `<g filter="url(#kdrop)">
      <circle cx="${cx}" cy="${cy}" r="44" fill="${W}"/>
      <circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="${D}" stroke-width="4" opacity="0.35"/>
      ${icon}
    </g>`;
}

export function cardFaceSVG(type: CardType): string {
  const d = CARD_DEFS[type];
  const D = mix(d.color, d.shade, 0.62);
  const pal = { c: d.color, D, L: mix(d.color, '#ffffff', 0.5) };
  const badgeSvg = d.instant ? badge('instant', mix(d.color, d.shade, 0.25), D) : d.targeted ? badge('target', mix(d.color, d.shade, 0.25), D) : '';
  const frame = { color: d.color, shade: d.shade };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
    <defs>${frameDefs(frame)}</defs>
    ${frameBody(frame)}
    ${emblemHalo(d.color, 250, 350, 200)}
    <g filter="url(#kicon)"><g transform="translate(250,350) scale(1.13) translate(-250,-350)">${CARTOON[type](pal)}</g></g>
    ${badgeSvg}
  </svg>`;
}

export function cardBackSVG(): string {
  const color = '#8a1c26';
  const shade = '#2a060c';
  const frame = { color, shade, patternId: 'lattice' };
  const lattice = `<pattern id="lattice" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect x="18" y="18" width="8" height="8" rx="2" fill="#f0c860" opacity="0.35"/>
    </pattern>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
    <defs>${lattice}${frameDefs(frame)}</defs>
    ${frameBody(frame)}
    <g filter="url(#kicon)">
      <circle cx="250" cy="350" r="158" fill="${W}"/>
      <circle cx="250" cy="350" r="136" fill="#5a0f18"/>
      <g transform="translate(250,372) scale(0.66)">${cartoonCrest('#f0c860', '#1a0508')}</g>
    </g>
  </svg>`;
}

/** Emblem helpers compose attribute strings; keep the last value when an attribute repeats in a tag. */
export function dedupeAttrs(svg: string): string {
  return svg.replace(/<([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")+)\s*(\/?)>/g, (_m, tag: string, attrs: string, close: string) => {
    const map = new Map<string, string>();
    for (const a of attrs.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
      map.delete(a[1]);
      map.set(a[1], a[2]);
    }
    const out = [...map].map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${out}${close ? '/' : ''}>`;
  });
}

// ------------------------------------------------------------------ rasterising

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/** Render one card face (or the back) to a canvas at the given pixel width. */
export async function renderCard(type: CardType | 'back', width = 512): Promise<HTMLCanvasElement> {
  const scale = width / CARD_W;
  const c = document.createElement('canvas');
  c.width = Math.round(CARD_W * scale);
  c.height = Math.round(CARD_H * scale);
  const ctx = c.getContext('2d')!;
  const img = await svgToImage(dedupeAttrs(type === 'back' ? cardBackSVG() : cardFaceSVG(type)));
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
