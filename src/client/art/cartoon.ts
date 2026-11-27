// Flat cartoon icons for every card: chunky silhouettes in warm white with one soft grey shade, small
// details in a darker tint of the card's colour, no outlines and no fine linework. 500x700 card space,
// centred near (250, 350), roughly 300 units across.

import type { CardType } from '../../shared/cards';
import { mix } from './cardFrame';

export const W = '#fbf9f4';
export const G = '#d8d1c4';

export interface Pal {
  /** Card colour. */
  c: string;
  /** Dark detail tint of the card colour. */
  D: string;
  /** Light tint of the card colour. */
  L: string;
}

let uid = 0;
/** A silhouette in white with the part inside `split` shaded grey. */
function solid(d: string, split = 'M 256,0 L 500,0 L 500,700 L 256,700 Z', main = W, shade = G): string {
  const id = `s${uid++}`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${main}"/><path d="${split}" fill="${shade}" clip-path="url(#${id})"/>`;
}

const RIGHT = (x: number) => `M ${x},0 L 500,0 L 500,700 L ${x},700 Z`;
const BELOW = (y: number) => `M 0,${y} L 500,${y} L 500,700 L 0,700 Z`;

function star4(x: number, y: number, s: number, fill = W): string {
  const k = s * 0.22;
  return `<path d="M ${x},${y - s} Q ${x + k},${y - k} ${x + s},${y} Q ${x + k},${y + k} ${x},${y + s} Q ${x - k},${y + k} ${x - s},${y} Q ${x - k},${y - k} ${x},${y - s} Z" fill="${fill}"/>`;
}

/** An arc of a circle drawn as a thick stroke ending in an arrowhead (angles in degrees, SVG orientation). */
function arcArrow(cx: number, cy: number, r: number, a0: number, a1: number, width: number, fill = W): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const p = (a: number) => [cx + Math.cos(rad(a)) * r, cy + Math.sin(rad(a)) * r];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  const dir = a1 > a0 ? 1 : -1;
  const tx = -Math.sin(rad(a1)) * dir;
  const ty = Math.cos(rad(a1)) * dir;
  const nx = -ty;
  const ny = tx;
  const hw = width * 1.05;
  const tip = [x1 + tx * width * 1.15, y1 + ty * width * 1.15];
  const b0 = [x1 - tx * 4 + nx * hw, y1 - ty * 4 + ny * hw];
  const b1 = [x1 - tx * 4 - nx * hw, y1 - ty * 4 - ny * hw];
  const f = (n: number) => n.toFixed(1);
  return `<path d="M ${f(x0)},${f(y0)} A ${r},${r} 0 ${large} ${sweep} ${f(x1)},${f(y1)}" fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round"/>
    <path d="M ${f(tip[0])},${f(tip[1])} L ${f(b0[0])},${f(b0[1])} L ${f(b1[0])},${f(b1[1])} Z" fill="${fill}" stroke="${fill}" stroke-width="10" stroke-linejoin="round"/>`;
}

// ------------------------------------------------------------------------------------------- icons

function hand(_p: Pal): string {
  // The Hooded Hand: a wide-brimmed hat with a dented crown, white slanted eyes in the shadow, a black bandana and
  // pointed collars, thick black outlines.
  const K = '#0c0c0e';
  const ol = `stroke="${K}" stroke-width="13" stroke-linejoin="round"`;
  const collarL = 'M 204,352 C 164,368 124,404 98,458 C 142,438 188,428 224,420 Z';
  const face = 'M 178,272 C 178,326 208,364 250,368 C 292,364 322,326 322,272 Z';
  const bandana = 'M 172,318 C 208,332 292,332 328,318 L 312,364 C 294,410 274,436 250,470 C 226,436 206,410 188,364 Z';
  const crown = 'M 162,226 C 162,168 196,138 226,150 L 250,170 L 274,150 C 304,138 338,168 338,226 Z';
  const brim = 'M 70,276 C 112,232 186,218 250,218 C 314,218 388,232 430,276 C 402,300 334,284 250,284 C 166,284 98,300 70,276 Z';
  return `<g transform="translate(250,350) scale(1.08) translate(-250,-322)">
    <path d="${collarL}" fill="#1a1a1e" ${ol}/>
    <g transform="translate(500,0) scale(-1,1)"><path d="${collarL}" fill="#1a1a1e" ${ol}/></g>
    <path d="${face}" fill="#3c3c42" ${ol}/>
    <path d="M 200,294 L 240,306 L 237,322 L 202,312 Z" fill="#ffffff" stroke="${K}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M 300,294 L 260,306 L 263,322 L 298,312 Z" fill="#ffffff" stroke="${K}" stroke-width="5" stroke-linejoin="round"/>
    <path d="${bandana}" fill="#151517" ${ol}/>
    <path d="M 206,352 C 234,366 266,366 294,352" fill="none" stroke="#35353b" stroke-width="6" stroke-linecap="round"/>
    <path d="${crown}" fill="#5a5a60" ${ol}/>
    <path d="M 186,214 C 188,180 206,162 222,164" fill="none" stroke="#7c7c84" stroke-width="9" stroke-linecap="round"/>
    <path d="${brim}" fill="#66666d" ${ol}/>
    <path d="M 120,258 C 160,238 210,232 250,232 C 290,232 340,238 380,258" fill="none" stroke="#83838b" stroke-width="8" stroke-linecap="round"/>
  </g>`;
}

function angel(p: Pal): string {
  // A hooded spirit with small wings and a halo: white shapes, outlined in the card's own deep colour.
  const O = mix(p.c, '#000000', 0.42);
  const ol = `stroke="${O}" stroke-width="10" stroke-linejoin="round"`;
  const wing = 'M 196,330 C 168,300 128,286 96,292 C 108,304 110,318 102,330 C 122,330 130,342 122,356 C 142,356 152,368 146,384 C 170,382 190,370 204,352 Z';
  const body = 'M 250,206 C 194,206 160,252 160,312 C 160,372 176,422 202,462 C 218,486 234,506 250,526 C 266,506 282,486 298,462 C 324,422 340,372 340,312 C 340,252 306,206 250,206 Z';
  return `
    <g transform="translate(200,340) scale(1.3) translate(-200,-340)"><path d="${wing}" fill="${W}" ${ol}/></g>
    <g transform="translate(500,0) scale(-1,1) translate(200,340) scale(1.3) translate(-200,-340)"><path d="${wing}" fill="${W}" ${ol}/></g>
    <path d="${body}" fill="${W}" ${ol}/>
    <path d="M 196,262 C 214,236 286,236 304,262" fill="none" stroke="${G}" stroke-width="9" stroke-linecap="round"/>
    <path d="M 250,256 C 214,256 196,282 196,312 C 196,342 216,364 250,364 C 284,364 304,342 304,312 C 304,282 286,256 250,256 Z" fill="${O}"/>
    <ellipse cx="229" cy="314" rx="12" ry="17" fill="${W}"/>
    <ellipse cx="271" cy="314" rx="12" ry="17" fill="${W}"/>
    <ellipse cx="250" cy="170" rx="60" ry="17" fill="none" stroke="${O}" stroke-width="22"/>
    <ellipse cx="250" cy="170" rx="60" ry="17" fill="none" stroke="${W}" stroke-width="11"/>`;
}

function parry(p: Pal): string {
  const sh = 'M 250,165 C 296,186 344,192 382,186 L 378,332 C 368,432 312,494 250,528 C 188,494 132,432 122,332 L 118,186 C 156,192 204,186 250,165 Z';
  return `
    ${solid(sh, RIGHT(250))}
    <path d="${sh}" transform="translate(250,350) scale(0.84) translate(-250,-350)" fill="none" stroke="${G}" stroke-width="10"/>
    <path d="M 140,352 L 250,286 L 360,352 L 360,408 L 250,342 L 140,408 Z" fill="${p.D}"/>`;
}

function breath(p: Pal): string {
  const head =
    'M 84,474 C 80,400 96,330 128,292 C 150,262 186,246 222,248 L 236,212 L 252,250 C 274,256 292,270 302,290 L 330,300 C 334,312 326,322 312,322 L 296,324 C 300,336 296,346 284,348 C 256,352 232,350 214,360 C 184,376 166,420 164,474 Z';
  return `
    <path d="M 176,262 C 160,222 132,204 106,204 C 128,222 140,244 146,274 Z" fill="${G}"/>
    ${solid(head, BELOW(360))}
    ${[0, 1, 2, 3].map((i) => `<path d="M ${92 - i * 2},${330 + i * 38} L ${66 - i * 2},${350 + i * 38} L ${90 - i * 2},${362 + i * 38} Z" fill="${G}"/>`).join('')}
    <ellipse cx="238" cy="284" rx="13" ry="10" fill="${p.D}"/>
    <circle cx="242" cy="281" r="4" fill="${W}"/>
    <circle cx="318" cy="309" r="5" fill="${p.D}"/>
    <path d="M 300,322 C 340,300 360,262 396,248 C 390,276 404,290 430,292 C 410,308 414,326 444,338 C 414,344 404,364 420,390 C 388,378 366,386 350,406 C 342,378 324,356 298,344 Z" fill="#ffd36b"/>
    <path d="M 308,330 C 338,318 360,300 384,292 C 380,310 392,322 410,328 C 392,336 390,350 398,368 C 378,362 360,366 348,380 C 340,360 326,348 308,340 Z" fill="#fff6d8"/>`;
}

function misdirect(p: Pal): string {
  return `
    <path d="M 150,500 L 236,214" fill="none" stroke="${G}" stroke-width="16" stroke-linecap="round" stroke-dasharray="2 30"/>
    <path d="M 222,180 L 254,212 M 254,180 L 222,212" stroke="${G}" stroke-width="12" stroke-linecap="round"/>
    <path d="M 150,500 C 150,350 240,268 340,296" fill="none" stroke="${W}" stroke-width="46" stroke-linecap="round"/>
    <path d="M 404,322 L 323,345 L 357,255 Z" fill="${W}" stroke="${W}" stroke-width="12" stroke-linejoin="round"/>
    <circle cx="150" cy="500" r="23" fill="${p.D}"/>`;
}

function scry(p: Pal): string {
  return `
    <path d="M 178,466 L 322,466 L 348,510 L 152,510 Z" fill="${G}"/>
    <rect x="184" y="448" width="132" height="24" rx="10" fill="${W}"/>
    <circle cx="250" cy="318" r="130" fill="${G}"/>
    <circle cx="240" cy="306" r="120" fill="${W}"/>
    <path d="M 158,320 C 200,262 300,262 342,320 C 300,378 200,378 158,320 Z" fill="#ffffff" stroke="${p.D}" stroke-width="12" stroke-linejoin="round"/>
    <circle cx="250" cy="320" r="42" fill="${p.D}"/>
    <circle cx="250" cy="320" r="19" fill="${mix(p.D, '#000000', 0.6)}"/>
    <circle cx="264" cy="305" r="9" fill="${W}"/>
    ${star4(140, 196, 20)}${star4(372, 206, 15)}${star4(386, 428, 13)}`;
}

function bounty(p: Pal): string {
  // A spiked mace ball: white, outlined in the card's deep orange, hollow drops on its face.
  const O = mix(p.c, '#7a1a00', 0.55);
  const cx = 250;
  const cy = 350;
  const R = 140;
  const spikes = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - 1.2 + (i % 3) * 0.06;
    const half = 0.2;
    const base = R * 0.9;
    const tip = R * (i % 2 ? 1.42 : 1.55);
    const pt = (ang: number, r: number) => `${(cx + Math.cos(ang) * r).toFixed(1)},${(cy + Math.sin(ang) * r).toFixed(1)}`;
    return `<path d="M ${pt(a - half, base)} L ${pt(a, tip)} L ${pt(a + half, base)} Z" fill="${W}" stroke="${O}" stroke-width="11" stroke-linejoin="round"/>`;
  }).join('');
  const drop = (x: number, y: number, s: number, rot: number) =>
    `<path transform="translate(${x},${y}) rotate(${rot}) scale(${s})" d="M 0,-30 C 22,-8 24,20 0,26 C -24,20 -22,-8 0,-30 Z" fill="none" stroke="${O}" stroke-width="${(12 / s).toFixed(1)}" stroke-linejoin="round"/>`;
  return `
    ${spikes}
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="${W}" stroke="${O}" stroke-width="13"/>
    ${drop(196, 312, 1.5, -35)}
    ${drop(306, 380, 1.3, 145)}
    ${drop(292, 286, 0.95, 40)}`;
}

function slip(p: Pal): string {
  const boot = 'M 202,190 L 298,190 C 302,250 300,320 302,372 C 348,380 394,396 406,428 C 414,452 400,474 372,474 L 198,474 C 186,474 180,464 182,452 C 190,380 198,280 202,190 Z';
  return `
    <path d="M 52,384 L 132,384 M 74,424 L 154,424 M 46,464 L 116,464" stroke="${W}" stroke-width="13" stroke-linecap="round" opacity="0.7"/>
    <path d="M 204,252 C 164,200 122,188 92,198 C 120,214 152,238 198,274 Z" fill="${W}"/>
    <path d="M 200,282 C 152,252 108,252 80,270 C 114,278 150,292 198,304 Z" fill="${G}"/>
    <path d="M 198,308 C 158,300 120,306 98,324 C 134,326 168,328 196,330 Z" fill="${W}"/>
    ${solid(boot, BELOW(400))}
    <rect x="190" y="174" width="120" height="42" rx="16" fill="${G}"/>
    <path d="M 182,452 L 406,452 C 410,468 398,480 372,480 L 194,480 C 182,480 178,468 182,452 Z" fill="${p.D}"/>
    <path d="M 252,244 L 290,244 M 252,276 L 292,276 M 254,308 L 294,308" stroke="${G}" stroke-width="9" stroke-linecap="round"/>`;
}

function turnabout(p: Pal): string {
  return `
    ${arcArrow(250, 352, 112, 198, 318, 40)}
    ${arcArrow(250, 352, 112, 18, 138, 40)}
    <circle cx="250" cy="352" r="34" fill="${p.D}"/>
    <circle cx="250" cy="352" r="15" fill="${W}"/>`;
}

function backdoor(p: Pal): string {
  return `
    <rect x="112" y="512" width="300" height="18" rx="9" fill="${G}"/>
    <path d="M 132,520 L 132,286 C 132,196 300,196 300,286 L 300,520 Z" fill="${G}"/>
    <path d="M 152,520 L 152,290 C 152,220 280,220 280,290 L 280,520 Z" fill="${W}"/>
    <path d="M 195,238 L 195,520 M 238,238 L 238,520" stroke="${G}" stroke-width="7"/>
    <rect x="152" y="280" width="54" height="16" rx="6" fill="${p.D}"/>
    <rect x="152" y="446" width="54" height="16" rx="6" fill="${p.D}"/>
    <circle cx="260" cy="388" r="12" fill="${p.D}"/>
    ${solid('M 346,226 L 386,226 L 386,412 L 420,412 L 366,492 L 312,412 L 346,412 Z', RIGHT(366))}`;
}

function pickpocket(p: Pal): string {
  const pouch = 'M 250,262 C 196,262 152,306 146,376 C 140,452 188,512 250,512 C 312,512 360,452 354,376 C 348,306 304,262 250,262 Z';
  return `
    ${solid(pouch, RIGHT(272))}
    <path d="M 210,264 C 194,232 214,206 236,220 C 244,198 258,198 266,220 C 288,206 308,232 290,264 Z" fill="${W}"/>
    <rect x="198" y="252" width="104" height="22" rx="11" fill="${p.D}"/>
    <circle cx="250" cy="398" r="34" fill="none" stroke="${p.D}" stroke-width="9" opacity="0.55"/>
    ${star4(250, 398, 17, p.D)}
    <circle cx="352" cy="196" r="31" fill="#ffd25e"/><circle cx="352" cy="196" r="21" fill="none" stroke="#e0a630" stroke-width="6"/>
    <circle cx="398" cy="262" r="24" fill="#ffd25e"/><circle cx="398" cy="262" r="15" fill="none" stroke="#e0a630" stroke-width="5"/>
    <path d="M 300,236 C 310,214 320,206 328,200 M 330,276 C 348,270 362,268 376,268" stroke="${W}" stroke-width="8" stroke-linecap="round" opacity="0.7" fill="none"/>`;
}

function brawl(p: Pal): string {
  const mug = (x: number, rot: number, flip: boolean) => {
    const body = 'M -62,-72 L 62,-72 L 62,82 C 62,94 54,100 44,100 L -44,100 C -54,100 -62,94 -62,82 Z';
    return `<g transform="translate(${x},372) rotate(${rot}) ${flip ? 'scale(-1,1)' : ''}">
      <path d="M 58,-34 C 116,-36 116,58 58,56" fill="none" stroke="${W}" stroke-width="24" stroke-linecap="round"/>
      ${solid(body, 'M 24,-200 L 200,-200 L 200,200 L 24,200 Z')}
      <rect x="-62" y="-40" width="124" height="14" rx="6" fill="${p.D}" opacity="0.7"/>
      <rect x="-62" y="56" width="124" height="14" rx="6" fill="${p.D}" opacity="0.7"/>
      <path d="M -74,-70 C -86,-104 -54,-126 -32,-108 C -20,-140 22,-140 30,-110 C 54,-128 88,-104 74,-70 Z" fill="#ffffff"/>
      <path d="M -66,-74 C -20,-66 20,-66 66,-74" fill="none" stroke="${G}" stroke-width="6" stroke-linecap="round"/>
    </g>`;
  };
  return `${mug(172, -16, false)}${mug(328, 16, true)}
    <circle cx="250" cy="206" r="13" fill="#ffffff"/><circle cx="218" cy="182" r="8" fill="#ffffff"/><circle cx="284" cy="178" r="9" fill="#ffffff"/><circle cx="252" cy="160" r="6" fill="#ffffff"/>`;
}

function glass(p: Pal): string {
  return `
    <path d="M 234,418 L 266,418 L 272,512 C 272,530 228,530 228,512 Z" fill="${W}"/>
    <circle cx="250" cy="532" r="16" fill="${G}"/>
    ${solid('M 250,164 C 312,164 362,224 362,300 C 362,376 312,436 250,436 C 188,436 138,376 138,300 C 138,224 188,164 250,164 Z', RIGHT(268))}
    <clipPath id="gl"><ellipse cx="250" cy="300" rx="88" ry="110"/></clipPath>
    <ellipse cx="250" cy="300" rx="88" ry="110" fill="${mix(p.L, '#ffffff', 0.55)}"/>
    <g clip-path="url(#gl)">
      <path d="M 168,276 L 236,196 L 262,206 L 182,302 Z" fill="#ffffff" opacity="0.85"/>
      <path d="M 196,318 L 270,230 L 282,236 L 206,330 Z" fill="#ffffff" opacity="0.6"/>
    </g>
    <circle cx="250" cy="168" r="11" fill="${p.D}"/><circle cx="250" cy="432" r="11" fill="${p.D}"/>`;
}

function shackles(p: Pal): string {
  const links = [96, 138, 362, 404]
    .map((x, i) => (i % 2 ? `<rect x="${x - 26}" y="${328}" width="52" height="12" rx="6" fill="${G}"/>` : `<ellipse cx="${x}" cy="334" rx="28" ry="17" fill="none" stroke="${G}" stroke-width="11"/>`))
    .join('');
  return `
    ${links}
    <path d="M 190,330 L 190,272 C 190,196 310,196 310,272 L 310,330" fill="none" stroke="${G}" stroke-width="36"/>
    <path d="M 190,330 L 190,272 C 190,206 300,200 304,262" fill="none" stroke="${W}" stroke-width="22"/>
    ${solid('M 180,318 L 320,318 C 338,318 352,332 352,350 L 352,476 C 352,494 338,508 320,508 L 180,508 C 162,508 148,494 148,476 L 148,350 C 148,332 162,318 180,318 Z', RIGHT(268))}
    <circle cx="250" cy="396" r="21" fill="${p.D}"/>
    <rect x="240" y="402" width="20" height="50" rx="8" fill="${p.D}"/>`;
}

function aegis(p: Pal): string {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const f = (n: number) => n.toFixed(1);
    return `<path d="M ${f(250 + c * 98)},${f(350 + s * 98)} L ${f(250 + c * 56 - s * 13)},${f(350 + s * 56 + c * 13)} L ${f(250 + c * 56 + s * 13)},${f(350 + s * 56 - c * 13)} Z" fill="${p.D}"/>`;
  }).join('');
  const rivets = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return `<circle cx="${(250 + Math.cos(a) * 120).toFixed(1)}" cy="${(350 + Math.sin(a) * 120).toFixed(1)}" r="8" fill="${G}"/>`;
  }).join('');
  return `
    <circle cx="250" cy="352" r="144" fill="${G}"/>
    <circle cx="244" cy="344" r="136" fill="${W}"/>
    <circle cx="250" cy="350" r="104" fill="none" stroke="${G}" stroke-width="6"/>
    ${rivets}${rays}
    <circle cx="250" cy="350" r="48" fill="${p.D}"/>
    <circle cx="240" cy="340" r="18" fill="${mix(p.D, '#ffffff', 0.35)}"/>`;
}

function warband(p: Pal): string {
  return `
    <path d="M 128,524 L 380,192" stroke="${G}" stroke-width="13" stroke-linecap="round"/>
    <path d="M 418,142 L 398,204 L 361,176 Z" fill="${W}" stroke="${W}" stroke-width="6" stroke-linejoin="round"/>
    <rect x="200" y="170" width="26" height="362" rx="12" fill="${W}"/>
    <circle cx="213" cy="160" r="20" fill="${G}"/>
    ${solid('M 226,192 L 388,192 L 352,264 L 388,336 L 226,336 Z', 'M 0,300 L 500,300 L 500,700 L 0,700 Z')}
    <rect x="258" y="220" width="16" height="84" rx="7" fill="${p.D}"/>
    <rect x="288" y="220" width="16" height="84" rx="7" fill="${p.D}"/>
    <rect x="318" y="220" width="16" height="84" rx="7" fill="${p.D}"/>`;
}

function privateer(p: Pal): string {
  return `
    <path d="M 250,236 C 300,270 200,318 250,350 C 300,382 216,420 262,456" fill="none" stroke="${G}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="250" cy="188" r="30" fill="none" stroke="${W}" stroke-width="18"/>
    ${solid('M 236,214 L 264,214 L 264,490 L 236,490 Z', RIGHT(250))}
    <rect x="168" y="234" width="164" height="28" rx="13" fill="${W}"/>
    <circle cx="168" cy="248" r="17" fill="${G}"/><circle cx="332" cy="248" r="17" fill="${G}"/>
    <path d="M 130,398 C 140,470 200,510 250,510 C 300,510 360,470 370,398" fill="none" stroke="${W}" stroke-width="30" stroke-linecap="round"/>
    <path d="M 100,424 L 118,360 L 162,404 Z" fill="${W}" stroke="${W}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M 400,424 L 382,360 L 338,404 Z" fill="${G}" stroke="${G}" stroke-width="8" stroke-linejoin="round"/>
    <circle cx="250" cy="504" r="22" fill="${W}"/>
    <circle cx="250" cy="188" r="8" fill="${p.D}"/>`;
}

function sands(p: Pal): string {
  const sand = '#f2c35e';
  const sandSh = '#d99a3a';
  return `
    <rect x="178" y="200" width="16" height="300" rx="7" fill="${G}"/>
    <rect x="306" y="200" width="16" height="300" rx="7" fill="${G}"/>
    <path d="M 198,204 L 302,204 C 302,282 262,320 262,350 C 262,380 302,418 302,496 L 198,496 C 198,418 238,380 238,350 C 238,320 198,282 198,204 Z" fill="#fffdf5" opacity="0.92"/>
    <path d="M 214,262 L 286,262 C 280,300 256,326 250,346 C 244,326 220,300 214,262 Z" fill="${sand}"/>
    <path d="M 250,262 L 286,262 C 280,300 256,326 250,346 Z" fill="${sandSh}"/>
    <path d="M 250,346 L 250,470" stroke="${sand}" stroke-width="5"/>
    <path d="M 204,494 C 212,450 236,434 250,430 C 264,434 288,450 296,494 Z" fill="${sand}"/>
    <path d="M 250,430 C 264,434 288,450 296,494 L 250,494 Z" fill="${sandSh}"/>
    ${solid('M 172,168 L 328,168 C 340,168 348,176 348,188 L 348,196 C 348,206 340,212 328,212 L 172,212 C 160,212 152,206 152,196 L 152,188 C 152,176 160,168 172,168 Z', BELOW(194))}
    ${solid('M 172,490 L 328,490 C 340,490 348,496 348,506 L 348,516 C 348,526 340,534 328,534 L 172,534 C 160,534 152,526 152,516 L 152,506 C 152,496 160,490 172,490 Z', BELOW(514))}
    <rect x="232" y="182" width="36" height="10" rx="5" fill="${p.D}"/>`;
}

function mistletoe(p: Pal): string {
  const leaf = (deg: number, len: number, shade: boolean) =>
    `<g transform="translate(250,318) rotate(${deg})"><path d="M 8,0 C 40,-30 ${len - 40},-34 ${len},0 C ${len - 40},34 40,30 8,0 Z" fill="${shade ? G : W}"/><path d="M 22,0 L ${len - 22},0" stroke="${shade ? W : G}" stroke-width="6" stroke-linecap="round"/></g>`;
  const berries = [
    [234, 334],
    [266, 334],
    [250, 358],
    [218, 360],
    [282, 360],
    [250, 312],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="20" fill="#ffffff"/><circle cx="${x + 5}" cy="${y + 8}" r="4.5" fill="${G}"/>`)
    .join('');
  return `
    ${leaf(158, 168, false)}${leaf(126, 160, true)}${leaf(54, 160, false)}${leaf(22, 168, true)}
    <path d="M 250,250 L 250,318" stroke="${W}" stroke-width="12" stroke-linecap="round"/>
    ${berries}
    <path d="M 250,240 C 206,196 160,210 172,252 C 184,282 230,264 250,240 Z" fill="#e2504a"/>
    <path d="M 250,240 C 294,196 340,210 328,252 C 316,282 270,264 250,240 Z" fill="#c43a36"/>
    <circle cx="250" cy="240" r="18" fill="#e2504a"/>
    <circle cx="243" cy="234" r="6" fill="#ff8a80"/>`;
}

function yule(p: Pal): string {
  return `
    <path d="M 250,166 C 300,218 332,250 322,300 C 342,290 352,270 350,248 C 384,290 384,340 352,372 L 148,372 C 116,340 124,294 156,266 C 156,290 168,304 182,306 C 170,262 200,218 250,166 Z" fill="#ffd36b"/>
    <path d="M 250,236 C 280,270 296,296 290,326 C 304,316 308,304 306,292 C 326,318 322,352 302,370 L 198,370 C 180,352 182,326 196,310 C 198,330 210,338 222,338 C 212,300 226,268 250,236 Z" fill="#fff4d2"/>
    ${solid('M 172,364 L 350,364 C 376,364 396,386 396,412 C 396,438 376,460 350,460 L 172,460 C 146,460 126,438 126,412 C 126,386 146,364 172,364 Z', BELOW(414))}
    <ellipse cx="352" cy="412" rx="34" ry="46" fill="${G}"/>
    <ellipse cx="352" cy="412" rx="20" ry="28" fill="none" stroke="${W}" stroke-width="6"/>
    <path d="M 160,392 L 230,392 M 196,432 L 286,432 M 254,388 L 300,388" stroke="${G}" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="168" cy="468" rx="30" ry="12" transform="rotate(-20 168 468)" fill="${p.D}"/>
    <ellipse cx="214" cy="472" rx="30" ry="12" transform="rotate(20 214 472)" fill="${p.D}"/>
    <circle cx="190" cy="460" r="10" fill="#e2504a"/><circle cx="204" cy="452" r="8" fill="#e2504a"/>`;
}

export const CARTOON: Record<CardType, (p: Pal) => string> = {
  hand,
  angel,
  parry,
  breath,
  misdirect,
  scry,
  bounty,
  slip,
  turnabout,
  backdoor,
  pickpocket,
  brawl,
  glass,
  shackles,
  aegis,
  warband,
  privateer,
  sands,
  mistletoe,
  yule,
};

/** The hooded crest in flat colours (used on the default card back), centred at (0,0), ~300 units tall. */
export function cartoonCrest(gold: string, dark: string): string {
  return `
    <path d="M -152,170 C -144,102 -92,68 -40,58 L 40,58 C 92,68 144,102 152,170 Z" fill="${gold}"/>
    <path d="M 12,-196 C -52,-178 -92,-104 -96,-32 C -99,20 -80,56 -46,72 L 46,72 C 80,56 99,20 96,-32 C 92,-104 56,-166 12,-196 Z" fill="${gold}"/>
    <ellipse cx="0" cy="-22" rx="58" ry="68" fill="${dark}"/>
    <ellipse cx="-24" cy="-26" rx="15" ry="7" transform="rotate(14 -24 -26)" fill="#ffb347"/>
    <ellipse cx="24" cy="-26" rx="15" ry="7" transform="rotate(-14 24 -26)" fill="#ffb347"/>`;
}
