import { CARD_DEFS, type CardType } from '../../shared/cards';
import { crestHooded, EMBLEMS, INK, IVORY } from './emblems';
import { EMBLEMS2 } from './emblems2';

const ALL_EMBLEMS: Record<string, () => string> = { ...EMBLEMS, ...EMBLEMS2 };

export const CARD_W = 500;
export const CARD_H = 700;

function mix(hex: string, other: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

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

function cornerFlourish(): string {
  // One corner scroll, drawn for the top-left corner; mirrored for the others.
  const d =
    'M 40,98 C 40,66 52,48 74,42 C 84,40 96,44 98,54 C 99,62 92,68 85,64 C 80,61 82,54 87,54 M 40,98 C 46,90 54,88 60,92 M 98,40 C 90,46 88,54 92,60';
  const g = `<path d="${d}" fill="none" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/>
             <circle cx="40" cy="40" r="6" fill="url(#gold)" stroke="${INK}" stroke-width="1.5"/>`;
  return `
    <g>${g}</g>
    <g transform="translate(500,0) scale(-1,1)">${g}</g>
    <g transform="translate(0,700) scale(1,-1)">${g}</g>
    <g transform="translate(500,700) scale(-1,-1)">${g}</g>`;
}

function ribbon(): string {
  return `
    <g filter="url(#drop)">
      <path d="M 62,590 L 26,574 L 44,606 L 26,640 L 84,630 Z" fill="#b39a6c" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M 438,590 L 474,574 L 456,606 L 474,640 L 416,630 Z" fill="#b39a6c" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M 60,566 C 160,552 340,552 440,566 L 440,630 C 340,616 160,616 60,630 Z" fill="url(#ribbon)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 70,574 C 165,561 335,561 430,574" fill="none" stroke="#fff" stroke-width="3" opacity="0.5"/>
    </g>`;
}

function badge(kind: 'instant' | 'target'): string {
  const cx = 430;
  const cy = 74;
  const icon =
    kind === 'instant'
      ? `<path d="M ${cx + 4},${cy - 21} L ${cx - 12},${cy + 3} L ${cx - 1},${cy + 3} L ${cx - 5},${cy + 21} L ${cx + 13},${cy - 4} L ${cx + 2},${cy - 4} Z" fill="${IVORY}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
      : `<circle cx="${cx}" cy="${cy}" r="17" fill="${IVORY}" stroke="${INK}" stroke-width="3.5"/>
         <circle cx="${cx}" cy="${cy}" r="10.5" fill="#b3261e" stroke="${INK}" stroke-width="2.5"/>
         <circle cx="${cx}" cy="${cy}" r="4" fill="${IVORY}" stroke="${INK}" stroke-width="2"/>
         <path d="M ${cx + 2},${cy - 2} L ${cx + 22},${cy - 22}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
         <path d="M ${cx + 16},${cy - 22} L ${cx + 24},${cy - 26} L ${cx + 22},${cy - 16}" fill="${IVORY}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  return `<g filter="url(#drop)">
      <circle cx="${cx}" cy="${cy}" r="32" fill="url(#gold)" stroke="${INK}" stroke-width="4"/>
      <circle cx="${cx}" cy="${cy}" r="25" fill="#3a2410" stroke="#f3d98b" stroke-width="2"/>
      ${icon}
    </g>`;
}

export function cardFaceSVG(type: CardType): string {
  const d = CARD_DEFS[type];
  const badgeSvg = d.instant ? badge('instant') : d.targeted ? badge('target') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
    ${defs(d.color, d.shade)}
    <rect x="0" y="0" width="500" height="700" rx="38" fill="url(#parch)"/>
    <rect x="0" y="0" width="500" height="700" rx="38" fill="#fff" filter="url(#stain)" opacity="0.9"/>
    <rect x="0" y="0" width="500" height="700" rx="38" fill="#fff" filter="url(#grain)"/>
    <g clip-path="url(#inner)">
      <rect x="16" y="16" width="468" height="668" fill="url(#field)"/>
      <rect x="16" y="16" width="468" height="668" fill="url(#damask)"/>
      <rect x="16" y="16" width="468" height="668" fill="#fff" filter="url(#grain)" opacity="0.6"/>
      <rect x="16" y="16" width="468" height="668" fill="url(#vig)"/>
    </g>
    <rect x="16" y="16" width="468" height="668" rx="26" fill="none" stroke="${INK}" stroke-width="4"/>
    <rect x="30" y="30" width="440" height="640" rx="18" fill="none" stroke="url(#gold)" stroke-width="5"/>
    <rect x="40" y="40" width="420" height="620" rx="12" fill="none" stroke="url(#gold)" stroke-width="1.6" opacity="0.8"/>
    ${cornerFlourish()}
    <g filter="url(#drop)">${ALL_EMBLEMS[type]()}</g>
    ${ribbon()}
    ${badgeSvg}
  </svg>`;
}

export function cardBackSVG(): string {
  const color = '#5a1016';
  const shade = '#16040a';
  const lattice = `<pattern id="lattice" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="40" height="40" fill="none"/>
      <path d="M 0,0 L 40,0 M 0,0 L 0,40" stroke="#e6c56a" stroke-width="1.6" opacity="0.22"/>
      <circle cx="20" cy="20" r="2.2" fill="#e6c56a" opacity="0.28"/>
    </pattern>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
    ${defs(color, shade).replace('</defs>', lattice + '</defs>')}
    <rect x="0" y="0" width="500" height="700" rx="38" fill="url(#parch)"/>
    <rect x="0" y="0" width="500" height="700" rx="38" fill="#fff" filter="url(#stain)" opacity="0.9"/>
    <g clip-path="url(#inner)">
      <rect x="16" y="16" width="468" height="668" fill="url(#field)"/>
      <rect x="16" y="16" width="468" height="668" fill="url(#lattice)"/>
      <rect x="16" y="16" width="468" height="668" fill="#fff" filter="url(#grain)" opacity="0.6"/>
      <rect x="16" y="16" width="468" height="668" fill="url(#vig)"/>
    </g>
    <rect x="16" y="16" width="468" height="668" rx="26" fill="none" stroke="${INK}" stroke-width="4"/>
    <rect x="30" y="30" width="440" height="640" rx="18" fill="none" stroke="url(#gold)" stroke-width="5"/>
    <rect x="40" y="40" width="420" height="620" rx="12" fill="none" stroke="url(#gold)" stroke-width="1.6" opacity="0.8"/>
    ${cornerFlourish()}
    <g filter="url(#drop)">
      <circle cx="250" cy="340" r="150" fill="#1a0507" stroke="url(#gold)" stroke-width="10"/>
      <circle cx="250" cy="340" r="134" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
      ${Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return `<circle cx="${(250 + Math.cos(a) * 142).toFixed(1)}" cy="${(340 + Math.sin(a) * 142).toFixed(1)}" r="3" fill="#e6c56a"/>`;
      }).join('')}
      <g transform="translate(250,350) rotate(-35) translate(-250,-350)"><path d="M 244,470 L 246,250 L 250,222 L 254,250 L 256,470 Z" fill="#c9a24c"/><rect x="226" y="466" width="48" height="10" rx="4" fill="#c9a24c"/></g>
      <g transform="translate(250,350) rotate(35) translate(-250,-350)"><path d="M 244,470 L 246,250 L 250,222 L 254,250 L 256,470 Z" fill="#c9a24c"/><rect x="226" y="466" width="48" height="10" rx="4" fill="#c9a24c"/></g>
      <g transform="translate(250,340) scale(0.78) translate(-250,-330)">${crestHooded()}</g>
    </g>
    <path d="M 120,116 C 190,100 310,100 380,116 L 380,152 C 310,138 190,138 120,152 Z" fill="#1a0507" stroke="url(#gold)" stroke-width="3"/>
    <path d="M 120,548 C 190,562 310,562 380,548 L 380,584 C 310,598 190,598 120,584 Z" fill="#1a0507" stroke="url(#gold)" stroke-width="3"/>
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

const FONT_TITLE = '"Grenze Gotisch", "IM Fell English SC", serif';

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, font: string): number {
  let s = size;
  ctx.font = `${s}px ${font}`;
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 1;
    ctx.font = `${s}px ${font}`;
  }
  return s;
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
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (type === 'back') {
    ctx.fillStyle = '#e6c56a';
    fitText(ctx, 'The Hooded Hand', 230, 30, FONT_TITLE);
    ctx.fillText('The Hooded Hand', 250, 128);
    ctx.font = `22px ${FONT_TITLE}`;
    ctx.fillText('Trust no draw', 250, 570);
  } else {
    const name = CARD_DEFS[type].name;
    fitText(ctx, name, 330, 46, FONT_TITLE);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(name, 250, 597);
    ctx.fillStyle = '#2a140a';
    ctx.fillText(name, 250, 595);
  }
  ctx.restore();
  return c;
}
