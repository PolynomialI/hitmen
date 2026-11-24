// Local profile (name, coins, stats). Persisted per browser; safe if storage is unavailable.

export interface Profile {
  name: string;
  coins: number;
  wins: number;
  losses: number;
  tutorialDone: boolean;
  muted: boolean;
}

const KEY = 'hooded-hand-profile-v1';
const DEFAULT: Profile = { name: 'Stranger', coins: 150, wins: 0, losses: 0, tutorialDone: false, muted: false };

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* storage blocked */
  }
  return { ...DEFAULT };
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
