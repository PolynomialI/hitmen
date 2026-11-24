import { Bot } from './bot';
import { Host } from './host';
import { DEFAULT_TIMERS } from './timing';
import { TutorialBot, tutorialSetup } from './tutorial';
import type { GameConfig, GameMode, SeatInfo } from './types';

export const RIVALS = [
  { name: 'Mordecai Vane', epithet: 'Known for loaded dice', cloak: '#3b2a4a' },
  { name: 'Sister Ysolde', epithet: 'Known for praying very loudly', cloak: '#2b3b2a' },
  { name: 'Old Bertram', epithet: 'Owes the innkeeper eleven crowns', cloak: '#4a3322' },
  { name: 'Gideon Crowe', epithet: 'Known for feeding the ravens', cloak: '#1f2633' },
  { name: 'Wynn the Quiet', epithet: 'Never once seen blinking', cloak: '#3a1f1f' },
];

export interface MatchOptions {
  mode: GameMode;
  playerName: string;
  seed?: number;
}

export const HUMAN_ID = 'you';
export const BOT_ID = 'rival';

/** Build a 1v1 match against a bot (Original or Tutorial). */
export function createBotMatch(opts: MatchOptions): { host: Host; seats: SeatInfo[] } {
  const seed = opts.seed ?? (Math.random() * 2 ** 31) | 0;
  const tutorial = opts.mode === 'tutorial';
  const rival = tutorial ? { name: 'Brother Aldric', epithet: 'Known for teaching the hard way', cloak: '#3a2a1f' } : RIVALS[Math.abs(seed) % RIVALS.length];
  const seats: SeatInfo[] = [
    { id: HUMAN_ID, name: opts.playerName || 'You', isBot: false, seat: 0, epithet: 'Known for playing with fire', cloak: '#5a1a1a' },
    { id: BOT_ID, name: rival.name, isBot: true, seat: 1, epithet: rival.epithet, cloak: rival.cloak },
  ];
  const cfg: GameConfig = tutorial
    ? { mode: 'tutorial', seed, turnMs: null, reactionMs: 2400, rescueMs: 60_000, hideMs: 60_000, scryMs: 60_000, handSize: 4 }
    : { mode: 'original', seed, ...DEFAULT_TIMERS, handSize: 4 };
  const bot = tutorial ? new TutorialBot(BOT_ID, HUMAN_ID) : new Bot(BOT_ID, seed ^ 0x5bd1e995, 0.8);
  const setup = tutorial ? tutorialSetup(HUMAN_ID, BOT_ID) : {};
  return { host: new Host(cfg, seats, setup, [bot]), seats };
}
