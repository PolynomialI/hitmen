import type { Card, CardType, DeckKind } from './cards';

export type PlayerId = string;
export type GameMode = 'original' | 'tutorial' | 'teams' | 'scrimmage' | 'winter' | 'ranked';

export interface SeatInfo {
  id: PlayerId;
  name: string;
  isBot: boolean;
  seat: number;
  /** Flavour line used on the "missing" poster. */
  epithet: string;
  /** Cosmetic: cloak colour of the seated figure. */
  cloak: string;
  /** Team number in Teams mode. */
  team?: number;
  /** Cosmetics others can see (sleeve id etc.). */
  look?: { sleeve?: string; impact?: string; seat?: string; banner?: string; charm?: string };
}

export interface GameConfig {
  mode: GameMode;
  deck: DeckKind;
  seed: number;
  turnMs: number | null;
  reactionMs: number;
  rescueMs: number;
  hideMs: number;
  scryMs: number;
  giveMs: number;
  handSize: number;
}

export type Phase = 'lobby' | 'intro' | 'turn' | 'reaction' | 'scry' | 'rescue' | 'hide' | 'give' | 'over';

export type Action =
  | { t: 'play'; cardId: number; targetId?: PlayerId }
  | { t: 'react'; cardId: number; targetId?: PlayerId }
  | { t: 'hold' }
  | { t: 'draw' }
  | { t: 'rescue'; cardId: number }
  | { t: 'hide'; position: number }
  | { t: 'give'; cardId: number }
  | { t: 'scryDone' };

export interface SyncInfo {
  deck: number;
  handsInDeck: number;
  hands: Record<PlayerId, number>;
  alive: PlayerId[];
  current: PlayerId | null;
  turnsLeft: number;
  dir: 1 | -1;
  lock: { type: CardType; turns: number } | null;
  wards: PlayerId[];
  /** Type of the last card played (what a Looking Glass would copy). */
  last: CardType | null;
}

export interface PlayerStats {
  played: number;
  parries: number;
  rescues: number;
  steals: number;
  turns: number;
  drawn: number;
  slain: number;
}

export interface PendingInfo {
  player: PlayerId;
  card: Card;
  /** Effect actually applied (differs from card.type for a Looking Glass). */
  effect: CardType;
  target?: PlayerId;
  cancelled: boolean;
  burned: boolean;
}

export type EventBody =
  | { e: 'start'; seats: SeatInfo[]; mode: GameMode; first: PlayerId }
  | { e: 'deal'; to: PlayerId; card?: Card }
  | { e: 'intro' }
  | { e: 'turn'; player: PlayerId; turnsLeft: number; ms: number | null }
  | { e: 'play'; player: PlayerId; card: Card; effect: CardType; target?: PlayerId }
  | { e: 'window'; ms: number }
  | { e: 'parry'; player: PlayerId; card: Card; cancelled: boolean; burned: boolean }
  | { e: 'redirect'; player: PlayerId; card: Card; target: PlayerId }
  | { e: 'privateer'; player: PlayerId; card: Card }
  | { e: 'resolve'; player: PlayerId; card: Card; effect: CardType; target?: PlayerId; cancelled: boolean }
  | { e: 'burn'; card: Card }
  | { e: 'copy'; player: PlayerId; card: Card; from: PlayerId }
  | { e: 'pass'; from: PlayerId; to: PlayerId; card: Card }
  | { e: 'scry'; player: PlayerId; cards?: Card[]; ms: number }
  | { e: 'scryEnd'; player: PlayerId }
  | { e: 'shuffle'; by: PlayerId }
  | { e: 'reveal'; card: Card }
  | { e: 'givePrompt'; from: PlayerId; to: PlayerId; ms: number }
  | { e: 'steal'; from: PlayerId; to: PlayerId; card?: Card }
  | { e: 'owed'; player: PlayerId; by: PlayerId; turnsLeft: number }
  | { e: 'reverse'; dir: 1 | -1 }
  | { e: 'lock'; player: PlayerId; type: CardType; turns: number }
  | { e: 'unlock'; type: CardType }
  | { e: 'ward'; player: PlayerId; target: PlayerId }
  | { e: 'warded'; target: PlayerId; card: Card }
  | { e: 'retake'; player: PlayerId; card: Card }
  | { e: 'swap'; a: PlayerId; b: PlayerId; handA?: Card[]; handB?: Card[] }
  | { e: 'draw'; player: PlayerId; card?: Card; bottom: boolean }
  | { e: 'doom'; player: PlayerId; card: Card; ms: number; hasAngel?: boolean }
  | { e: 'rescue'; player: PlayerId; card: Card }
  | { e: 'hidePrompt'; player: PlayerId; ms: number }
  | { e: 'hidden'; player: PlayerId; position?: number }
  | { e: 'slain'; player: PlayerId; doom: Card; discarded: Card[] }
  | { e: 'over'; winner: PlayerId | null; winners: PlayerId[]; stats: Record<PlayerId, PlayerStats> };

export type GameEvent = EventBody & {
  n: number;
  dur: number;
  sync: SyncInfo;
  secret?: Record<PlayerId, Partial<EventBody>>;
};

export type EventType = GameEvent['e'];

export interface PlayerView {
  you: PlayerId;
  phase: Phase;
  seats: SeatInfo[];
  hand: Card[];
  sync: SyncInfo;
  pending: PendingInfo | null;
  doomed: PlayerId | null;
  give: { from: PlayerId; to: PlayerId } | null;
  busy: boolean;
  /** Hands of teammates (Teams mode). */
  mates: Record<PlayerId, Card[]>;
}

export interface PlayResult {
  ok: boolean;
  err?: string;
}

export type { Card, CardType };
