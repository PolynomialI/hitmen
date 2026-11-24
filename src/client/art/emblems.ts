// Vector emblems for each card (original artwork). Coordinates are in the card's 500x700 space;
// the emblem area is roughly x 80..420, y 100..530, centred near (250, 315).

export const INK = '#1b110b';
export const IVORY = '#f6eedb';
export const IVORY_SH = '#d8c7a2';
export const GOLD = 'url(#gold)';

export const OL = `stroke="${INK}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"`;
export const DL = `stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" fill="none"`;
export const THIN = `stroke="${INK}" stroke-width="3.5" stroke-linecap="round" fill="none"`;

export const f = (n: number) => n.toFixed(1);
export const rad = (d: number) => (d * Math.PI) / 180;

export function sparkle(x: number, y: number, s: number, fill = IVORY, op = 0.9): string {
  const p = `M ${f(x)},${f(y - s)} C ${f(x + s * 0.12)},${f(y - s * 0.12)} ${f(x + s * 0.12)},${f(y - s * 0.12)} ${f(x + s)},${f(y)} C ${f(x + s * 0.12)},${f(y + s * 0.12)} ${f(x + s * 0.12)},${f(y + s * 0.12)} ${f(x)},${f(y + s)} C ${f(x - s * 0.12)},${f(y + s * 0.12)} ${f(x - s * 0.12)},${f(y + s * 0.12)} ${f(x - s)},${f(y)} C ${f(x - s * 0.12)},${f(y - s * 0.12)} ${f(x - s * 0.12)},${f(y - s * 0.12)} ${f(x)},${f(y - s)} Z`;
  return `<path d="${p}" fill="${fill}" opacity="${op}"/>`;
}

/** A leaf/feather shape from (x,y) pointing at angle a (deg) with length L and half-width w. */
export function feather(x: number, y: number, a: number, L: number, w: number, extra = ''): string {
  const ca = Math.cos(rad(a));
  const sa = Math.sin(rad(a));
  const px = -sa;
  const py = ca;
  const tipx = x + ca * L;
  const tipy = y + sa * L;
  const c1x = x + ca * L * 0.35 + px * w;
  const c1y = y + sa * L * 0.35 + py * w;
  const c2x = x + ca * L * 0.85 + px * w * 0.9;
  const c2y = y + sa * L * 0.85 + py * w * 0.9;
  const c3x = x + ca * L * 0.85 - px * w * 0.7;
  const c3y = y + sa * L * 0.85 - py * w * 0.7;
  const c4x = x + ca * L * 0.35 - px * w * 0.8;
  const c4y = y + sa * L * 0.35 - py * w * 0.8;
  const d = `M ${f(x)},${f(y)} C ${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(tipx)},${f(tipy)} C ${f(c3x)},${f(c3y)} ${f(c4x)},${f(c4y)} ${f(x)},${f(y)} Z`;
  const rachis = `M ${f(x + ca * L * 0.12)},${f(y + sa * L * 0.12)} L ${f(x + ca * L * 0.8)},${f(y + sa * L * 0.8)}`;
  return `<path d="${d}" fill="${IVORY}" ${OL} stroke-width="6" ${extra}/><path d="${rachis}" ${THIN} opacity="0.55"/>`;
}

export function dagger(tx: number, ty: number, rot: number, scale = 1, withFist = false): string {
  return `<g transform="translate(${tx},${ty}) rotate(${rot}) scale(${scale})">
    <path d="M -14,0 L -12,-128 L 0,-170 L 12,-128 L 14,0 Z" fill="${IVORY}" ${OL}/>
    <path d="M 0,-10 L 0,-140" ${THIN} opacity="0.6"/>
    <path d="M 4,-10 L 4,-128 L 0,-160" fill="none" stroke="#fff" stroke-width="3" opacity="0.7"/>
    <rect x="-9" y="10" width="18" height="44" rx="5" fill="${IVORY_SH}" ${OL} stroke-width="7"/>
    <path d="M -44,4 C -30,-8 30,-8 44,4 C 30,16 -30,16 -44,4 Z" fill="${IVORY}" ${OL} stroke-width="7"/>
    <circle cx="0" cy="62" r="12" fill="${IVORY}" ${OL} stroke-width="7"/>
    ${
      withFist
        ? `<path d="M -34,12 C -44,16 -46,56 -34,64 L 26,66 C 40,62 42,18 28,12 Z" fill="#2a1d17" ${OL}/>
           <path d="M -36,27 C -16,24 10,24 32,27 M -38,42 C -16,39 12,39 35,42 M -36,56 C -14,54 12,54 32,56" stroke="#6b5444" stroke-width="3.5" fill="none" stroke-linecap="round"/>
           <path d="M -34,14 C -22,2 -2,6 6,20 C 12,32 -2,38 -16,31" fill="#2a1d17" ${OL} stroke-width="6"/>
           <path d="M -24,12 C -16,8 -6,10 0,18" stroke="#8a7060" stroke-width="3" fill="none" stroke-linecap="round"/>
           <path d="M -30,66 L -36,100 L 30,102 L 26,66 Z" fill="#4a1414" ${OL} stroke-width="7"/>`
        : ''
    }
  </g>`;
}

export function sword(tx: number, ty: number, rot: number, len = 215): string {
  return `<g transform="translate(${tx},${ty}) rotate(${rot})">
    <path d="M -12,0 L -10,${-len + 30} L 0,${-len} L 10,${-len + 30} L 12,0 Z" fill="${IVORY}" ${OL}/>
    <path d="M 0,-14 L 0,${-len + 34}" ${THIN} opacity="0.55"/>
    <path d="M -54,2 C -60,-10 -48,-16 -40,-8 L 40,-8 C 48,-16 60,-10 54,2 C 40,12 -40,12 -54,2 Z" fill="${IVORY}" ${OL} stroke-width="7"/>
    <rect x="-8" y="8" width="16" height="50" rx="5" fill="${IVORY_SH}" ${OL} stroke-width="7"/>
    <path d="M -8,20 L 8,26 M -8,34 L 8,40 M -8,48 L 8,54" ${THIN} opacity="0.6"/>
    <circle cx="0" cy="68" r="13" fill="${IVORY}" ${OL} stroke-width="7"/>
  </g>`;
}

// ------------------------------------------------------------------ card emblems

export function emblemHand(): string {
  const eyes = `
    <g filter="url(#eyeglow)">
      <path d="M 212,290 C 222,280 238,282 244,294 C 234,300 220,299 212,290 Z" fill="#ffd35c"/>
      <path d="M 288,290 C 278,280 262,282 256,294 C 266,300 280,299 288,290 Z" fill="#ffd35c"/>
    </g>
    <path d="M 216,290 C 224,286 234,287 240,294" stroke="#fff6c8" stroke-width="3" fill="none"/>
    <path d="M 284,290 C 276,286 266,287 260,294" stroke="#fff6c8" stroke-width="3" fill="none"/>`;
  return `
  <g>
    <path d="M 88,532 C 98,455 150,410 205,396 L 295,396 C 350,410 402,455 412,532 Z" fill="${IVORY}" ${OL}/>
    <path d="M 150,532 C 160,480 190,440 222,420 M 350,532 C 340,480 310,440 278,420" ${DL} opacity="0.5"/>
    <path d="M 274,104 C 228,122 172,196 164,282 C 158,346 178,392 210,410 L 290,410 C 322,392 342,346 336,282 C 330,212 300,150 274,104 Z" fill="${IVORY}" ${OL}/>
    <path d="M 274,108 C 262,150 268,180 284,214" ${DL} opacity="0.45"/>
    <path d="M 186,300 C 190,350 206,384 232,404" ${DL} opacity="0.4"/>
    <path d="M 250,190 C 208,196 188,238 192,292 C 196,344 220,378 250,386 C 280,378 304,344 308,292 C 312,238 292,196 250,190 Z" fill="url(#voidgrad)" stroke="${IVORY_SH}" stroke-width="10"/>
    <path d="M 250,190 C 208,196 188,238 192,292 C 196,344 220,378 250,386 C 280,378 304,344 308,292 C 312,238 292,196 250,190 Z" fill="none" ${OL} stroke-width="5"/>
    ${eyes}
    ${dagger(360, 432, 14, 1, true)}
  </g>`;
}

function wing(): string {
  // Wing arm: bezier from the shoulder (232,300) up and out to the tip (84,150).
  const P0 = [232, 304], P1 = [190, 236], P2 = [132, 176], P3 = [80, 152];
  const bez = (t: number) => {
    const u = 1 - t;
    return [
      u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
      u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1],
    ];
  };
  let out = '';
  // Primaries/secondaries hang from the arm, longest near the tip; draw tip-first so inner feathers overlap.
  const N = 9;
  for (let i = N - 1; i >= 0; i--) {
    const t = 0.08 + (i / (N - 1)) * 0.9;
    const [x, y] = bez(t);
    const ang = 96 + t * 62;
    const len = 92 + t * 92;
    out += feather(x, y, ang, len, 17 + t * 4);
  }
  // Coverts: shorter row along the arm.
  for (let i = 6; i >= 0; i--) {
    const t = 0.05 + (i / 6) * 0.85;
    const [x, y] = bez(t);
    out += feather(x, y - 4, 100 + t * 55, 46 + t * 26, 15);
  }
  // The arm itself (marginal coverts), a smooth ivory band.
  const pts = Array.from({ length: 13 }, (_, i) => bez(i / 12));
  const top = pts.map(([x, y]) => `${f(x)},${f(y - 9)}`).join(' L ');
  const bot = pts.slice().reverse().map(([x, y]) => `${f(x + 2)},${f(y + 16)}`).join(' L ');
  out += `<path d="M ${top} L ${bot} Z" fill="${IVORY}" ${OL} stroke-width="7"/>`;
  for (let i = 1; i < 12; i += 2) {
    const [x, y] = bez(i / 12);
    out += `<path d="M ${f(x - 6)},${f(y + 14)} C ${f(x - 2)},${f(y + 6)} ${f(x + 6)},${f(y + 6)} ${f(x + 10)},${f(y + 13)}" ${THIN} opacity="0.5"/>`;
  }
  return out;
}

export function emblemAngel(): string {
  const left = `<g transform="translate(232,300) scale(0.62) translate(-232,-300)">${wing()}</g>`;
  const wings = `<g>${left}</g><g transform="translate(500,0) scale(-1,1)">${left}</g>`;
  const rays = Array.from({ length: 14 }, (_, i) => {
    const a = rad(-90 + (i - 6.5) * 13);
    const x1 = 250 + Math.cos(a) * 70;
    const y1 = 250 + Math.sin(a) * 70;
    const x2 = 250 + Math.cos(a) * 205;
    const y2 = 250 + Math.sin(a) * 205;
    return `<path d="M ${f(x1)},${f(y1)} L ${f(x2)},${f(y2)}" stroke="#fffbe8" stroke-width="${i % 2 ? 3 : 6}" opacity="0.16" stroke-linecap="round"/>`;
  }).join('');
  return `
  <g>
    ${rays}
    ${wings}
    <path d="M 216,300 C 206,360 188,440 172,512 C 220,530 280,530 328,512 C 312,440 294,360 284,300 C 262,288 238,288 216,300 Z" fill="${IVORY}" ${OL}/>
    <path d="M 232,330 C 228,400 220,460 214,514 M 268,330 C 272,400 280,460 286,514 M 250,350 L 250,520" ${DL} opacity="0.4"/>
    <path d="M 236,352 C 232,336 240,322 250,320 C 260,322 268,336 264,352 C 258,362 242,362 236,352 Z" fill="${IVORY}" ${OL} stroke-width="6"/>
    <path d="M 250,322 L 250,358" ${THIN} opacity="0.6"/>
    <circle cx="250" cy="262" r="36" fill="${IVORY}" ${OL}/>
    <path d="M 233,262 C 237,268 243,268 246,262 M 254,262 C 257,268 263,268 267,262" ${THIN} stroke-width="4"/>
    <path d="M 241,280 C 246,284 254,284 259,280" ${THIN} stroke-width="3.5"/>
    <g filter="url(#haloglow)">
      <ellipse cx="250" cy="206" rx="48" ry="14" fill="none" stroke="#ffe9a3" stroke-width="10"/>
    </g>
    <ellipse cx="250" cy="206" rx="48" ry="14" fill="none" stroke="${INK}" stroke-width="3" opacity="0.6"/>
  </g>`;
}

export function emblemScry(): string {
  const mist = `
    <path d="M 160,350 C 190,320 230,370 270,340 C 300,318 330,340 345,325" stroke="#fff" stroke-width="7" fill="none" opacity="0.25" stroke-linecap="round"/>
    <path d="M 170,395 C 210,372 250,410 300,386 C 320,376 336,384 342,378" stroke="#fff" stroke-width="5" fill="none" opacity="0.18" stroke-linecap="round"/>`;
  return `
  <g>
    <path d="M 168,500 L 332,500 L 352,530 L 148,530 Z" fill="${IVORY_SH}" ${OL}/>
    <path d="M 186,470 C 190,488 200,498 210,502 L 290,502 C 300,498 310,488 314,470 Z" fill="${IVORY}" ${OL}/>
    <circle cx="250" cy="330" r="128" fill="url(#orbgrad)" ${OL}/>
    ${mist}
    <path d="M 168,330 C 200,282 300,282 332,330 C 300,378 200,378 168,330 Z" fill="${IVORY}" ${OL} stroke-width="7"/>
    <circle cx="250" cy="330" r="30" fill="url(#irisgrad)" ${OL} stroke-width="5"/>
    <circle cx="250" cy="330" r="12" fill="${INK}"/>
    <circle cx="241" cy="321" r="6" fill="#fff"/>
    <path d="M 176,320 C 172,306 176,292 186,282 M 324,320 C 328,306 324,292 314,282" ${THIN} opacity="0.4"/>
    <ellipse cx="196" cy="258" rx="34" ry="18" transform="rotate(-38 196 258)" fill="#fff" opacity="0.55"/>
    <ellipse cx="300" cy="418" rx="18" ry="7" transform="rotate(-38 300 418)" fill="#fff" opacity="0.25"/>
    <path d="M 160,448 C 170,470 186,480 200,484 M 340,448 C 330,470 314,480 300,484" ${DL}/>
    <path d="M 196,442 C 192,460 196,476 208,486 M 304,442 C 308,460 304,476 292,486" fill="none" stroke="${IVORY_SH}" stroke-width="10" stroke-linecap="round"/>
    <path d="M 196,442 C 192,460 196,476 208,486 M 304,442 C 308,460 304,476 292,486" ${DL}/>
    ${sparkle(112, 196, 22)}${sparkle(392, 176, 16)}${sparkle(404, 420, 20)}${sparkle(98, 410, 13)}${sparkle(372, 250, 9, '#fff', 0.7)}
  </g>`;
}

export function emblemParry(): string {
  return `
  <g>
    ${sword(164, 466, 34, 372)}
    ${sword(336, 466, -34, 372)}
    <path d="M 156,212 L 344,212 C 350,330 326,424 250,478 C 174,424 150,330 156,212 Z" fill="${IVORY}" ${OL}/>
    <path d="M 176,232 L 324,232 C 328,330 308,408 250,452 C 192,408 172,330 176,232 Z" fill="none" stroke="${IVORY_SH}" stroke-width="6"/>
    <path d="M 176,318 L 250,262 L 324,318 L 324,352 L 250,296 L 176,352 Z" fill="url(#fieldsolid)" ${OL} stroke-width="6"/>
    <path d="M 160,214 C 156,320 178,410 250,476 L 250,214 Z" fill="#fff" opacity="0.18"/>
    ${[182, 214, 250, 286, 318].map((x) => `<circle cx="${x}" cy="222" r="5" fill="${INK}" opacity="0.75"/>`).join('')}
    ${sparkle(250, 168, 24, '#fff7d6', 0.95)}
    <path d="M 214,160 L 196,140 M 286,160 L 304,140 M 250,130 L 250,108" stroke="#fff7d6" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
  </g>`;
}

export function emblemBounty(): string {
  const cx = 318;
  const cy = 248;
  const R = 64;
  const spikes = Array.from({ length: 12 }, (_, i) => {
    const a = rad(i * 30 + 8);
    const b1 = rad(i * 30 + 8 - 11);
    const b2 = rad(i * 30 + 8 + 11);
    const tip = [cx + Math.cos(a) * (R + 40), cy + Math.sin(a) * (R + 40)];
    const p1 = [cx + Math.cos(b1) * (R - 4), cy + Math.sin(b1) * (R - 4)];
    const p2 = [cx + Math.cos(b2) * (R - 4), cy + Math.sin(b2) * (R - 4)];
    return `<path d="M ${f(p1[0])},${f(p1[1])} L ${f(tip[0])},${f(tip[1])} L ${f(p2[0])},${f(p2[1])} Z" fill="${IVORY}" ${OL} stroke-width="7"/>`;
  }).join('');
  const links = [
    [232, 404, 30],
    [252, 378, -40],
    [268, 350, 30],
    [282, 322, -40],
  ]
    .map(
      ([x, y, r]) =>
        `<ellipse cx="${x}" cy="${y}" rx="11" ry="19" transform="rotate(${r} ${x} ${y})" fill="none" stroke="${INK}" stroke-width="15"/><ellipse cx="${x}" cy="${y}" rx="11" ry="19" transform="rotate(${r} ${x} ${y})" fill="none" stroke="${IVORY}" stroke-width="6"/>`
    )
    .join('');
  return `
  <g>
    <path d="M 120,214 C 150,150 210,120 268,128" stroke="${IVORY}" stroke-width="7" fill="none" opacity="0.35" stroke-linecap="round"/>
    <path d="M 102,262 C 126,190 184,150 236,146" stroke="${IVORY}" stroke-width="5" fill="none" opacity="0.22" stroke-linecap="round"/>
    <g transform="translate(176,470) rotate(38)">
      <rect x="-20" y="-96" width="40" height="150" rx="14" fill="${IVORY_SH}" ${OL}/>
      ${[-70, -46, -22, 2, 26].map((y) => `<path d="M -20,${y} L 20,${y + 14}" ${THIN} stroke-width="4" opacity="0.7"/>`).join('')}
      <rect x="-30" y="-112" width="60" height="22" rx="8" fill="${IVORY}" ${OL} stroke-width="7"/>
      <circle cx="0" cy="70" r="16" fill="none" stroke="${INK}" stroke-width="14"/>
      <circle cx="0" cy="70" r="16" fill="none" stroke="${IVORY}" stroke-width="5"/>
    </g>
    ${links}
    ${spikes}
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#ballgrad)" ${OL}/>
    <ellipse cx="${cx - 22}" cy="${cy - 24}" rx="20" ry="12" transform="rotate(-35 ${cx - 22} ${cy - 24})" fill="#fff" opacity="0.6"/>
    ${[[-18, 20], [22, -10], [16, 30], [-30, -8]].map(([x, y]) => `<circle cx="${cx + x}" cy="${cy + y}" r="5" fill="${INK}" opacity="0.7"/>`).join('')}
    ${sparkle(408, 150, 20, '#fff7d6')}${sparkle(420, 360, 14, '#fff7d6')}${sparkle(214, 190, 12, '#fff7d6', 0.7)}
  </g>`;
}

export function emblemSlip(): string {
  let wingSvg = '';
  const wr = [226, 330];
  [252, 236, 220, 204, 188].forEach((a, i) => (wingSvg += feather(wr[0], wr[1] + i * 4, a, 150 - i * 16, 18)));
  [240, 214, 192].forEach((a) => (wingSvg += feather(wr[0] + 2, wr[1] + 6, a, 66, 15)));
  const puffs = [
    [150, 492, 24],
    [116, 478, 18],
    [92, 498, 13],
    [184, 504, 15],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${IVORY}" opacity="0.55" stroke="${INK}" stroke-width="4"/>`)
    .join('');
  const speed = [
    [60, 330, 140],
    [74, 380, 150],
    [60, 430, 132],
  ]
    .map(([x, y, x2]) => `<path d="M ${x},${y} L ${x2},${y}" stroke="${IVORY}" stroke-width="9" stroke-linecap="round" opacity="0.5"/>`)
    .join('');
  return `
  <g>
    ${speed}
    ${puffs}
    <g transform="rotate(-6 290 380)">
      <path d="M 222,214 L 304,214 C 306,280 308,340 318,384 C 348,392 384,400 412,412 C 438,422 446,440 432,452 C 420,462 400,462 386,460 L 214,462 C 200,440 204,410 212,388 C 222,330 224,270 222,214 Z" fill="${IVORY}" ${OL}/>
      <path d="M 432,452 C 448,440 452,420 440,410 C 432,404 422,410 426,420" fill="none" ${OL} stroke-width="7"/>
      <path d="M 210,462 L 388,462" stroke="${INK}" stroke-width="18" stroke-linecap="round"/>
      <path d="M 206,454 L 238,454 L 238,476 L 206,476 Z" fill="${INK}"/>
      <path d="M 210,176 C 236,164 292,164 318,176 L 312,226 C 288,216 240,216 214,226 Z" fill="${IVORY_SH}" ${OL}/>
      <path d="M 224,190 L 232,214 M 252,186 L 256,212 M 282,186 L 280,212 M 304,190 L 298,216" ${THIN} opacity="0.5"/>
      <path d="M 246,262 L 286,270 M 244,292 L 290,300 M 246,322 L 292,330 M 250,352 L 298,360" ${THIN} stroke-width="5" opacity="0.7"/>
      <path d="M 268,262 L 268,360" ${THIN} stroke-width="3" opacity="0.4"/>
      <path d="M 330,404 C 356,408 380,416 400,428" ${DL} opacity="0.45"/>
      <path d="M 232,232 C 230,300 232,360 224,400" stroke="#fff" stroke-width="8" opacity="0.35" fill="none" stroke-linecap="round"/>
      ${wingSvg}
    </g>
  </g>`;
}

export function emblemBrawl(): string {
  const mug = (flip: boolean) => {
    const s = flip ? -1 : 1;
    return `
      <path d="M ${s * 52},-40 C ${s * 98},-44 ${s * 102},40 ${s * 52},44" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>
      <path d="M ${s * 52},-40 C ${s * 98},-44 ${s * 102},40 ${s * 52},44" fill="none" stroke="${IVORY_SH}" stroke-width="14" stroke-linecap="round"/>
      <path d="M -58,-78 L 58,-78 L 54,92 C 30,102 -30,102 -54,92 Z" fill="${IVORY}" ${OL}/>
      <path d="M -57,-44 L 57,-44 M -55,50 L 55,50" stroke="${INK}" stroke-width="7"/>
      <path d="M -57,-40 L 57,-40 M -55,54 L 55,54" stroke="${IVORY_SH}" stroke-width="4"/>
      <path d="M ${-s * 30},-30 L ${-s * 30},40" stroke="#fff" stroke-width="9" opacity="0.45" stroke-linecap="round"/>
      <path d="M -66,-78 C -78,-104 -50,-124 -30,-112 C -22,-138 18,-140 26,-114 C 46,-126 76,-104 64,-78 C 70,-62 50,-56 42,-66 C 36,-52 14,-54 10,-68 C 0,-56 -24,-58 -26,-70 C -40,-58 -64,-62 -66,-78 Z" fill="#fffaf0" ${OL} stroke-width="7"/>
      <path d="M ${s * 40},-70 C ${s * 44},-52 ${s * 40},-40 ${s * 36},-34" stroke="#fffaf0" stroke-width="10" stroke-linecap="round"/>`;
  };
  const arrows = `
    <path d="M 120,470 A 150 150 0 0 0 380,470" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round" opacity="0.9"/>
    <path d="M 120,470 A 150 150 0 0 0 380,470" fill="none" stroke="${IVORY}" stroke-width="7" stroke-linecap="round"/>
    <path d="M 364,446 L 392,476 L 352,486 Z" fill="${IVORY}" ${OL} stroke-width="6"/>
    <path d="M 136,446 L 108,476 L 148,486 Z" fill="${IVORY}" ${OL} stroke-width="6"/>`;
  const drops = [
    [236, 172, 9],
    [262, 156, 7],
    [250, 196, 6],
    [218, 150, 5],
    [284, 178, 6],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fffaf0" stroke="${INK}" stroke-width="3.5"/>`)
    .join('');
  return `
  <g>
    ${arrows}
    <g transform="translate(176,330) rotate(-16)">${mug(true)}</g>
    <g transform="translate(324,330) rotate(16)">${mug(false)}</g>
    ${drops}
    ${sparkle(250, 230, 26, '#fff7d6')}
  </g>`;
}

export function emblemPickpocket(): string {
  const coin = (x: number, y: number, r: number, rot: number) =>
    `<g transform="rotate(${rot} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.92}" fill="url(#gold)" ${OL} stroke-width="6"/><ellipse cx="${x}" cy="${y}" rx="${r * 0.55}" ry="${r * 0.5}" fill="none" stroke="${INK}" stroke-width="3" opacity="0.55"/></g>`;
  return `
  <g>
    <path d="M 70,150 C 170,136 330,136 430,150 L 430,196 C 330,182 170,182 70,196 Z" fill="#6b4226" ${OL}/>
    <path d="M 80,162 C 170,150 330,150 420,162" stroke="#a87a52" stroke-width="3" fill="none"/>
    <rect x="222" y="140" width="56" height="62" rx="8" fill="url(#gold)" ${OL} stroke-width="7"/>
    <rect x="236" y="154" width="28" height="34" rx="4" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M 238,200 C 234,224 240,244 250,262" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    <path d="M 238,200 C 234,224 240,244 250,262" fill="none" stroke="${IVORY_SH}" stroke-width="5" stroke-linecap="round"/>
    <path d="M 262,200 C 268,214 268,224 264,232" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    <path d="M 262,200 C 268,214 268,224 264,232" fill="none" stroke="${IVORY_SH}" stroke-width="5" stroke-linecap="round"/>
    <g transform="rotate(-14 250 400)">
      <path d="M 250,284 C 192,286 152,340 152,408 C 152,476 196,512 250,512 C 304,512 348,476 348,408 C 348,340 308,286 250,284 Z" fill="${IVORY}" ${OL}/>
      <path d="M 212,292 C 222,312 236,318 250,318 C 266,318 280,312 290,292 C 278,276 264,270 250,270 C 236,270 222,276 212,292 Z" fill="${IVORY_SH}" ${OL} stroke-width="7"/>
      <path d="M 196,350 C 184,390 188,446 210,486 M 304,350 C 316,390 312,446 290,486" ${DL} opacity="0.45"/>
      <path d="M 214,300 C 226,306 274,306 286,300" ${THIN} opacity="0.6"/>
      <path d="M 210,330 C 196,380 196,440 214,480" stroke="#fff" stroke-width="9" opacity="0.35" fill="none" stroke-linecap="round"/>
    </g>
    ${dagger(330, 262, 62, 0.95)}
    <path d="M 252,250 L 270,236 M 258,262 L 280,256 M 244,240 L 252,222" stroke="#fff7d6" stroke-width="5" stroke-linecap="round"/>
    ${coin(138, 430, 22, -20)}${coin(372, 470, 20, 25)}${coin(112, 500, 16, 10)}${coin(404, 404, 15, -30)}
    ${sparkle(150, 360, 13, '#fff7d6')}${sparkle(420, 300, 11, '#fff7d6')}
  </g>`;
}

export function emblemBackdoor(): string {
  const planks = [196, 232, 268, 304].map((x) => `<path d="M ${x},250 L ${x},492" ${THIN} stroke-width="4.5" opacity="0.6"/>`).join('');
  return `
  <g>
    <path d="M 132,520 L 132,270 C 132,170 186,118 250,118 C 314,118 368,170 368,270 L 368,520 Z" fill="${IVORY_SH}" ${OL}/>
    ${[
      [132, 270, 168, 300],
      [132, 360, 168, 390],
      [132, 450, 168, 480],
      [332, 300, 368, 330],
      [332, 390, 368, 420],
    ]
      .map(([x1, y1, x2, y2]) => `<path d="M ${x1},${y1} L ${x2},${y1} M ${x1},${y2} L ${x2},${y2}" ${THIN} opacity="0.45"/>`)
      .join('')}
    <path d="M 168,520 L 168,276 C 168,200 204,156 250,156 C 296,156 332,200 332,276 L 332,520 Z" fill="url(#doorlight)" ${OL} stroke-width="7"/>
    <path d="M 168,520 L 168,276 C 168,214 192,178 222,164 L 222,532 L 168,520 Z" fill="none"/>
    <g>
      <path d="M 300,520 L 300,232 C 300,206 292,186 280,172 L 186,190 C 176,214 172,240 172,276 L 172,520 Z" fill="${IVORY}" ${OL}/>
      ${planks}
      <path d="M 172,300 L 300,300 M 172,440 L 300,440" stroke="${INK}" stroke-width="12" opacity="0.85"/>
      <path d="M 172,300 L 300,300 M 172,440 L 300,440" stroke="${IVORY_SH}" stroke-width="4"/>
      <circle cx="276" cy="372" r="15" fill="none" stroke="${INK}" stroke-width="12"/>
      <circle cx="276" cy="372" r="15" fill="none" stroke="${IVORY_SH}" stroke-width="4"/>
    </g>
    <path d="M 300,240 L 332,262 L 332,520 L 300,520 Z" fill="#fff2b8" opacity="0.55"/>
    <path d="M 404,150 L 404,330" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
    <path d="M 404,150 L 404,330" stroke="${IVORY}" stroke-width="10" stroke-linecap="round"/>
    <path d="M 374,320 L 404,366 L 434,320 Z" fill="${IVORY}" ${OL} stroke-width="7"/>
  </g>`;
}

export const EMBLEMS: Record<string, () => string> = {
  hand: emblemHand,
  angel: emblemAngel,
  scry: emblemScry,
  parry: emblemParry,
  bounty: emblemBounty,
  slip: emblemSlip,
  brawl: emblemBrawl,
  pickpocket: emblemPickpocket,
  backdoor: emblemBackdoor,
};

export function crestHooded(color = '#e6c56a'): string {
  // Small hooded silhouette used on the card back medallion.
  return `
    <path d="M 262,214 C 230,226 196,272 192,326 C 188,366 202,392 222,404 L 278,404 C 298,392 312,366 308,326 C 304,282 284,242 262,214 Z" fill="${color}"/>
    <path d="M 160,470 C 170,430 200,410 230,402 L 270,402 C 300,410 330,430 340,470 Z" fill="${color}"/>
    <path d="M 250,280 C 226,284 214,306 216,334 C 218,362 232,380 250,384 C 268,380 282,362 284,334 C 286,306 274,284 250,280 Z" fill="#1a0507"/>
    <path d="M 232,332 C 238,326 246,328 248,336 C 242,338 236,337 232,332 Z M 268,332 C 262,326 254,328 252,336 C 258,338 264,337 268,332 Z" fill="#ffcf5a"/>`;
}
