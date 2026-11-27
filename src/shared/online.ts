// Online tables: the WebSocket protocol between the browser and the game server (server/index.ts).
// Everything is same-origin: the page talks only to the host that served it (/ws and /api/*).

import type { Action, GameEvent, GameMode, PlayResult, SeatInfo } from './types';

/** Modes played online. Every seat is a real player: there are no bots at online tables. */
export type OnlineMode = 'original' | 'teams' | 'scrimmage' | 'winter' | 'duel';
export const ONLINE_MODES: OnlineMode[] = ['original', 'teams', 'scrimmage', 'winter', 'duel'];
/** Modes a host can choose in Create Table (Duel is the matchmaking queue). */
export const TABLE_MODES: OnlineMode[] = ['original', 'teams', 'scrimmage', 'winter'];

/** Matchmaking queues on the board, and how many players each needs. */
export type QueueMode = 'duel' | 'teams';
export const QUEUE_SIZE: Record<QueueMode, number> = { duel: 2, teams: 4 };

/** Table sizes (the most players who can sit down). */
export function seatOptions(mode: OnlineMode): number[] {
  return mode === 'duel' ? [2] : mode === 'teams' ? [4, 6] : [2, 3, 4, 5, 6];
}

/** The rules engine's mode for an online mode (a Duel plays the one-on-one deck). */
export function engineMode(mode: OnlineMode): Exclude<GameMode, 'tutorial'> {
  return mode === 'duel' ? 'ranked' : mode;
}

export type Look = NonNullable<SeatInfo['look']>;

export interface LobbySeat {
  id: string;
  name: string;
  look?: Look;
  host: boolean;
  /** False while the player is reconnecting. */
  connected: boolean;
  /** Teams mode: 0 = Crimson, 1 = Azure. */
  team?: number;
}

export interface LobbyInfo {
  code: string;
  mode: OnlineMode;
  size: number;
  public: boolean;
  status: 'waiting' | 'playing' | 'over';
  /** Increments every time a match starts at this table. */
  round: number;
  seats: LobbySeat[];
}

/** A public table waiting for players (GET /api/rooms). */
export interface RoomSummary {
  code: string;
  host: string;
  mode: OnlineMode;
  size: number;
  players: number;
}

/** A match being played that anyone can watch (GET /api/live). */
export interface LiveTable {
  code: string;
  mode: OnlineMode;
  players: string[];
  /** Players still in the match. */
  alive: number;
  watchers: number;
}

/** Server-wide standings by player name (GET /api/leaderboard). */
export interface LeaderRow {
  name: string;
  wins: number;
  games: number;
}

export type ClientMsg =
  | { t: 'create'; name: string; look?: Look; mode: OnlineMode; size: number; public: boolean }
  | { t: 'join'; room: string; name: string; look?: Look }
  /** Resume a seat after a dropped connection or a page reload: `since` = events of `round` already received. */
  | { t: 'rejoin'; room: string; token: string; since: number; round: number }
  | { t: 'team'; team: number }
  | { t: 'start' }
  | { t: 'again' }
  | { t: 'leave' }
  /** Host only, while waiting: ask a player to leave the table. */
  | { t: 'kick'; id: string }
  /** Matchmaking: wait for players for a Duel or a Teams match. */
  | { t: 'queue'; mode: QueueMode; name: string; look?: Look }
  | { t: 'unqueue' }
  /** Watch a match being played (no hands are shown). */
  | { t: 'watch'; room: string }
  | { t: 'action'; id: number; action: Action };

export type ServerMsg =
  | { t: 'welcome'; you: string; token: string; room: string }
  | { t: 'lobby'; lobby: LobbyInfo }
  /** Events missed while away, starting at index `from` of the current match (0 = the whole match: replay it). */
  | { t: 'history'; evs: GameEvent[]; from: number }
  | { t: 'event'; ev: GameEvent }
  | { t: 'result'; id: number; result: PlayResult }
  /** A player's connection dropped (they have `graceMs` to come back) or came back. */
  | { t: 'presence'; id: string; connected: boolean; graceMs?: number }
  /** Matchmaking: players waiting so far, and how many the match needs. */
  | { t: 'queued'; mode: QueueMode; waiting: number; need: number }
  | { t: 'error'; message: string; fatal?: boolean };

export const ROOM_CODE = /^[A-Z0-9]{4,8}$/;

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
