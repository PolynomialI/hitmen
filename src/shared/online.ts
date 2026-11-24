// Online tables: the WebSocket protocol between the browser and the game server (server/index.ts).
// Everything is same-origin: the page talks only to the host that served it (/ws and /api/*).

import type { Action, GameEvent, PlayResult, SeatInfo } from './types';

/** Modes that can be played at an online table (Ranked and the Tutorial stay local). */
export type OnlineMode = 'original' | 'teams' | 'winter';
export const ONLINE_MODES: OnlineMode[] = ['original', 'teams', 'winter'];

export function seatOptions(mode: OnlineMode): number[] {
  return mode === 'teams' ? [4, 6] : [2, 3, 4, 5, 6];
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

export type ClientMsg =
  | { t: 'create'; name: string; look?: Look; mode: OnlineMode; size: number; public: boolean }
  | { t: 'join'; room: string; name: string; look?: Look }
  /** Resume a seat after a dropped connection or a page reload: `since` = events of `round` already received. */
  | { t: 'rejoin'; room: string; token: string; since: number; round: number }
  | { t: 'team'; team: number }
  | { t: 'start' }
  | { t: 'again' }
  | { t: 'leave' }
  | { t: 'action'; id: number; action: Action };

export type ServerMsg =
  | { t: 'welcome'; you: string; token: string; room: string }
  | { t: 'lobby'; lobby: LobbyInfo }
  /** Events missed while away, starting at index `from` of the current match (0 = the whole match: replay it). */
  | { t: 'history'; evs: GameEvent[]; from: number }
  | { t: 'event'; ev: GameEvent }
  | { t: 'result'; id: number; result: PlayResult }
  | { t: 'presence'; id: string; connected: boolean }
  | { t: 'error'; message: string; fatal?: boolean };

export const ROOM_CODE = /^[A-Z0-9]{4,8}$/;

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
