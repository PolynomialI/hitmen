// Local profile: name, currencies, level, stats, challenges, cosmetics, ranked rating.
// Persisted per browser; works (in memory) if storage is blocked.

export interface ChallengeState {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface Equipped {
  sleeve: string;
  impact: string;
  charm: string;
  seat: string;
  banner: string;
  playmat: string;
}

export interface Profile {
  name: string;
  coins: number;
  rubies: number;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  tutorialDone: boolean;
  muted: boolean;
  stats: { matches: number; wins: number; rescues: number; played: number; parries: number; outlasted: number; slain: number };
  daily: { key: string; items: ChallengeState[] };
  weekly: { key: string; items: ChallengeState[] };
  /** Owned cosmetic ids, each with a mutation ("basic" | "gilded" | "mosaic" | "prismatic"). */
  owned: Record<string, string[]>;
  equipped: Equipped;
  /** Mutation chosen for each equipped item. */
  equippedMut: Record<string, string>;
  tokens: number;
  ranked: { rating: number; ladder: Record<string, number>; streak: number };
  shop: { key: string; bought: string[] };
}

const KEY = 'hooded-hand-profile-v2';

export const DEFAULT_EQUIPPED: Equipped = {
  sleeve: 'sleeve_oxblood',
  impact: 'impact_dust',
  charm: 'charm_none',
  seat: 'seat_oak',
  banner: 'banner_plain',
  playmat: 'mat_baize',
};

function fresh(): Profile {
  return {
    name: 'Stranger',
    coins: 2500,
    rubies: 5,
    xp: 0,
    level: 1,
    wins: 0,
    losses: 0,
    tutorialDone: false,
    muted: false,
    stats: { matches: 0, wins: 0, rescues: 0, played: 0, parries: 0, outlasted: 0, slain: 0 },
    daily: { key: '', items: [] },
    weekly: { key: '', items: [] },
    owned: {
      sleeve_oxblood: ['basic'],
      impact_dust: ['basic'],
      charm_none: ['basic'],
      seat_oak: ['basic'],
      banner_plain: ['basic'],
      mat_baize: ['basic'],
    },
    equipped: { ...DEFAULT_EQUIPPED },
    equippedMut: {},
    tokens: 2,
    ranked: { rating: 1000, ladder: {}, streak: 0 },
    shop: { key: '', bought: [] },
  };
}

function load(): Profile {
  const base = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...base, ...p, stats: { ...base.stats, ...p.stats }, owned: { ...base.owned, ...p.owned }, equipped: { ...base.equipped, ...p.equipped }, ranked: { ...base.ranked, ...p.ranked } };
    }
    // Carry over v1 profiles (name, coins).
    const old = localStorage.getItem('hooded-hand-profile-v1');
    if (old) {
      const o = JSON.parse(old);
      base.name = o.name ?? base.name;
      base.coins += (o.coins ?? 0) * 10;
      base.tutorialDone = !!o.tutorialDone;
      base.muted = !!o.muted;
    }
  } catch {
    /* storage blocked */
  }
  return base;
}

export const profile: Profile = load();
const listeners = new Set<() => void>();

export function saveProfile(patch: Partial<Profile> = {}): void {
  Object.assign(profile, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function onProfile(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
