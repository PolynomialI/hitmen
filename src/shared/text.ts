// Text that ends up in 3D (troika) must only use glyphs our bundled fonts contain. For any other character troika
// downloads a fallback font from a public CDN, which the owner's managed Chromebook blocks (and which we never want
// at runtime anyway: the game must be fully self-hosted by whatever serves it).

/** Characters every bundled 3D font shares (printable ASCII, Latin-1 and a few typographic marks). */
const OK = /[\x20-\x7e\xa0-\xffıŒœ–—‘’‚“”„•…‹›⁄\n]/;

/** Letters with no Unicode decomposition that still have an obvious Latin-1 stand-in. */
const ALIKE: Record<string, string> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h', Ŧ: 'T', ŧ: 't', Ŀ: 'L', ŀ: 'l', Ŋ: 'N', ŋ: 'n', ĸ: 'k' };

/** Replace characters the 3D fonts lack: strip accents where that helps (č -> c), drop the rest. */
export function safeGlyphs(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    if (OK.test(ch)) out += ch;
    else {
      const base = ALIKE[ch] ?? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (base.length === 1 && OK.test(base)) out += base;
    }
  }
  return out;
}

export const NAME_MAX = 16;

/** A player name safe to show anywhere (3D name tags included). */
export function cleanName(s: unknown, fallback = 'Stranger'): string {
  if (typeof s !== 'string') return fallback;
  const n = safeGlyphs(s).replace(/[\x00-\x1f\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return n || fallback;
}
