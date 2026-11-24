import { Bot } from './bot';
import type { DeckKind } from './cards';
import { Host } from './host';
import { DEFAULT_TIMERS } from './timing';
import { TutorialBot, tutorialSetup } from './tutorial';
import type { GameConfig, GameMode, SeatInfo } from './types';

export interface Rival {
  name: string;
  epithet: string;
  cloak: string;
  /** 0..1 */
  skill: number;
}

export const RIVALS: Rival[] = [
  { name: 'Mordecai Vane', epithet: 'Known for loaded dice', cloak: '#3b2a4a', skill: 0.8 },
  { name: 'Sister Ysolde', epithet: 'Known for praying very loudly', cloak: '#2b3b2a', skill: 0.7 },
  { name: 'Old Bertram', epithet: 'Owes the innkeeper eleven crowns', cloak: '#4a3322', skill: 0.55 },
  { name: 'Gideon Crowe', epithet: 'Known for feeding the ravens', cloak: '#1f2633', skill: 0.85 },
  { name: 'Wynn the Quiet', epithet: 'Never once seen blinking', cloak: '#3a1f1f', skill: 0.75 },
  { name: 'Agnes Thorne', epithet: 'Known for poisoned compliments', cloak: '#4a1f3a', skill: 0.8 },
  { name: 'Hamish Grey', epithet: 'Lost a finger to this very game', cloak: '#2a3a3a', skill: 0.6 },
  { name: 'Lady Morwenna', epithet: 'Known for marrying well, and often', cloak: '#3a2a10', skill: 0.9 },
  { name: 'Tobias Fenn', epithet: 'Sells fish. Smells of fish.', cloak: '#1f3a2a', skill: 0.5 },
  { name: 'Brother Cuthbert', epithet: 'Took a vow of silence. Breaks it constantly.', cloak: '#3a3020', skill: 0.65 },
  { name: 'Silas Rook', epithet: 'Known for always sitting with his back to the wall', cloak: '#141c26', skill: 0.95 },
  { name: 'Mags the Ferrywoman', epithet: 'Charges a coin to cross. Two to come back.', cloak: '#26303a', skill: 0.85 },
];

export const HUMAN_ID = 'you';

export interface LocalMatchOptions {
  mode: GameMode;
  playerName: string;
  /** Number of rivals (Original/Scrimmage/Winter: 1-5; Teams: 3 or 5 => 2v2 / 3v3). */
  rivals?: number;
  seed?: number;
  look?: SeatInfo['look'];
  /** Ranked: pick this rival. */
  rivalIndex?: number;
  /** No human seat: a table of bots to watch. */
  spectate?: boolean;
}

const DECK: Record<GameMode, DeckKind> = {
  original: 'original',
  scrimmage: 'original',
  tutorial: 'tutorial',
  teams: 'teams',
  winter: 'winter',
  ranked: 'ranked',
};

/** Build a local match against bots for any mode. */
export function createLocalMatch(opts: LocalMatchOptions): { host: Host; seats: SeatInfo[] } {
  const seed = opts.seed ?? (Math.random() * 2 ** 31) | 0;
  const mode = opts.mode;
  const me: SeatInfo = { id: HUMAN_ID, name: opts.playerName || 'You', isBot: false, seat: 0, epithet: 'Known for playing with fire', cloak: '#5a1a1a', look: opts.look };
  const seats: SeatInfo[] = opts.spectate ? [] : [me];
  const bots: Bot[] = [];
  if (mode === 'tutorial') {
    seats.push({ id: 'b1', name: 'Brother Aldric', isBot: true, seat: 1, epithet: 'Known for teaching the hard way', cloak: '#3a2a1f' });
    bots.push(new TutorialBot('b1', HUMAN_ID));
  } else {
    let n = opts.spectate ? Math.max(2, Math.min(6, opts.rivals ?? 4)) : mode === 'ranked' ? 1 : Math.max(1, Math.min(5, opts.rivals ?? 1));
    if (mode === 'teams') n = n >= 5 ? 5 : 3;
    const pool = [...RIVALS];
    // Shuffle rivals deterministically by seed.
    let s = seed >>> 0;
    for (let i = pool.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (mode === 'ranked' && opts.rivalIndex != null) pool.unshift(RIVALS[opts.rivalIndex]);
    for (let i = 0; i < n; i++) {
      const r = pool[i];
      const id = 'b' + (i + 1);
      seats.push({ id, name: r.name, isBot: true, seat: seats.length, epithet: r.epithet, cloak: r.cloak });
      const skill = mode === 'scrimmage' ? r.skill * 0.6 : mode === 'ranked' ? Math.min(1, r.skill + 0.1) : r.skill;
      bots.push(new Bot(id, (seed ^ (i * 0x9e3779b9)) >>> 0, skill));
    }
    if (mode === 'teams') seats.forEach((st, i) => (st.team = i % 2));
  }
  const timers = { ...DEFAULT_TIMERS };
  const cfg: GameConfig =
    mode === 'tutorial'
      ? { mode, deck: 'tutorial', seed, turnMs: null, reactionMs: 2400, rescueMs: 60_000, hideMs: 60_000, scryMs: 60_000, giveMs: 60_000, handSize: 4 }
      : mode === 'scrimmage'
        ? { mode, deck: DECK[mode], seed, ...timers, turnMs: 60_000, rescueMs: 12_000, handSize: 5 }
        : { mode, deck: DECK[mode], seed, ...timers, handSize: seats.length >= 5 ? 4 : 5 };
  const setup = mode === 'tutorial' ? tutorialSetup(HUMAN_ID, 'b1') : {};
  return { host: new Host(cfg, seats, setup, bots), seats };
}
