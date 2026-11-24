import { CARD_DEFS, type CardType } from '../../shared/cards';
import { crestHooded, EMBLEMS, INK, IVORY } from './emblems';
import { emblemHalo, frameBody, frameDefs, frameFinish, mix } from './cardFrame';
import { EMBLEMS2 } from './emblems2';

const ALL_EMBLEMS: Record<string, () => string> = { ...EMBLEMS, ...EMBLEMS2 };

export const CARD_W = 500;
export const CARD_H = 700;


const FLEUR =
  'M 0,-11 C 3,-7 4,-3 2,1 C 5,-1 9,-1 10,3 C 8,4 5,4 3,3 L 2,6 L 5,6 L 5,8 L -5,8 L -5,6 L -2,6 L -3,3 C -5,4 -8,4 -10,3 C -9,-1 -5,-1 -2,1 C -4,-3 -3,-7 0,-11 Z';

function defs(color: string, shade: string): string {
  const light = mix(color, '#ffffff', 0.22);
  return `<defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbe9ae"/><stop offset="0.35" stop-color="#d9a842"/>
      <stop offset="0.6" stop-color="#8c5c14"/><stop offset="0.85" stop-color="#e8c46a"/><stop offset="1" stop-color="#a57322"/>
    </linearGradient>
    <radialGradient id="field" cx="50%" cy="44%" r="72%">
      <stop offset="0" stop-color="${light}"/><stop offset="0.5" stop-color="${color}"/><stop offset="1" stop-color="${shade}"/>
    </radialGradient>
    <linearGradient id="fieldsolid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${color}"/></linearGradient>
    <radialGradient id="vig" cx="50%" cy="46%" r="70%">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <pattern id="damask" width="56" height="64" patternUnits="userSpaceOnUse">
      <g fill="#ffffff" opacity="0.07">
        <path transform="translate(14,16) scale(1.1)" d="${FLEUR}"/>
        <path transform="translate(42,48) scale(1.1)" d="${FLEUR}"/>
      </g>
      <g fill="#000" opacity="0.08">
        <circle cx="42" cy="16" r="2"/><circle cx="14" cy="48" r="2"/>
      </g>
    </pattern>
    <radialGradient id="voidgrad" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="#2b0808"/><stop offset="1" stop-color="#050101"/>
    </radialGradient>
    <radialGradient id="orbgrad" cx="40%" cy="36%" r="70%">
      <stop offset="0" stop-color="#fbf4ff"/><stop offset="0.45" stop-color="${mix(color, '#ffffff', 0.55)}"/>
      <stop offset="1" stop-color="${mix(color, '#000000', 0.15)}"/>
    </radialGradient>
    <radialGradient id="irisgrad" cx="45%" cy="40%" r="60%">
      <stop offset="0" stop-color="#d7b8ff"/><stop offset="1" stop-color="#4a1880"/>
    </radialGradient>
    <radialGradient id="ballgrad" cx="38%" cy="34%" r="70%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="${IVORY}"/><stop offset="1" stop-color="#bfae8a"/>
    </radialGradient>
    <radialGradient id="doorlight" cx="50%" cy="60%" r="70%">
      <stop offset="0" stop-color="#fff6c4"/><stop offset="0.6" stop-color="#ffc861"/><stop offset="1" stop-color="#d4801f"/>
    </radialGradient>
    <radialGradient id="mirrorgrad" cx="38%" cy="30%" r="80%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#cfe6f2"/><stop offset="1" stop-color="#6f9fb8"/>
    </radialGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7ecd2"/><stop offset="0.55" stop-color="#e6d3ab"/><stop offset="1" stop-color="#c9b083"/>
    </linearGradient>
    <linearGradient id="parch" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3e7cb"/><stop offset="0.5" stop-color="#e7d6b1"/><stop offset="1" stop-color="#d6c095"/>
    </linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.16  0 0 0 0 0.08  0 0 0 0.55 -0.12"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="stain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0 0.05  0 0 0 1.4 -0.62"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="7"/>
      <feOffset dy="9" result="b"/>
      <feFlood flood-color="#000" flood-opacity="0.55"/>
      <feComposite in2="b" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="eyeglow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feFlood flood-color="#ff3b1f" flood-opacity="1"/><feComposite in2="b" operator="in" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="haloglow" x="-50%" y="-200%" width="200%" height="500%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="inner"><rect x="16" y="16" width="468" height="668" rx="26"/></clipPath>
  </defs>`;
}

function badge(kind: 'instant' | 'target', color: string, ink: string): string {
  const cx = 414;
  const cy = 88;
  const ic = mix(color, '#000000', 0.15);
  const icon =
    kind === 'instant'
      ? `<path d="M ${cx + 6},${cy - 25} L ${cx - 14},${cy + 4} L ${cx - 1},${cy + 4} L ${cx - 6},${cy + 25} L ${cx + 15},${cy - 5} L ${cx + 2},${cy - 5} Z" fill="${ic}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`
      : `<circle cx="${cx}" cy="${cy}" r="21" fill="none" stroke="${ic}" stroke-width="7"/>
         <circle cx="${cx}" cy="${cy}" r="9" fill="${ic}"/>
         <path d="M ${cx},${cy - 30} L ${cx},${cy - 18} M ${cx},${cy + 18} L ${cx},${cy + 30} M ${cx - 30},${cy} L ${cx - 18},${cy} M ${cx + 18},${cy} L ${cx + 30},${cy}" stroke="${ic}" stroke-width="6" stroke-linecap="round"/>`;
  return `<g filter="url(#kdrop)">
      <circle cx="${cx}" cy="${cy}" r="46" fill="url(#krim)" stroke="${mix(color, '#000000', 0.45)}" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="37" fill="#fffaf0" stroke="${mix(color, '#ffffff', 0.5)}" stroke-width="2"/>
      ${icon}
    </g>`;
}

export function cardFaceSVG(type: CardType): string {
  const d = CARD_DEFS[type];
  const ink = mix(d.shade, '#000000', 0.5);
  const badgeSvg = d.instant ? badge('instant', d.color, ink) : d.targeted ? badge('target', d.color, ink) : '';
  const frame = { color: d.color, shade: d.shade, ink };
  const emblem = ALL_EMBLEMS[type]().split(INK).join(ink);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
    ${defs(d.color, d.shade).replace('</defs>', frameDefs(frame) + '</defs>')}
    ${frameBody(frame)}
    ${emblemHalo(d.color)}
    <g filter="url(#kbold)"><g transform="translate(250,352) scale(1.05) translate(-250,-318)">${emblem}</g></g>
    ${badgeSvg}
    ${frameFinish(frame)}
  </svg>`;
}

export function cardBackSVG(): string {
  const color = '#7a1820';
  const shade = '#1a0508';
  const lattice = `<pattern id="lattice" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M 0,0 L 40,0 M 0,0 L 0,40" stroke="#f0d27a" stroke-width="1.8" opacity="0.26"/>
      <circle cx="20" cy="20" r="2.4" fill="#f0d27a" opacity="0.32"/>
    </pattern>`;
  const frame = { color, shade, patternId: 'lattice' };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
    ${defs(color, shade).replace('</defs>', lattice + frameDefs(frame) + '</defs>')}
    ${frameBody(frame)}
    ${emblemHalo('#d9a842', 250, 350, 190)}
    <g filter="url(#kdrop)">
      <circle cx="250" cy="350" r="132" fill="url(#krim)" stroke="#2a0a0c" stroke-width="4"/>
      <circle cx="250" cy="350" r="112" fill="${shade}" stroke="url(#gold)" stroke-width="6"/>
      ${Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return `<circle cx="${(250 + Math.cos(a) * 122).toFixed(1)}" cy="${(350 + Math.sin(a) * 122).toFixed(1)}" r="3.2" fill="#c9a24c"/>`;
      }).join('')}
      <g transform="translate(250,356) rotate(-35) translate(-250,-350) translate(0,10) scale(1) "><path d="M 245,440 L 246,262 L 250,240 L 254,262 L 255,440 Z" fill="#d9b25a" stroke="#2a0a0c" stroke-width="3"/></g>
      <g transform="translate(250,356) rotate(35) translate(-250,-350) translate(0,10)"><path d="M 245,440 L 246,262 L 250,240 L 254,262 L 255,440 Z" fill="#d9b25a" stroke="#2a0a0c" stroke-width="3"/></g>
      <g transform="translate(250,350) scale(0.8) translate(-250,-330)">${crestHooded('#f0d27a')}</g>
    </g>
    ${frameFinish(frame)}
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
