// The flat, chunky "cartoon card" frame shared by card faces, the default back and every sleeve:
// a clean off-white rim around stepped panels of solid colour, each casting a soft shadow on the one
// outside it. No grain, no fine detail: it should read like a game piece. Coordinates: 500x700.

export const RIM_RX = 44;

export function mix(hex: string, other: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/** Stepped panels from the outside in: [x, y, w, h, rx]. */
export const STEPS: Array<[number, number, number, number, number]> = [
  [24, 24, 452, 652, 30],
  [52, 52, 396, 596, 24],
  [82, 82, 336, 536, 19],
  [110, 110, 280, 480, 15],
];

export interface FrameOpts {
  color: string;
  shade: string;
  /** Rim colour. Defaults to warm white. */
  rim?: string;
  /** Optional pattern fill id painted over the two outer panels (e.g. a sleeve's motif). */
  patternId?: string;
  /** Prefix for ids so several frames can live in one document. */
  id?: string;
  /** How far the centre panel leans toward the shade colour (0..1). */
  depth?: number;
}

export function frameDefs(o: FrameOpts): string {
  const p = o.id ?? 'k';
  const sh = mix(o.shade, '#000000', 0.4);
  const rim = o.rim ?? '#fbf8f2';
  return `
    <filter id="${p}step" x="-6%" y="-6%" width="112%" height="114%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="${sh}" flood-opacity="0.35"/>
    </filter>
    <filter id="${p}icon" x="-25%" y="-25%" width="150%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="7" flood-color="${sh}" flood-opacity="0.45"/>
    </filter>
    <filter id="${p}drop" x="-25%" y="-25%" width="150%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="${sh}" flood-opacity="0.4"/>
    </filter>
    <linearGradient id="${p}rimg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${rim}"/><stop offset="1" stop-color="${mix(rim, '#b8ad9a', 0.35)}"/>
    </linearGradient>
    <clipPath id="${p}clip"><rect x="0" y="0" width="500" height="700" rx="${RIM_RX}"/></clipPath>`;
}

/** Rim + stepped panels. Draw content (icon, badge) after this. */
export function frameBody(o: FrameOpts): string {
  const p = o.id ?? 'k';
  const depth = o.depth ?? 0.45;
  const cols = [mix(o.color, '#ffffff', 0.3), mix(o.color, '#ffffff', 0.12), o.color, mix(o.color, o.shade, depth)];
  const steps = STEPS.map(
    ([x, y, w, h, rx], i) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${cols[i]}" ${i ? `filter="url(#${p}step)"` : ''}/>` +
      (o.patternId && i < 2 ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#${o.patternId})"/>` : '')
  ).join('');
  return `
    <rect x="0" y="0" width="500" height="700" rx="${RIM_RX}" fill="url(#${p}rimg)"/>
    <rect x="20" y="20" width="460" height="660" rx="33" fill="${mix(o.color, o.shade, 0.5)}"/>
    ${steps}`;
}

/** Nothing on top any more: kept so callers can stay unchanged. */
export function frameFinish(_o: FrameOpts): string {
  return '';
}

/** A soft light disc behind the icon. */
export function emblemHalo(color: string, cx = 250, cy = 350, r = 190): string {
  return `<defs><radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${mix(color, '#ffffff', 0.4)}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#halo)"/>`;
}
