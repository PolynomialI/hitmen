import { CARD_DEFS, type CardType } from '../../shared/cards';
import { bandColor, emblemHalo, frameBody, frameDefs, mix } from './cardFrame';
import { CARTOON, cartoonCrest, W } from './cartoon';

export const CARD_W = 500;
export const CARD_H = 700;


/**
 * Corner badge: a plain white disc over the top-right corner, spilling past the card's rounded edge, with an
 * orange-gold lightning bolt (playable at any time) or a red target and dart (aimed at a player).
 */
/** A corner badge's icon centred at (cx, cy): the bolt (playable any time) or the target (marks a player). */
function badgeIcon(kind: 'instant' | 'target', cx: number, cy: number): string {
  if (kind === 'instant')
    return `<path d="M ${cx + 12},${cy - 44} L ${cx - 26},${cy + 9} L ${cx - 2},${cy + 9} L ${cx - 14},${cy + 46} L ${cx + 28},${cy - 9} L ${cx + 4},${cy - 9} Z" fill="#f5a316"/>
      <path d="M ${cx + 12},${cy - 44} L ${cx - 26},${cy + 9} L ${cx - 2},${cy + 9} L ${cx + 2},${cy - 4} Z" fill="#fbc34a"/>`;
  const red = '#d6261a';
  const tx = cx - 6;
  const ty = cy + 6;
  return `<circle cx="${tx}" cy="${ty}" r="40" fill="${red}"/>
    <circle cx="${tx}" cy="${ty}" r="28" fill="#fbf9f4"/>
    <circle cx="${tx}" cy="${ty}" r="16" fill="${red}"/>
    <path d="M ${tx},${ty} L ${tx + 40},${ty - 40}" stroke="#5a1a0e" stroke-width="7" stroke-linecap="round"/>
    <path d="M ${tx + 34},${ty - 46} L ${tx + 52},${ty - 50} L ${tx + 46},${ty - 34} Z" fill="${red}"/>
    <path d="M ${tx + 28},${ty - 40} L ${tx + 46},${ty - 58} L ${tx + 40},${ty - 34} Z" fill="${red}" opacity="0.8"/>`;
}

/** Badges on a borderless white disc peering off the top-right corner; a card with both gets a pill (bolt, then target). */
function badges(kinds: Array<'instant' | 'target'>): string {
  if (!kinds.length) return '';
  if (kinds.length === 1) return `<g filter="url(#kdrop)"><circle cx="436" cy="64" r="64" fill="#fbf9f4"/>${badgeIcon(kinds[0], 436, 64)}</g>`;
  return `<g filter="url(#kdrop)"><rect x="252" y="0" width="300" height="128" rx="64" fill="#fbf9f4"/>${badgeIcon(kinds[0], 320, 64)}${badgeIcon(kinds[1], 436, 64)}</g>`;
}

export function cardFaceSVG(type: CardType): string {
  const d = CARD_DEFS[type];
  const D = mix(d.color, d.shade, 0.62);
  const frame = { color: d.color, shade: d.shade, inner: d.inner };
  const pal = { c: d.color, D, L: mix(d.color, '#ffffff', 0.5), B: bandColor(frame, 3) };
  // A card that both marks a player and can be played any time (Misdirection) shows both.
  const badgeSvg = badges([...(d.instant ? ['instant' as const] : []), ...(d.targeted ? ['target' as const] : [])]);
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
