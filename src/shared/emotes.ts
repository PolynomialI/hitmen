// Emotes: short phrases a player (or a tavern regular) calls across the table. Cosmetic only: never part of the rules.
import type { GameEvent, PlayerId } from './types';

export const EMOTES = [
  { id: 'gg', text: 'Well played.' },
  { id: 'laugh', text: 'Ha! Ha!' },
  { id: 'mercy', text: 'Mercy, I beg you!' },
  { id: 'curses', text: 'Curses!' },
  { id: 'threat', text: 'The Hand is coming for you.' },
  { id: 'toast', text: 'A toast to the fallen!' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];

export function isEmote(x: unknown): x is EmoteId {
  return EMOTES.some((e) => e.id === x);
}

export function emoteText(id: EmoteId): string {
  return EMOTES.find((e) => e.id === id)!.text;
}

/** Players may emote at most this often. */
export const EMOTE_COOLDOWN_MS = 2500;
/** Tavern regulars keep quieter. */
export const BOT_EMOTE_COOLDOWN_MS = 15000;

/**
 * Now and then a tavern regular reacts to what just happened. Returns the emote and how long to wait first
 * (so it lands as the table's animation plays out), or null.
 */
export function botReaction(ev: GameEvent, bot: PlayerId, rnd: () => number = Math.random): { id: EmoteId; delay: number } | null {
  const r = rnd();
  switch (ev.e) {
    case 'doom':
      return ev.player === bot && r < 0.3 ? { id: 'mercy', delay: 1400 } : null;
    case 'rescue':
      if (ev.player === bot) return r < 0.4 ? { id: 'laugh', delay: 2000 } : null;
      return r < 0.12 ? { id: 'curses', delay: 2200 } : null;
    case 'owed':
      return ev.player === bot && r < 0.35 ? { id: 'curses', delay: 900 } : null;
    case 'slain':
      if (ev.player === bot) return null;
      return r < 0.18 ? { id: 'toast', delay: 5600 } : r < 0.3 ? { id: 'laugh', delay: 5600 } : null;
    case 'over':
      return ev.winner === bot && r < 0.6 ? { id: 'gg', delay: 600 } : null;
    default:
      return null;
  }
}
