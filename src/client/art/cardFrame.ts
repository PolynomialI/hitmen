// The card frame shared by card faces, the default back and every sleeve: one colour edge to edge, laid in flat
// concentric bands, each a touch darker toward the middle. No border. Coordinates: 500x700.

export const RIM_RX = 44;

export function mix(hex: string, other: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export interface FrameOpts {
  color: string;
  shade: string;
  /** Border colour. Defaults to leather brown. */
  rim?: string;
  /** The innermost band's colour (the bands step evenly from \`color\` to it). Default: a little darker than \`color\`. */
  inner?: string;
  /** Optional pattern fill id painted over the card's colour (e.g. a sleeve's motif). */
  patternId?: string;
  /** Prefix for ids so several frames can live in one document. */
  id?: string;
}

export function frameDefs(o: FrameOpts): string {
  const p = o.id ?? 'k';
  const sh = mix(o.shade, '#000000', 0.4);
  const rim = o.rim ?? LEATHER;
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
      <stop offset="0" stop-color="${mix(rim, '#ffffff', 0.12)}"/><stop offset="1" stop-color="${mix(rim, '#000000', 0.18)}"/>
    </linearGradient>
    <linearGradient id="${p}fillg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${mix(o.color, '#ffffff', 0.1)}"/><stop offset="1" stop-color="${mix(o.color, o.shade, 0.22)}"/>
    </linearGradient>
    <clipPath id="${p}clip"><rect x="0" y="0" width="500" height="700" rx="${RIM_RX}"/></clipPath>`;
}

/** Leather border width (of 500). */
export const BORDER = 14;
export const LEATHER = '#7a4a2a';

/** Flat bands, outside in, each a touch darker toward the middle: [inset, corner radius]. */
const BANDS: Array<[number, number]> = [
  [44, 34],
  [78, 28],
  [112, 22],
  [146, 16],
];

/** Colour of band k (0 = outermost of the four inner bands). */
export function bandColor(o: { color: string; inner?: string }, k: number): string {
  return o.inner ? mix(o.color, o.inner, (k + 1) / BANDS.length) : mix(o.color, mix(o.color, '#000000', 0.55), 0.11 * (k + 1));
}

/** The card's colour edge to edge, in flat concentric bands darkening toward the middle (no border). */
export function frameBody(o: FrameOpts): string {
  const whole = `x="0" y="0" width="500" height="700" rx="${RIM_RX}"`;
  const bands = BANDS.map(([i, rx], k) => `<rect x="${i}" y="${i}" width="${500 - 2 * i}" height="${700 - 2 * i}" rx="${rx}" fill="${bandColor(o, k)}"/>`).join('');
  return `
    <rect ${whole} fill="${o.color}"/>
    ${bands}
    ${o.patternId ? `<rect ${whole} fill="url(#${o.patternId})"/>` : ''}`;
}

/** Nothing on top any more: kept so callers can stay unchanged. */
export function frameFinish(_o: FrameOpts): string {
  return '';
}

/** (Formerly a light disc behind the icon: cards are one flat colour now.) */
export function emblemHalo(_color: string, _cx = 250, _cy = 350, _r = 190): string {
  return '';
}
