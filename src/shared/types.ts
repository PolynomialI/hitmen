import type { Card, CardType } from './cards';

export type PlayerId = string;
export type GameMode = 'original' | 'tutorial';

export interface SeatInfo {
  id: PlayerId;
  name: string;
  isBot: boolean;
  seat: number;
  /** Flavour line used on the "missing" poster. */
  epithet: string;
  /** Cosmetic: cloak colour of the seated figure. */
  cloak: string;
}

export interface GameConfig {
  mode: GameMode;
  seed: number;
  /** Turn time limit in ms; null = no limit (tutorial). */
  turnMs: number | null;
  /** Reaction window after a card is played, in which anyone may Parry. */
  reactionMs: number;
  /** Time to play a Guardian Angel after drawing the Hooded Hand. */
  rescueMs: number;
  /** Time to choose where to hide the Hooded Hand. */
  hideMs: number;
  /** Time allowed to study the Scrying Orb's vision. */
  scryMs: number;
  /** Number of action cards dealt to each player (plus one Guardian Angel). */
  handSize: number;
}

export type Phase = 'lobby' | 'intro' | 'turn' | 'reaction' | 'scry' | 'rescue' | 'hide' | 'over';

export type Action =
  | { t: 'play'; cardId: number; targetId?: PlayerId }
  | { t: 'parry'; cardId: number }
  | { t: 'draw' }
  | { t: 'rescue'; cardId: number }
  | { t: 'hide'; position: number }
  | { t: 'scryDone' };

/** Public table counters, attached to every event so clients never drift. */
export interface SyncInfo {
  deck: number;
  handsInDeck: number;
  hands: Record<PlayerId, number>;
  alive: PlayerId[];
  current: PlayerId | null;
  turnsLeft: number;
}

export interface PlayerStats {
  played: number;
  parries: number;
  rescues: number;
  steals: number;
  turns: number;
  drawn: number;
}

type EventBody =
  | { e: 'start'; seats: SeatInfo[]; mode: GameMode; first: PlayerId }
  | { e: 'deal'; to: PlayerId; card?: Card }
  | { e: 'intro' }
  | { e: 'turn'; player: PlayerId; turnsLeft: number; ms: number | null }
  | { e: 'play'; player: PlayerId; card: Card; target?: PlayerId }
  | { e: 'window'; ms: number }
  | { e: 'parry'; player: PlayerId; card: Card; cancelled: boolean }
  | { e: 'resolve'; player: PlayerId; card: Card; target?: PlayerId; cancelled: boolean }
  | { e: 'scry'; player: PlayerId; cards?: Card[]; ms: number }
  | { e: 'scryEnd'; player: PlayerId }
  | { e: 'shuffle' }
  | { e: 'steal'; from: PlayerId; to: PlayerId; card?: Card }
  | { e: 'owed'; player: PlayerId; by: PlayerId; turnsLeft: number }
  | { e: 'draw'; player: PlayerId; card?: Card; bottom: boolean }
  | { e: 'doom'; player: PlayerId; card: Card; ms: number; hasAngel?: boolean }
  | { e: 'rescue'; player: PlayerId; card: Card }
  | { e: 'hidePrompt'; player: PlayerId; ms: number }
  | { e: 'hidden'; player: PlayerId; position?: number }
  | { e: 'slain'; player: PlayerId; doom: Card; discarded: Card[] }
  | { e: 'over'; winner: PlayerId | null; stats: Record<PlayerId, PlayerStats> };

export type GameEvent = EventBody & {
  /** Sequence number. */
  n: number;
  /** Presentation time the host reserves for this event, in ms. */
  dur: number;
  sync: SyncInfo;
  /** Per-recipient extra fields (stripped before sending). */
  secret?: Record<PlayerId, Partial<EventBody>>;
};

export type EventType = GameEvent['e'];

/** What a single player is allowed to know right now (used by bots and for reconnects). */
export interface PlayerView {
  you: PlayerId;
  phase: Phase;
  seats: SeatInfo[];
  hand: Card[];
  sync: SyncInfo;
  pending: { player: PlayerId; card: Card; target?: PlayerId; cancelled: boolean } | null;
  doomed: PlayerId | null;
  busy: boolean;
}

export interface PlayResult {
  ok: boolean;
  err?: string;
}

export type { Card, CardType };
