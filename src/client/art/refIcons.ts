// Card icons drawn after the owner's reference screenshots (changed slightly): flat white shapes with details cut out
// in the card's inner colour, no shading. Coordinates are in the final card space (500 x 700), measured off the
// screenshots; `fin` undoes the 1.13 icon scale the card face applies around (250, 350).
import type { Pal } from './cartoon';

const W = '#fbf9f4';
const f = (n: number) => n.toFixed(1);
const fin = (s: string) => `<g transform="translate(250,350) scale(${(1 / 1.13).toFixed(5)}) translate(-250,-350)">${s}</g>`;

/** A rounded-rectangle subpath. */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  return `M ${f(x + r)},${f(y)} H ${f(x + w - r)} A ${f(r)},${f(r)} 0 0 1 ${f(x + w)},${f(y + r)} V ${f(y + h - r)} A ${f(r)},${f(r)} 0 0 1 ${f(x + w - r)},${f(y + h)} H ${f(x + r)} A ${f(r)},${f(r)} 0 0 1 ${f(x)},${f(y + h - r)} V ${f(y + r)} A ${f(r)},${f(r)} 0 0 1 ${f(x + r)},${f(y)} Z`;
}

// ------------------------------------------------------------------------------------------- Shackles

/** A heavy chain crossing the card corner to corner; links grow toward the viewer, flat ones open, edge-on ones bars. */
export function shackles(p: Pal): string {
  const A = { x: 10, y: 0 };
  const B = { x: 560, y: 730 };
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  const ang = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  let out = '';
  let t = 0.02;
  let i = 0;
  while (t < 1.02) {
    const s = 0.62 + 0.8 * t;
    const L = 236 * s;
    const x = A.x + (B.x - A.x) * t;
    const y = A.y + (B.y - A.y) * t;
    if (i % 2 === 0) {
      // Seen flat: a ring with a slot through it.
      const Wd = 124 * s;
      const hole = rr(-L / 2 + Wd * 0.34, -Wd * 0.16, L - Wd * 0.68, Wd * 0.32, Wd * 0.16);
      out += `<path transform="translate(${f(x)},${f(y)}) rotate(${f(ang - 6)})" d="${rr(-L / 2, -Wd / 2, L, Wd, Wd / 2)} ${hole}" fill-rule="evenodd" fill="${W}" stroke="${p.B}" stroke-width="${f(7 * s)}" paint-order="stroke"/>`;
    } else {
      // Edge on: a thick bar through the neighbours' slots.
      const Wd = 46 * s;
      out += `<path transform="translate(${f(x)},${f(y)}) rotate(${f(ang + 4)})" d="${rr(-L / 2, -Wd / 2, L, Wd, Wd / 2)}" fill="${W}" stroke="${p.B}" stroke-width="${f(8 * s)}" paint-order="stroke"/>`;
    }
    t += (L * 0.56) / len;
    i++;
  }
  return fin(out);
}

// ------------------------------------------------------------------------------------------- Parry

/** A raised hand: stop. */
export function parry(_p: Pal): string {
  return fin(`<g fill="${W}">
    <rect x="167" y="160" width="48" height="230" rx="24"/>
    <rect x="228" y="148" width="48" height="242" rx="24"/>
    <rect x="289" y="172" width="46" height="220" rx="23"/>
    <rect x="348" y="226" width="44" height="170" rx="22"/>
    <path d="M 167,330 L 392,330 L 392,470 C 392,525 350,555 295,555 L 240,555 C 205,555 185,535 168,510 L 82,456 C 56,440 52,410 72,398 C 92,386 122,398 167,422 Z"/>
  </g>`);
}

// ------------------------------------------------------------------------------------------- Dice (Tavern Brawl, Staged Brawl)

/** A die in a three-quarter view: three white faces with gaps between them, pips in `pip`. */
function die(cx: number, cy: number, s: number, rot: number, face: string, pip: string, halo: string): string {
  const c = 0.866;
  const faces: Array<{ m: number[]; pips: Array<[number, number]> }> = [
    { m: [s * c, s / 2, s * c, -s / 2, -s * c, -s / 2], pips: [[0.5, 0.5]] },
    { m: [s * c, s / 2, 0, s, -s * c, -s / 2], pips: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]] },
    { m: [s * c, -s / 2, 0, s, 0, 0], pips: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73], [0.5, 0.5]] },
  ];
  const hex = [[0, -s], [s * c, -s / 2], [s * c, s / 2], [0, s], [-s * c, s / 2], [-s * c, -s / 2]].map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
  const body = faces
    .map(
      ({ m, pips }) =>
        `<g transform="matrix(${m.map(f).join(',')})"><rect x="0.05" y="0.05" width="0.9" height="0.9" rx="0.15" fill="${face}"/>${pips.map(([u, v]) => `<circle cx="${u}" cy="${v}" r="0.095" fill="${pip}"/>`).join('')}</g>`
    )
    .join('');
  return `<g transform="translate(${f(cx)},${f(cy)}) rotate(${rot})"><polygon points="${hex}" fill="${halo}" stroke="${halo}" stroke-width="${f(s * 0.16)}" stroke-linejoin="round"/>${body}</g>`;
}

export function brawl(p: Pal): string {
  return fin(die(176, 268, 114, -16, W, p.B, p.B) + die(322, 402, 136, 12, W, p.B, p.B));
}

/** Staged Brawl: the same dice, in grey. */
export function feint(p: Pal): string {
  return fin(die(176, 268, 114, -16, '#c9c9cf', '#26262c', p.B) + die(322, 402, 136, 12, '#c9c9cf', '#26262c', p.B));
}

// ------------------------------------------------------------------------------------------- Dragon's Breath

/** A flame tongue from a base (width w) to a tip, bowed sideways by `bend`. */
function tongue(bx: number, by: number, tx: number, ty: number, w: number, bend: number): string {
  const dx = tx - bx;
  const dy = ty - by;
  const l = Math.hypot(dx, dy);
  const nx = -dy / l;
  const ny = dx / l;
  const mx = bx + dx * 0.55 + nx * bend;
  const my = by + dy * 0.55 + ny * bend;
  const l0 = [bx + (nx * w) / 2, by + (ny * w) / 2];
  const r0 = [bx - (nx * w) / 2, by - (ny * w) / 2];
  return `<path d="M ${f(l0[0])},${f(l0[1])} Q ${f(mx + nx * w * 0.45)},${f(my + ny * w * 0.45)} ${f(tx)},${f(ty)} Q ${f(mx - nx * w * 0.15)},${f(my - ny * w * 0.15)} ${f(r0[0])},${f(r0[1])} Z"/>`;
}

/** A spiral stroke (an Archimedean curl). */
function spiral(cx: number, cy: number, r0: number, r1: number, turns: number, a0: number): string {
  const pts: string[] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = a0 + k * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * k;
    pts.push(`${f(cx + Math.cos(a) * r)},${f(cy + Math.sin(a) * r)}`);
  }
  return `M ${pts.join(' L ')}`;
}

/** A white fire-drake: a curling body, a spiral cheek and flame tongues licking up and to the right. */
export function breath(p: Pal): string {
  return fin(`<g fill="${W}">
    <path d="M 118,382 C 112,298 186,246 272,252 C 346,258 396,300 418,356 C 380,326 330,312 286,318 C 236,326 206,352 202,392 C 198,440 246,470 306,462 C 262,504 164,506 132,452 C 122,434 119,410 118,382 Z"/>
    ${tongue(230, 292, 288, 172, 62, 36)}
    ${tongue(318, 290, 444, 202, 70, 30)}
    ${tongue(372, 336, 452, 300, 58, 22)}
    ${tongue(368, 392, 440, 420, 54, -22)}
    ${tongue(262, 468, 352, 578, 70, -38)}
    ${tongue(176, 470, 104, 520, 50, 30)}
  </g>
  <path d="${spiral(150, 330, 62, 6, 1.6, -1.2)}" fill="none" stroke="${p.B}" stroke-width="40" stroke-linecap="round"/>
  <path d="${spiral(150, 330, 62, 6, 1.6, -1.2)}" fill="none" stroke="${W}" stroke-width="24" stroke-linecap="round"/>
  <path d="${spiral(330, 530, 34, 4, 1.2, 0.6)}" fill="none" stroke="${p.B}" stroke-width="30" stroke-linecap="round"/>
  <path d="${spiral(330, 530, 34, 4, 1.2, 0.6)}" fill="none" stroke="${W}" stroke-width="18" stroke-linecap="round"/>
  <ellipse cx="292" cy="280" rx="15" ry="9" transform="rotate(-25 292 280)" fill="${p.B}"/>`);
}

// ------------------------------------------------------------------------------------------- Slip Away

/** A running figure, leaning into a sprint. */
export function slip(_p: Pal): string {
  return fin(`<g fill="none" stroke="${W}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 262,262 L 214,390" stroke-width="66"/>
    <path d="M 266,280 L 336,312 L 436,300" stroke-width="46"/>
    <path d="M 250,280 L 182,292 L 124,334" stroke-width="44"/>
    <path d="M 212,398 L 146,436 L 62,480" stroke-width="50"/>
    <path d="M 220,404 L 296,486 L 254,612 L 300,622" stroke-width="50"/>
  </g>
  <ellipse cx="290" cy="186" rx="38" ry="46" transform="rotate(24 290 186)" fill="${W}"/>`);
}

// ------------------------------------------------------------------------------------------- Looking Glass

/** A hand mirror: a white frame around dark glass with three bright streaks of reflection. */
export function glass(p: Pal): string {
  const x = 100;
  const y = 124;
  const w = 288;
  const h = 462;
  const ix = x + 18;
  const iy = y + 18;
  const iw = w - 36;
  const ih = h - 36;
  // Dark bands between the streaks: regions c0 <= v + 1.15 u <= c1 in the glass's own (u, v).
  const band = (c0: number, c1: number) => {
    const k = 1.15;
    const pt = (u: number, c: number) => `${f(ix + u)},${f(iy + c - k * u)}`;
    return `<polygon points="${pt(-60, c0)} ${pt(iw + 60, c0)} ${pt(iw + 60, c1)} ${pt(-60, c1)}" fill="${p.B}"/>`;
  };
  return fin(`<defs><clipPath id="glassIn"><path d="${rr(ix, iy, iw, ih, 16)}"/></clipPath></defs>
    <path d="${rr(x, y, w, h, 30)}" fill="${W}"/>
    <path d="${rr(ix, iy, iw, ih, 16)}" fill="${p.B}"/>
    <g clip-path="url(#glassIn)">
      <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="${W}"/>
      ${band(112, 236)}${band(318, 540)}${band(578, 616)}${band(656, 760)}
    </g>`);
}

// ------------------------------------------------------------------------------------------- Pickpocket

/** A hand reaching in from the side, a card slipping from its fingers. */
export function pickpocket(p: Pal): string {
  // Fingers back to front, each edged in the card colour so they read apart.
  const finger = (x0: number, y0: number, x1: number, y1: number, w: number) =>
    `<path d="M ${x0},${y0} L ${x1},${y1}" stroke="${p.B}" stroke-width="${w + 12}" stroke-linecap="round"/><path d="M ${x0},${y0} L ${x1},${y1}" stroke="${W}" stroke-width="${w}" stroke-linecap="round"/>`;
  return fin(`<g fill="none">
    ${finger(330, 236, 262, 318, 36)}
    ${finger(312, 226, 232, 306, 38)}
    ${finger(296, 214, 206, 288, 40)}
    ${finger(352, 250, 314, 326, 38)}
  </g>
  <path d="M 540,164 C 480,160 420,160 376,168 C 330,176 292,192 268,214 C 300,250 346,268 392,262 C 440,256 490,250 540,250 Z" fill="${W}"/>
  <rect x="-62" y="-82" width="124" height="164" rx="12" transform="translate(212,470) rotate(-22)" fill="${W}"/>`);
}

// ------------------------------------------------------------------------------------------- Scrying Orb

/** A small curled flame (s: size; flip mirrors the curl). */
function wisp(x: number, y: number, s: number, flip = false, rot = 0): string {
  return `<path transform="translate(${f(x)},${f(y)}) rotate(${rot}) scale(${f(flip ? -s : s)},${f(s)})" d="M 0,0.5 C -0.46,0.5 -0.52,0.04 -0.22,-0.26 C -0.06,-0.42 0.06,-0.58 -0.06,-0.8 C 0.36,-0.58 0.48,-0.12 0.36,0.2 C 0.28,0.42 0.18,0.5 0,0.5 Z" fill="${W}"/>`;
}

/** An all-seeing eye with a spiralling iris, ringed by spirit flames. */
export function scry(p: Pal): string {
  return fin(`<path d="M 58,360 Q 248,196 440,360 Q 248,524 58,360 Z" fill="${W}"/>
    <circle cx="249" cy="361" r="74" fill="${p.B}"/>
    <path d="${spiral(249, 361, 6, 52, 1.35, 0.4)}" fill="none" stroke="${W}" stroke-width="15" stroke-linecap="round"/>
    ${wisp(108, 246, 62, true, -8)}
    ${wisp(372, 222, 66, false, 6)}
    ${wisp(84, 494, 44, true, -12)}${wisp(122, 500, 50, false, 4)}
    ${wisp(358, 496, 84, false, 0)}`);
}

// ------------------------------------------------------------------------------------------- Misdirection

/** Points of an arrow from `tail` to `tip`: [tailL, headBaseL, headL, tip, headR, headBaseR, tailR]. */
function arrowPts(tx0: number, ty0: number, tx1: number, ty1: number, shaft: number, head: number, headLen: number): Array<[number, number]> {
  const dx = tx1 - tx0;
  const dy = ty1 - ty0;
  const l = Math.hypot(dx, dy);
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const bx = tx1 - ux * headLen;
  const by = ty1 - uy * headLen;
  return [
    [tx0 + (nx * shaft) / 2, ty0 + (ny * shaft) / 2],
    [bx + (nx * shaft) / 2, by + (ny * shaft) / 2],
    [bx + (nx * head) / 2, by + (ny * head) / 2],
    [tx1, ty1],
    [bx - (nx * head) / 2, by - (ny * head) / 2],
    [bx - (nx * shaft) / 2, by - (ny * shaft) / 2],
    [tx0 - (nx * shaft) / 2, ty0 - (ny * shaft) / 2],
  ];
}

/** Blame passed on: a hollow arrow back up the way it came, a solid one off in a new direction. */
export function misdirect(_p: Pal): string {
  const hollow = arrowPts(272, 238, 62, 116, 62, 168, 108);
  const solid = arrowPts(236, 318, 458, 502, 80, 196, 124);
  const line = hollow.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
  return fin(`<polyline points="${line}" fill="none" stroke="${W}" stroke-width="13" stroke-linejoin="miter"/>
    <polygon points="${solid.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${W}"/>`);
}

// ------------------------------------------------------------------------------------------- Turnabout

/** Two curved arrows chasing each other round an oval: the order of play reverses. */
export function turnabout(_p: Pal): string {
  const half = (a0: number, a1: number) => {
    // A tapering arc along the circle r = 200 (squashed into an oval by the group), with an arrowhead at a1.
    const r = 200;
    const rad = (d: number) => (d * Math.PI) / 180;
    const n = 24;
    const outer: string[] = [];
    const inner: string[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const a = rad(a0 + (a1 - a0) * k);
      const w = 10 + 36 * Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.5);
      outer.push(`${f(250 + Math.cos(a) * (r + w))},${f(360 + Math.sin(a) * (r + w))}`);
      inner.push(`${f(250 + Math.cos(a) * (r - w))},${f(360 + Math.sin(a) * (r - w))}`);
    }
    const ae = rad(a1);
    const tip = rad(a1 + 30);
    const head = `${f(250 + Math.cos(ae) * (r + 96))},${f(360 + Math.sin(ae) * (r + 96))} ${f(250 + Math.cos(tip) * r)},${f(360 + Math.sin(tip) * r)} ${f(250 + Math.cos(ae) * (r - 96))},${f(360 + Math.sin(ae) * (r - 96))}`;
    return `<polygon points="${outer.join(' ')} ${inner.reverse().join(' ')}" fill="${W}"/><polygon points="${head}" fill="${W}"/>`;
  };
  return fin(`<g transform="translate(250,360) rotate(24) scale(0.6,1) translate(-250,-360)">${half(110, 236)}${half(290, 416)}</g>`);
}

// ------------------------------------------------------------------------------------------- Back Door

/** A stack of cards with an arrow pushing up from beneath: draw from the bottom. */
export function backdoor(p: Pal): string {
  const corners: Array<[number, number]> = [
    [92, 292],
    [286, 206],
    [418, 290],
    [224, 378],
  ];
  let layers = '';
  for (let i = 4; i >= 0; i--) {
    const pts = corners.map(([x, y]) => `${x},${y + i * 22}`).join(' ');
    layers += `<polygon points="${pts}" fill="${p.B}" stroke="${p.B}" stroke-width="30" stroke-linejoin="round"/><polygon points="${pts}" fill="${W}" stroke="${W}" stroke-width="18" stroke-linejoin="round"/>`;
  }
  return fin(`${layers}
    <polygon points="248,476 296,526 268,526 268,592 228,592 228,526 200,526" fill="${W}" stroke="${W}" stroke-width="8" stroke-linejoin="round"/>`);
}
