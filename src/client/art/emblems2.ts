// Emblems for the expansion cards (original artwork), same 500x700 card space and ink/ivory style.
import { DL, f, INK, IVORY, IVORY_SH, OL, rad, sparkle, sword, THIN } from './emblems';

const CREAM = '#fffaf0';

function flame(x: number, y: number, h: number, w: number, lean = 0, fill = IVORY, op = 1): string {
  // A single flame tongue rising from (x,y) with height h and half-width w.
  const tx = x + lean * h;
  const ty = y - h;
  return `<path d="M ${f(x - w)},${f(y)} C ${f(x - w * 1.1)},${f(y - h * 0.45)} ${f(tx - w * 0.5)},${f(y - h * 0.6)} ${f(tx)},${f(ty)} C ${f(tx + w * 0.25)},${f(y - h * 0.55)} ${f(x + w * 1.2)},${f(y - h * 0.4)} ${f(x + w)},${f(y)} Q ${f(x)},${f(y + w * 0.5)} ${f(x - w)},${f(y)} Z" fill="${fill}" opacity="${op}" ${OL} stroke-width="6"/>`;
}

export function emblemBreath(): string {
  const spines = [0, 1, 2, 3, 4]
    .map((i) => {
      const x = 146 - i * 14;
      const y = 380 + i * 32;
      return `<path d="M ${x},${y} L ${x - 30},${y + 6} L ${x - 6},${y + 26} Z" fill="${IVORY_SH}" ${OL} stroke-width="5"/>`;
    })
    .join('');
  const teethUp = [0, 1, 2, 3].map((i) => `<path d="M ${246 + i * 13},${276 - i * 3} l 6,14 l 6,-15 Z" fill="${CREAM}" stroke="${INK}" stroke-width="3"/>`).join('');
  const teethLo = [0, 1, 2, 3].map((i) => `<path d="M ${238 + i * 14},${328 - i * 3} l 6,-14 l 6,13 Z" fill="${CREAM}" stroke="${INK}" stroke-width="3"/>`).join('');
  const embers = [
    [430, 190, 7],
    [452, 260, 5],
    [446, 430, 6],
    [400, 470, 4],
    [372, 168, 5],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffe2a0" stroke="${INK}" stroke-width="2.5"/>`)
    .join('');
  return `
  <g>
    <path d="M 296,286 C 330,262 360,214 404,188 C 392,228 420,236 446,232 C 426,262 444,282 466,292 C 438,306 446,334 468,352 C 436,356 430,384 440,414 C 406,400 384,412 372,432 C 362,388 336,336 296,306 Z" fill="${IVORY}" ${OL}/>
    <path d="M 304,292 C 336,280 360,248 388,232 C 384,258 402,266 420,268 C 406,286 418,300 432,308 C 414,318 418,336 430,350 C 406,350 398,366 400,384 C 380,370 352,334 304,302 Z" fill="#ffd27a" stroke="${INK}" stroke-width="4"/>
    <path d="M 316,296 C 340,290 362,274 380,264 C 378,284 392,292 404,296 C 392,306 396,320 404,330 C 384,328 360,316 316,300 Z" fill="${CREAM}"/>
    <g transform="translate(392,318) rotate(22)">
      <rect x="-26" y="-36" width="52" height="72" rx="6" fill="${IVORY}" ${OL} stroke-width="5"/>
      <path d="M -26,-6 C -14,-16 -4,2 8,-6 C 16,-12 22,2 26,-4 L 26,36 L -26,36 Z" fill="#2a120a" opacity="0.85"/>
    </g>
    <path d="M 190,216 C 172,190 150,168 112,150 C 140,180 152,200 160,226 Z M 222,212 C 214,184 200,160 168,136 C 186,168 192,190 196,214 Z" fill="${IVORY_SH}" ${OL} stroke-width="6"/>
    <path d="M 70,540 C 70,450 110,400 150,370 C 135,340 128,300 138,270 C 150,236 180,214 214,212 C 246,210 280,224 304,244 C 314,252 312,262 300,266 L 238,280 L 300,302 C 308,306 306,316 296,318 L 226,332 C 214,352 196,370 178,380 C 160,420 150,470 152,540 Z" fill="${IVORY}" ${OL}/>
    ${spines}
    ${teethUp}${teethLo}
    <path d="M 226,236 C 236,226 254,226 262,238 C 252,246 236,246 226,236 Z" fill="#ffcf5a" stroke="${INK}" stroke-width="4"/>
    <path d="M 244,229 L 244,245" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M 220,224 L 266,226" ${DL} stroke-width="6"/>
    <ellipse cx="290" cy="250" rx="5" ry="3" fill="${INK}"/>
    <path d="M 150,300 C 166,320 186,330 206,332 M 138,350 C 150,362 160,366 172,368" ${DL} opacity="0.45"/>
    <path d="M 120,440 C 126,470 128,500 128,530" ${DL} opacity="0.4"/>
    ${embers}
  </g>`;
}

export function emblemGlass(): string {
  const knobs = Array.from({ length: 10 }, (_, i) => {
    const a = rad(i * 36 - 90);
    return `<circle cx="${f(250 + Math.cos(a) * 118)}" cy="${f(270 + Math.sin(a) * 146)}" r="9" fill="${IVORY}" ${OL} stroke-width="5"/>`;
  }).join('');
  return `
  <g>
    <path d="M 238,398 L 222,500 C 220,514 236,522 248,512 L 268,400 Z" fill="${IVORY_SH}" ${OL}/>
    <path d="M 224,440 L 262,446 M 220,470 L 258,476" ${DL}/>
    <circle cx="232" cy="522" r="16" fill="${IVORY}" ${OL} stroke-width="7"/>
    <ellipse cx="250" cy="270" rx="118" ry="146" fill="${IVORY}" ${OL}/>
    ${knobs}
    <ellipse cx="250" cy="270" rx="92" ry="118" fill="url(#mirrorgrad)" ${OL} stroke-width="6"/>
    <g opacity="0.55">
      <rect x="214" y="214" width="72" height="104" rx="8" fill="#fff" stroke="${INK}" stroke-width="3" transform="rotate(-8 250 266)"/>
      <path d="M 250,236 L 264,262 L 250,296 L 236,262 Z" fill="${INK}" opacity="0.5" transform="rotate(-8 250 266)"/>
    </g>
    <path d="M 186,206 L 226,170 M 180,240 L 248,180 M 284,352 L 318,320" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
    <path d="M 250,124 C 236,104 264,96 250,80 M 250,416 L 250,404" ${DL}/>
    ${sparkle(380, 180, 18, '#fff')}${sparkle(116, 360, 14, '#fff')}${sparkle(370, 400, 10, '#fff', 0.7)}
  </g>`;
}

export function emblemShackles(): string {
  const cuff = (x: number, y: number, r: number) => `
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK}" stroke-width="34"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${IVORY_SH}" stroke-width="22"/>
    <circle cx="${x}" cy="${y}" r="${r + 7}" fill="none" stroke="#fff" stroke-width="3" opacity="0.6"/>
    ${[0, 90, 180, 270].map((a) => `<circle cx="${f(x + Math.cos(rad(a + 20)) * r)}" cy="${f(y + Math.sin(rad(a + 20)) * r)}" r="5" fill="${INK}"/>`).join('')}`;
  const links = [
    [206, 312, 30],
    [228, 340, -30],
    [250, 352, 90],
    [272, 340, 30],
    [294, 312, -30],
  ]
    .map(
      ([x, y, r]) =>
        `<ellipse cx="${x}" cy="${y}" rx="11" ry="20" transform="rotate(${r} ${x} ${y})" fill="none" stroke="${INK}" stroke-width="15"/><ellipse cx="${x}" cy="${y}" rx="11" ry="20" transform="rotate(${r} ${x} ${y})" fill="none" stroke="${IVORY}" stroke-width="6"/>`
    )
    .join('');
  return `
  <g>
    ${cuff(160, 250, 62)}
    ${cuff(340, 250, 62)}
    ${links}
    <path d="M 220,418 C 220,370 280,370 280,418" fill="none" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>
    <path d="M 220,418 C 220,370 280,370 280,418" fill="none" stroke="${IVORY_SH}" stroke-width="12" stroke-linecap="round"/>
    <rect x="190" y="412" width="120" height="104" rx="16" fill="${IVORY}" ${OL}/>
    <circle cx="250" cy="452" r="14" fill="${INK}"/>
    <path d="M 244,456 L 240,490 L 260,490 L 256,456 Z" fill="${INK}"/>
    <path d="M 200,424 L 300,424" stroke="#fff" stroke-width="5" opacity="0.6"/>
  </g>`;
}

export function emblemMisdirect(): string {
  return `
  <g>
    <g transform="translate(372,198)">
      <circle r="62" fill="${IVORY}" ${OL}/>
      <circle r="42" fill="#b3261e" ${OL} stroke-width="6"/>
      <circle r="22" fill="${IVORY}" ${OL} stroke-width="5"/>
      <circle r="6" fill="${INK}"/>
    </g>
    <path d="M 110,500 L 210,360 C 240,318 300,320 312,360 C 322,396 286,420 262,398 C 240,378 262,330 300,300 L 344,248" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 110,500 L 210,360 C 240,318 300,320 312,360 C 322,396 286,420 262,398 C 240,378 262,330 300,300 L 344,248" fill="none" stroke="${IVORY}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 320,232 L 376,194 L 360,262 Z" fill="${IVORY}" ${OL} stroke-width="7"/>
    <path d="M 110,500 L 84,486 M 110,500 L 102,528 M 128,476 L 100,462 M 128,476 L 120,504" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M 150,230 C 120,250 108,290 118,320 M 160,190 C 112,200 84,250 92,300" stroke="${IVORY}" stroke-width="7" fill="none" opacity="0.5" stroke-linecap="round"/>
    <g transform="translate(150,360) rotate(-12)">
      <path d="M -46,-30 C -30,-50 30,-50 46,-30 C 54,0 34,34 0,44 C -34,34 -54,0 -46,-30 Z" fill="${IVORY}" ${OL} stroke-width="7"/>
      <path d="M -28,-12 C -20,-20 -8,-18 -6,-8 C -16,-4 -24,-4 -28,-12 Z M 28,-12 C 20,-20 8,-18 6,-8 C 16,-4 24,-4 28,-12 Z" fill="${INK}"/>
      <path d="M -18,18 C -6,28 6,28 18,18" ${DL}/>
    </g>
    ${sparkle(428, 300, 14, '#fff7d6')}${sparkle(300, 150, 11, '#fff7d6', 0.7)}
  </g>`;
}

export function emblemTurnabout(): string {
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = rad(i * 45);
    return `<path d="M ${f(250 + Math.cos(a) * 22)},${f(310 + Math.sin(a) * 22)} L ${f(250 + Math.cos(a) * 92)},${f(310 + Math.sin(a) * 92)}" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M ${f(250 + Math.cos(a) * 22)},${f(310 + Math.sin(a) * 22)} L ${f(250 + Math.cos(a) * 92)},${f(310 + Math.sin(a) * 92)}" stroke="${IVORY_SH}" stroke-width="7" stroke-linecap="round"/>`;
  }).join('');
  const arrow = (start: number) => {
    const R = 150;
    const a0 = rad(start);
    const a1 = rad(start + 140);
    const x0 = 250 + Math.cos(a0) * R;
    const y0 = 310 + Math.sin(a0) * R;
    const x1 = 250 + Math.cos(a1) * R;
    const y1 = 310 + Math.sin(a1) * R;
    // Arrow head at the end (counter-clockwise travel means we draw from a1 back to a0).
    const tx = -Math.sin(a0);
    const ty = Math.cos(a0);
    const nx = Math.cos(a0);
    const ny = Math.sin(a0);
    const hx = x0 - tx * 34;
    const hy = y0 - ty * 34;
    return `<path d="M ${f(x1)},${f(y1)} A ${R} ${R} 0 0 0 ${f(x0)},${f(y0)}" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>
      <path d="M ${f(x1)},${f(y1)} A ${R} ${R} 0 0 0 ${f(x0)},${f(y0)}" fill="none" stroke="${IVORY}" stroke-width="15" stroke-linecap="round"/>
      <path d="M ${f(hx)},${f(hy)} L ${f(x0 + nx * 34)},${f(y0 + ny * 34)} L ${f(x0 - nx * 34)},${f(y0 - ny * 34)} Z" fill="${IVORY}" ${OL} stroke-width="7"/>`;
  };
  return `
  <g>
    <circle cx="250" cy="310" r="104" fill="none" stroke="${INK}" stroke-width="30"/>
    <circle cx="250" cy="310" r="104" fill="none" stroke="${IVORY}" stroke-width="16"/>
    ${spokes}
    <circle cx="250" cy="310" r="28" fill="${IVORY}" ${OL} stroke-width="7"/>
    <circle cx="250" cy="310" r="9" fill="${INK}"/>
    ${arrow(-60)}
    ${arrow(120)}
  </g>`;
}

export function emblemAegis(): string {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = rad(i * 22.5);
    const r1 = i % 2 ? 40 : 34;
    const r2 = i % 2 ? 70 : 86;
    return `<path d="M ${f(250 + Math.cos(a - 0.12) * r1)},${f(310 + Math.sin(a - 0.12) * r1)} L ${f(250 + Math.cos(a) * r2)},${f(310 + Math.sin(a) * r2)} L ${f(250 + Math.cos(a + 0.12) * r1)},${f(310 + Math.sin(a + 0.12) * r1)} Z" fill="url(#gold)" stroke="${INK}" stroke-width="3"/>`;
  }).join('');
  const rivets = Array.from({ length: 16 }, (_, i) => {
    const a = rad(i * 22.5);
    return `<circle cx="${f(250 + Math.cos(a) * 140)}" cy="${f(310 + Math.sin(a) * 140)}" r="6" fill="${INK}" opacity="0.75"/>`;
  }).join('');
  const laurel = (side: number) =>
    Array.from({ length: 7 }, (_, i) => {
      const a = rad(110 + i * 14) * 1;
      const x = 250 + side * Math.cos(a) * 178;
      const y = 330 + Math.sin(a) * 178;
      return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="20" transform="rotate(${f(side * (i * 14 + 20))} ${f(x)} ${f(y)})" fill="${IVORY}" ${OL} stroke-width="4"/>`;
    }).join('');
  return `
  <g>
    <circle cx="250" cy="310" r="190" fill="#fff6d0" opacity="0.12"/>
    ${laurel(1)}${laurel(-1)}
    <circle cx="250" cy="310" r="154" fill="${IVORY}" ${OL}/>
    <circle cx="250" cy="310" r="126" fill="${IVORY_SH}" ${OL} stroke-width="5"/>
    ${rivets}
    ${rays}
    <circle cx="250" cy="310" r="34" fill="url(#gold)" ${OL} stroke-width="6"/>
    <path d="M 160,220 C 190,190 220,178 250,176" stroke="#fff" stroke-width="10" fill="none" opacity="0.6" stroke-linecap="round"/>
  </g>`;
}

export function emblemWarband(): string {
  const spear = (x: number, rot: number) => `<g transform="translate(${x},520) rotate(${rot})">
      <rect x="-7" y="-380" width="14" height="380" rx="5" fill="${IVORY_SH}" ${OL} stroke-width="6"/>
      <path d="M 0,-440 L 20,-388 L 0,-372 L -20,-388 Z" fill="${IVORY}" ${OL} stroke-width="6"/>
      <path d="M -18,-372 L 18,-372" stroke="${INK}" stroke-width="8"/>
    </g>`;
  return `
  <g>
    ${spear(170, -14)}
    ${spear(330, 14)}
    <rect x="240" y="150" width="20" height="380" rx="6" fill="${IVORY_SH}" ${OL} stroke-width="7"/>
    <circle cx="250" cy="146" r="16" fill="url(#gold)" ${OL} stroke-width="6"/>
    <path d="M 260,172 L 412,172 C 404,206 404,236 412,268 L 412,380 L 380,350 L 348,380 L 348,380 L 260,380 Z" fill="${IVORY}" ${OL}/>
    <path d="M 260,172 L 412,172 L 412,192 L 260,192 Z" fill="url(#fieldsolid)" opacity="0.8"/>
    ${[0, 1, 2].map((i) => `<g transform="translate(${290 + i * 36},${300}) rotate(180)"><path d="M -5,0 L -4,-62 L 0,-78 L 4,-62 L 5,0 Z" fill="${INK}"/><rect x="-14" y="0" width="28" height="7" rx="3" fill="${INK}"/><rect x="-3" y="7" width="6" height="18" fill="${INK}"/></g>`).join('')}
    <path d="M 270,206 C 320,214 370,210 404,202" ${DL} opacity="0.4"/>
    <text x="250" y="580" font-size="1" fill="none">.</text>
  </g>`;
}

export function emblemPrivateer(): string {
  return `
  <g>
    ${sword(150, 470, 38, 300)}
    ${sword(350, 470, -38, 300)}
    <circle cx="250" cy="150" r="30" fill="none" stroke="${INK}" stroke-width="26"/>
    <circle cx="250" cy="150" r="30" fill="none" stroke="${IVORY}" stroke-width="12"/>
    <rect x="236" y="176" width="28" height="300" rx="10" fill="${IVORY}" ${OL}/>
    <rect x="164" y="214" width="172" height="28" rx="12" fill="${IVORY}" ${OL}/>
    <circle cx="164" cy="228" r="14" fill="${IVORY}" ${OL} stroke-width="6"/>
    <circle cx="336" cy="228" r="14" fill="${IVORY}" ${OL} stroke-width="6"/>
    <path d="M 128,390 C 140,470 200,506 250,506 C 300,506 360,470 372,390" fill="none" stroke="${INK}" stroke-width="34" stroke-linecap="round"/>
    <path d="M 128,390 C 140,470 200,506 250,506 C 300,506 360,470 372,390" fill="none" stroke="${IVORY}" stroke-width="18" stroke-linecap="round"/>
    <path d="M 104,410 L 128,360 L 156,404 Z M 396,410 L 372,360 L 344,404 Z" fill="${IVORY}" ${OL} stroke-width="7"/>
    <path d="M 236,250 C 200,270 200,300 236,310 C 270,320 290,350 264,372 C 240,392 214,380 236,410" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    <path d="M 236,250 C 200,270 200,300 236,310 C 270,320 290,350 264,372 C 240,392 214,380 236,410" fill="none" stroke="#c9a46a" stroke-width="5" stroke-linecap="round"/>
    ${sparkle(396, 160, 16, '#fff7d6')}
  </g>`;
}

export function emblemSands(): string {
  return `
  <g>
    <path d="M 120,300 A 150 150 0 1 1 196,440" fill="none" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>
    <path d="M 120,300 A 150 150 0 1 1 196,440" fill="none" stroke="${IVORY}" stroke-width="12" stroke-linecap="round"/>
    <path d="M 92,330 L 120,280 L 150,330 Z" fill="${IVORY}" ${OL} stroke-width="7"/>
    <rect x="166" y="150" width="168" height="26" rx="10" fill="${IVORY_SH}" ${OL}/>
    <rect x="166" y="452" width="168" height="26" rx="10" fill="${IVORY_SH}" ${OL}/>
    <path d="M 190,176 C 190,250 238,282 238,314 C 238,346 190,378 190,452 L 310,452 C 310,378 262,346 262,314 C 262,282 310,250 310,176 Z" fill="#eaf4ff" fill-opacity="0.5" ${OL}/>
    <path d="M 200,190 L 300,190 C 296,230 270,262 254,290 L 246,290 C 230,262 204,230 200,190 Z" fill="#e2b768" ${OL} stroke-width="4"/>
    <path d="M 212,442 C 230,420 270,420 288,442 Z" fill="#e2b768" ${OL} stroke-width="4"/>
    ${[0, 1, 2, 3].map((i) => `<circle cx="250" cy="${300 + i * 30}" r="3.5" fill="#e2b768" stroke="${INK}" stroke-width="1.5"/>`).join('')}
    <path d="M 176,176 L 176,452 M 324,176 L 324,452" stroke="${INK}" stroke-width="12"/>
    <path d="M 176,176 L 176,452 M 324,176 L 324,452" stroke="${IVORY_SH}" stroke-width="5"/>
    <path d="M 206,200 C 214,236 232,258 240,272" stroke="#fff" stroke-width="6" fill="none" opacity="0.7" stroke-linecap="round"/>
    ${sparkle(404, 210, 14, '#fff7d6')}${sparkle(380, 440, 10, '#fff7d6', 0.7)}
  </g>`;
}

export function emblemMistletoe(): string {
  const leaf = (x: number, y: number, rot: number, len = 88) =>
    `<g transform="translate(${x},${y}) rotate(${rot})"><path d="M 0,0 C 22,-18 30,-${len * 0.7} 0,-${len} C -30,-${len * 0.7} -22,-18 0,0 Z" fill="${IVORY}" ${OL} stroke-width="7"/><path d="M 0,-8 L 0,-${len - 14}" ${THIN} opacity="0.5"/></g>`;
  const berries = [
    [250, 330],
    [232, 350],
    [268, 352],
    [250, 372],
    [222, 380],
    [280, 384],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="${CREAM}" ${OL} stroke-width="5"/><circle cx="${x - 4}" cy="${y - 5}" r="4" fill="#fff"/>`)
    .join('');
  return `
  <g>
    <path d="M 250,190 L 250,330 M 250,300 C 220,320 190,340 170,380 M 250,300 C 280,320 310,340 330,380" ${DL} stroke-width="9"/>
    ${leaf(170, 380, -130)}${leaf(170, 380, -70, 70)}${leaf(330, 380, 130)}${leaf(330, 380, 70, 70)}${leaf(250, 330, -160, 76)}${leaf(250, 330, 160, 76)}
    ${berries}
    <path d="M 250,196 C 210,150 160,160 172,196 C 182,222 230,210 250,196 Z" fill="#c43a2e" ${OL} stroke-width="7"/>
    <path d="M 250,196 C 290,150 340,160 328,196 C 318,222 270,210 250,196 Z" fill="#c43a2e" ${OL} stroke-width="7"/>
    <path d="M 250,196 L 214,262 L 232,262 L 250,226 L 268,262 L 286,262 Z" fill="#c43a2e" ${OL} stroke-width="6"/>
    <circle cx="250" cy="196" r="14" fill="#a82a20" ${OL} stroke-width="6"/>
    ${sparkle(130, 240, 14, '#fff')}${sparkle(380, 250, 12, '#fff')}${sparkle(380, 470, 9, '#fff', 0.7)}${sparkle(120, 470, 11, '#fff', 0.8)}
  </g>`;
}

export function emblemYule(): string {
  const holly = (x: number, y: number, rot: number) =>
    `<g transform="translate(${x},${y}) rotate(${rot})"><path d="M 0,0 C 10,-10 8,-22 18,-26 C 14,-34 24,-44 30,-40 C 34,-50 46,-52 50,-46 C 40,-30 26,-12 0,0 Z" fill="${IVORY}" ${OL} stroke-width="5"/></g>`;
  return `
  <g>
    ${flame(250, 330, 170, 56, 0.05)}
    ${flame(196, 340, 120, 36, -0.25)}
    ${flame(306, 340, 130, 38, 0.25)}
    ${flame(250, 330, 90, 22, 0, CREAM)}
    <g transform="rotate(-6 250 400)">
      <rect x="104" y="350" width="292" height="104" rx="52" fill="${IVORY_SH}" ${OL}/>
      <ellipse cx="380" cy="402" rx="30" ry="50" fill="${IVORY}" ${OL} stroke-width="7"/>
      <ellipse cx="380" cy="402" rx="16" ry="30" fill="none" ${DL}/>
      <ellipse cx="380" cy="402" rx="5" ry="10" fill="${INK}" opacity="0.6"/>
      <path d="M 130,376 C 180,370 240,380 300,372 M 124,420 C 190,428 250,418 320,428" ${DL} opacity="0.5"/>
      ${holly(190, 356, -20)}${holly(214, 352, 40)}
      <circle cx="204" cy="352" r="9" fill="#c43a2e" ${OL} stroke-width="4"/><circle cx="216" cy="346" r="8" fill="#c43a2e" ${OL} stroke-width="4"/>
    </g>
    ${[
      [150, 200, 6],
      [356, 180, 5],
      [380, 260, 4],
      [120, 290, 5],
      [300, 130, 4],
    ]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffe2a0" stroke="${INK}" stroke-width="2.5"/>`)
      .join('')}
  </g>`;
}

export const EMBLEMS2: Record<string, () => string> = {
  breath: emblemBreath,
  glass: emblemGlass,
  shackles: emblemShackles,
  misdirect: emblemMisdirect,
  turnabout: emblemTurnabout,
  aegis: emblemAegis,
  warband: emblemWarband,
  privateer: emblemPrivateer,
  sands: emblemSands,
  mistletoe: emblemMistletoe,
  yule: emblemYule,
};
