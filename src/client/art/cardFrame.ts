// The chunky "thick card" frame shared by card faces, the default back and every sleeve:
// a bevelled ivory rim around a saturated field of stepped, recessed panels, with a linen finish
// and a soft lacquer sheen. Coordinates are in the 500x700 card space.

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
  [22, 22, 456, 656, 32],
  [50, 50, 400, 600, 25],
  [80, 80, 340, 540, 19],
  [108, 108, 284, 484, 14],
];

export interface FrameOpts {
  color: string;
  shade: string;
  /** Rim colours (light → dark). Defaults to ivory. */
  rim?: [string, string, string];
  /** Optional pattern fill id painted over the two outer panels (e.g. a sleeve's motif). */
  patternId?: string;
  /** Prefix for ids so several frames can live in one document. */
  id?: string;
  /** How much darker each inner step gets (0..1). */
  depth?: number;
  /** Outline colour for bold emblems. */
  ink?: string;
}

export function frameDefs(o: FrameOpts): string {
  const p = o.id ?? 'k';
  const [r0, r1, r2] = o.rim ?? ['#fffaf0', '#f1e6cd', '#d7c5a0'];
  return `
    <linearGradient id="${p}rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${r0}"/><stop offset="0.55" stop-color="${r1}"/><stop offset="1" stop-color="${r2}"/>
    </linearGradient>
    <radialGradient id="${p}lift" cx="50%" cy="34%" r="70%">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/>
    </radialGradient>
    <linearGradient id="${p}sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.34" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.42" stop-color="#fff" stop-opacity="0.13"/><stop offset="0.47" stop-color="#fff" stop-opacity="0.04"/>
      <stop offset="0.52" stop-color="#fff" stop-opacity="0.1"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <pattern id="${p}linen" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="3" fill="#fff" opacity="0.045"/><rect width="3" height="6" fill="#000" opacity="0.04"/>
    </pattern>
    <filter id="${p}inset" x="-4%" y="-4%" width="108%" height="108%">
      <feOffset in="SourceAlpha" dy="9" result="o1"/>
      <feGaussianBlur in="o1" stdDeviation="5" result="b1"/>
      <feComposite in="SourceAlpha" in2="b1" operator="out" result="top"/>
      <feFlood flood-color="#000" flood-opacity="0.55"/>
      <feComposite in2="top" operator="in" result="shadow"/>
      <feOffset in="SourceAlpha" dy="-5" result="o2"/>
      <feGaussianBlur in="o2" stdDeviation="2.2" result="b2"/>
      <feComposite in="SourceAlpha" in2="b2" operator="out" result="bot"/>
      <feFlood flood-color="#fff" flood-opacity="0.32"/>
      <feComposite in2="bot" operator="in" result="hl"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shadow"/><feMergeNode in="hl"/></feMerge>
    </filter>
    <filter id="${p}grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="5" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.5 -0.16"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="${p}rimbevel" x="-2%" y="-2%" width="104%" height="104%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b"/>
      <feSpecularLighting in="b" surfaceScale="4" specularConstant="0.7" specularExponent="18" lighting-color="#ffffff" result="s">
        <feDistantLight azimuth="235" elevation="48"/>
      </feSpecularLighting>
      <feComposite in="s" in2="SourceAlpha" operator="in" result="sp"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sp"/></feMerge>
    </filter>
    <filter id="${p}drop" x="-20%" y="-20%" width="140%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="9"/>
      <feOffset dy="12" result="b"/>
      <feFlood flood-color="#000" flood-opacity="0.5"/>
      <feComposite in2="b" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="${p}bold" x="-20%" y="-20%" width="140%" height="150%">
      <feComponentTransfer in="SourceAlpha" result="solid"><feFuncA type="discrete" tableValues="0 0 0 1 1"/></feComponentTransfer>
      <feMorphology in="solid" operator="dilate" radius="7" result="d"/>
      <feGaussianBlur in="d" stdDeviation="0.8" result="ds"/>
      <feFlood flood-color="${o.ink ?? '#1b110b'}"/>
      <feComposite in2="ds" operator="in" result="outline"/>
      <feGaussianBlur in="d" stdDeviation="10" result="sb"/>
      <feOffset in="sb" dy="14" result="so"/>
      <feFlood flood-color="#000" flood-opacity="0.55"/>
      <feComposite in2="so" operator="in" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="${p}clip"><rect x="0" y="0" width="500" height="700" rx="${RIM_RX}"/></clipPath>`;
}

/** Rim + stepped panels. Draw content (emblem, badge) after this, then `frameFinish`. */
export function frameBody(o: FrameOpts): string {
  const p = o.id ?? 'k';
  const depth = o.depth ?? 0.72;
  const cols = [mix(o.color, '#ffffff', 0.2), mix(o.color, '#ffffff', 0.04), mix(o.color, o.shade, depth * 0.45), mix(o.color, o.shade, depth)];
  const steps = STEPS.map(
    ([x, y, w, h, rx], i) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${cols[i]}" filter="url(#${p}inset)"/>` +
      (o.patternId && i < 2 ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#${o.patternId})"/>` : '')
  ).join('');
  const edge = mix(o.shade, '#000000', 0.35);
  return `
    <rect x="0" y="0" width="500" height="700" rx="${RIM_RX}" fill="url(#${p}rim)" filter="url(#${p}rimbevel)"/>
    <rect x="0" y="0" width="500" height="700" rx="${RIM_RX}" fill="#fff" filter="url(#${p}grain)" opacity="0.5"/>
    <rect x="3" y="3" width="494" height="694" rx="${RIM_RX - 2}" fill="none" stroke="#fff" stroke-width="3" opacity="0.75"/>
    <rect x="20" y="20" width="460" height="660" rx="34" fill="${edge}"/>
    ${steps}
    <rect x="22" y="22" width="456" height="656" rx="32" fill="url(#${p}lift)"/>`;
}

/** Linen finish and lacquer sheen over everything. */
export function frameFinish(o: FrameOpts): string {
  const p = o.id ?? 'k';
  return `
    <g clip-path="url(#${p}clip)">
      <rect width="500" height="700" fill="url(#${p}linen)"/>
      <rect x="22" y="22" width="456" height="656" rx="32" fill="#fff" filter="url(#${p}grain)" opacity="0.28"/>
      <rect width="500" height="700" fill="url(#${p}sheen)"/>
    </g>`;
}

/** A light disc behind the emblem so it reads against dark panels. */
export function emblemHalo(color: string, cx = 250, cy = 350, r = 210): string {
  return `<defs><radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${mix(color, '#ffffff', 0.45)}" stop-opacity="0.5"/>
      <stop offset="0.6" stop-color="${mix(color, '#ffffff', 0.3)}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#halo)"/>`;
}
