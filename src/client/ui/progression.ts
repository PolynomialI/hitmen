import type { GameMode } from '../../shared/types';
import { profile, saveProfile, type ChallengeState } from './profile';

// ------------------------------------------------------------------ levels

export function xpForLevel(level: number): number {
  return 600 + (level - 1) * 180;
}

export function levelProgress(): { level: number; into: number; need: number } {
  return { level: profile.level, into: profile.xp, need: xpForLevel(profile.level) };
}

/** Add XP; returns the levels gained. Each level grants coins and a ruby. */
export function addXp(xp: number): number[] {
  let gained: number[] = [];
  profile.xp += xp;
  while (profile.xp >= xpForLevel(profile.level)) {
    profile.xp -= xpForLevel(profile.level);
    profile.level++;
    profile.coins += 400;
    profile.rubies += 1;
    if (profile.level % 5 === 0) profile.tokens += 1;
    gained.push(profile.level);
  }
  return gained;
}

// ------------------------------------------------------------------ challenges

export interface MatchSummary {
  mode: GameMode;
  won: boolean;
  played: number;
  parries: number;
  rescues: number;
  outlasted: number;
  scried: number;
  marked: number;
  rivals: number;
}

export interface ChallengeDef {
  id: string;
  text: string;
  goal: number;
  reward: { coins: number; rubies?: number; tokens?: number };
  /** How much this match advances it. */
  count: (m: MatchSummary) => number;
}

export const DAILY: ChallengeDef[] = [
  { id: 'd_play1', text: 'Sit at a table once', goal: 1, reward: { coins: 300 }, count: () => 1 },
  { id: 'd_play3', text: 'Play 3 matches', goal: 3, reward: { coins: 600 }, count: () => 1 },
  { id: 'd_survive1', text: 'Survive the Hooded Hand', goal: 1, reward: { coins: 450 }, count: (m) => m.rescues },
  { id: 'd_cards15', text: 'Play 15 cards', goal: 15, reward: { coins: 400 }, count: (m) => m.played },
  { id: 'd_parry3', text: 'Parry or burn 3 cards', goal: 3, reward: { coins: 450 }, count: (m) => m.parries },
  { id: 'd_win1', text: 'Win a match', goal: 1, reward: { coins: 700, rubies: 1 }, count: (m) => (m.won ? 1 : 0) },
  { id: 'd_outlast3', text: 'Outlast 3 rivals', goal: 3, reward: { coins: 500 }, count: (m) => m.outlasted },
  { id: 'd_scry2', text: 'Peer into the Scrying Orb twice', goal: 2, reward: { coins: 350 }, count: (m) => m.scried },
  { id: 'd_mark4', text: 'Mark 4 players with your cards', goal: 4, reward: { coins: 400 }, count: (m) => m.marked },
  { id: 'd_big', text: 'Play a table of 4 or more', goal: 1, reward: { coins: 500 }, count: (m) => (m.rivals >= 3 ? 1 : 0) },
];

export const WEEKLY: ChallengeDef[] = [
  { id: 'w_win5', text: 'Win 5 matches', goal: 5, reward: { coins: 2500, rubies: 3 }, count: (m) => (m.won ? 1 : 0) },
  { id: 'w_play12', text: 'Play 12 matches', goal: 12, reward: { coins: 2200, tokens: 1 }, count: () => 1 },
  { id: 'w_survive8', text: 'Survive the Hooded Hand 8 times', goal: 8, reward: { coins: 2400, rubies: 2 }, count: (m) => m.rescues },
  { id: 'w_cards80', text: 'Play 80 cards', goal: 80, reward: { coins: 2000 }, count: (m) => m.played },
  { id: 'w_outlast15', text: 'Outlast 15 rivals', goal: 15, reward: { coins: 2600, rubies: 2 }, count: (m) => m.outlasted },
  { id: 'w_teams', text: 'Win a Teams match', goal: 1, reward: { coins: 1800, rubies: 2 }, count: (m) => (m.won && m.mode === 'teams' ? 1 : 0) },
  { id: 'w_ranked', text: 'Win 2 Ranked duels', goal: 2, reward: { coins: 2400, rubies: 3 }, count: (m) => (m.won && m.mode === 'ranked' ? 1 : 0) },
  { id: 'w_winter', text: 'Play 3 Winter Feast matches', goal: 3, reward: { coins: 1600, tokens: 1 }, count: (m) => (m.mode === 'winter' ? 1 : 0) },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pick(defs: ChallengeDef[], key: string, n: number): ChallengeState[] {
  const pool = [...defs];
  let s = hash(key);
  const out: ChallengeState[] = [];
  while (out.length < n && pool.length) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out.push({ id: pool.splice(s % pool.length, 1)[0].id, progress: 0, claimed: false });
  }
  return out;
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function weekKey(d = new Date()): string {
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.floor((d.getTime() - start.getTime()) / (7 * 86400000));
  return `${d.getFullYear()}-w${week}`;
}

/** Make sure today's and this week's challenges exist. */
export function refreshChallenges(): void {
  const dk = dayKey();
  const wk = weekKey();
  let changed = false;
  if (profile.daily.key !== dk) {
    profile.daily = { key: dk, items: pick(DAILY, dk, 3) };
    changed = true;
  }
  if (profile.weekly.key !== wk) {
    profile.weekly = { key: wk, items: pick(WEEKLY, wk, 3) };
    changed = true;
  }
  if (changed) saveProfile();
}

export function defOf(id: string): ChallengeDef | undefined {
  return DAILY.find((d) => d.id === id) ?? WEEKLY.find((d) => d.id === id);
}

/** Advance challenge progress with a match. Returns ids that just completed. */
export function progressChallenges(m: MatchSummary): string[] {
  refreshChallenges();
  const done: string[] = [];
  for (const list of [profile.daily.items, profile.weekly.items]) {
    for (const c of list) {
      const d = defOf(c.id);
      if (!d || c.claimed) continue;
      const before = c.progress;
      c.progress = Math.min(d.goal, c.progress + d.count(m));
      if (before < d.goal && c.progress >= d.goal) done.push(c.id);
    }
  }
  saveProfile();
  return done;
}

export function claimChallenge(id: string): boolean {
  for (const list of [profile.daily.items, profile.weekly.items]) {
    const c = list.find((x) => x.id === id);
    const d = defOf(id);
    if (!c || !d || c.claimed || c.progress < d.goal) continue;
    c.claimed = true;
    profile.coins += d.reward.coins;
    profile.rubies += d.reward.rubies ?? 0;
    profile.tokens += d.reward.tokens ?? 0;
    saveProfile();
    return true;
  }
  return false;
}

export function msUntilTomorrow(): number {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return t.getTime() - now.getTime();
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ ranked

export const RANKS = [
  { name: 'Peasant', min: 0 },
  { name: 'Squire', min: 1050 },
  { name: 'Knight', min: 1150 },
  { name: 'Baron', min: 1275 },
  { name: 'Count', min: 1400 },
  { name: 'Duke', min: 1550 },
  { name: 'Shadow of the Hand', min: 1750 },
];

export function rankOf(rating: number): { name: string; index: number } {
  let idx = 0;
  RANKS.forEach((r, i) => rating >= r.min && (idx = i));
  return { name: RANKS[idx].name, index: idx };
}

/** Elo update for a duel. Returns the rating change. */
export function rankedResult(rivalName: string, won: boolean): number {
  const ladder = profile.ranked.ladder;
  const rr = ladder[rivalName] ?? 1000 + (hash(rivalName) % 600);
  const me = profile.ranked.rating;
  const exp = 1 / (1 + Math.pow(10, (rr - me) / 400));
  const k = 32;
  const delta = Math.round(k * ((won ? 1 : 0) - exp));
  profile.ranked.rating = Math.max(0, me + delta);
  ladder[rivalName] = Math.max(0, rr - delta);
  profile.ranked.streak = won ? profile.ranked.streak + 1 : 0;
  saveProfile();
  return delta;
}
