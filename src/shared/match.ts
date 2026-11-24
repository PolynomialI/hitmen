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

/** The tavern regulars in a seed-determined order. */
function shuffledRivals(seed: number): Rival[] {
  const pool = [...RIVALS];
  let s = seed >>> 0;
  for (let i = pool.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** Bots wear a random-looking (seeded) set of cosmetics. */
function botLook(seed: number, i: number): SeatInfo['look'] {
  const pickL = <T,>(arr: T[], salt: number) => arr[((seed >>> 0) + i * 7 + salt * 13) % arr.length];
  return {
    impact: pickL(['dust', 'embers', 'smoke', 'frost', 'gold', 'ravens', 'holy'], 1),
    charm: pickL(['none', 'die', 'horseshoe', 'goblet', 'skull', 'crystal', 'raven', 'dragon', 'none'], 2),
    seat: pickL(['oak', 'oak', 'stool', 'velvet', 'iron', 'bone', 'throne'], 3),
  };
}

function configFor(mode: Exclude<GameMode, 'tutorial'>, seed: number, players: number): GameConfig {
  const timers = { ...DEFAULT_TIMERS };
  return mode === 'scrimmage'
    ? { mode, deck: DECK[mode], seed, ...timers, turnMs: 60_000, rescueMs: 12_000, handSize: 5 }
    : { mode, deck: DECK[mode], seed, ...timers, handSize: players >= 5 ? 4 : 5 };
}

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
    const pool = shuffledRivals(seed);
    if (mode === 'ranked' && opts.rivalIndex != null) pool.unshift(RIVALS[opts.rivalIndex]);
    for (let i = 0; i < n; i++) {
      const r = pool[i];
      const id = 'b' + (i + 1);
      seats.push({ id, name: r.name, isBot: true, seat: seats.length, epithet: r.epithet, cloak: r.cloak, look: botLook(seed, i) });
      const skill = mode === 'scrimmage' ? r.skill * 0.6 : mode === 'ranked' ? Math.min(1, r.skill + 0.1) : r.skill;
      bots.push(new Bot(id, (seed ^ (i * 0x9e3779b9)) >>> 0, skill));
    }
    if (mode === 'teams') seats.forEach((st, i) => (st.team = i % 2));
  }
  const cfg: GameConfig =
    mode === 'tutorial'
      ? { mode, deck: 'tutorial', seed, turnMs: null, reactionMs: 2400, rescueMs: 60_000, hideMs: 60_000, scryMs: 60_000, giveMs: 60_000, handSize: 4 }
      : configFor(mode, seed, seats.length);
  const setup = mode === 'tutorial' ? tutorialSetup(HUMAN_ID, 'b1') : {};
  return { host: new Host(cfg, seats, setup, bots), seats };
}

export interface TableHuman {
  id: string;
  name: string;
  look?: SeatInfo['look'];
  /** Teams mode: the side the player picked (0 or 1). */
  team?: number;
}

const HUMAN_EPITHETS = ['Known for playing with fire', 'Came in from the rain', 'Never sits with their back to the door', 'Tips the bard, never the barkeep', 'Swears the dice are cursed', 'Paid for the last round. Once.'];
const HUMAN_CLOAKS = ['#5a1a1a', '#2b3b2a', '#3b2a4a', '#4a3322', '#1f2633', '#3a1f1f'];

/**
 * An online table (server side): these players plus tavern regulars (bots) up to `size` seats.
 * Teams sit alternately around the table, each player on the side they picked.
 */
export function createTableMatch(o: { mode: 'original' | 'teams' | 'winter'; size: number; humans: TableHuman[]; seed: number }): { host: Host; seats: SeatInfo[] } {
  const pool = shuffledRivals(o.seed);
  const bots: Bot[] = [];
  const human = (x: TableHuman, i: number): SeatInfo => ({ id: x.id, name: x.name, isBot: false, seat: 0, epithet: HUMAN_EPITHETS[i % HUMAN_EPITHETS.length], cloak: HUMAN_CLOAKS[i % HUMAN_CLOAKS.length], look: x.look });
  const rival = (): SeatInfo => {
    const i = bots.length;
    const r = pool[i];
    const id = 'b' + (i + 1);
    bots.push(new Bot(id, (o.seed ^ (i * 0x9e3779b9)) >>> 0, r.skill));
    return { id, name: r.name, isBot: true, seat: 0, epithet: r.epithet, cloak: r.cloak, look: botLook(o.seed, i) };
  };
  const humans = o.humans.slice(0, o.size);
  let seats: SeatInfo[];
  if (o.mode === 'teams') {
    const half = o.size / 2;
    const sides: SeatInfo[][] = [[], []];
    humans.forEach((x, i) => sides[x.team === 1 ? 1 : 0].push(human(x, i)));
    // Never more than half the table on one side.
    for (const [a, b] of [[0, 1], [1, 0]]) while (sides[a].length > half) sides[b].push(sides[a].pop()!);
    for (const side of sides) while (side.length < half) side.push(rival());
    seats = [];
    for (let i = 0; i < half; i++) for (const t of [0, 1]) seats.push({ ...sides[t][i], team: t });
  } else {
    seats = humans.map(human);
    while (seats.length < o.size) seats.push(rival());
  }
  seats.forEach((st, i) => (st.seat = i));
  return { host: new Host(configFor(o.mode, o.seed, seats.length), seats, {}, bots), seats };
}
