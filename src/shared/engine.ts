import { ACTION_POOL_1V1, type Card, type CardType, def } from './cards';
import { Rng } from './rng';
import { DUR } from './timing';
import type {
  Action,
  GameConfig,
  GameEvent,
  Phase,
  PlayerId,
  PlayerStats,
  PlayerView,
  PlayResult,
  SeatInfo,
  SyncInfo,
} from './types';

interface PlayerState extends SeatInfo {
  alive: boolean;
  hand: Card[];
  stats: PlayerStats;
}

interface Pending {
  player: PlayerId;
  card: Card;
  target?: PlayerId;
  cancelled: boolean;
}

/** Optional stacked setup (used by the tutorial). */
export interface Setup {
  /** Cards each player starts with, by player id (types). Overrides normal dealing. */
  hands?: Record<PlayerId, CardType[]>;
  /** Deck order, top first. Overrides normal deck building. */
  deck?: CardType[];
  first?: PlayerId;
  /** Return a custom reaction window length for a given play, or null for the default. */
  reactionFor?: (p: { player: PlayerId; card: Card; target?: PlayerId; cancelled: boolean }) => number | null;
}

type Body = Omit<GameEvent, 'n' | 'dur' | 'sync'>;

/**
 * Authoritative rules engine. Pure TypeScript, no DOM/Node APIs, so it runs in the browser (bot games)
 * and on the server (online rooms). Time is passed in explicitly (ms) to keep it deterministic.
 */
export class Engine {
  readonly cfg: GameConfig;
  readonly rng: Rng;
  readonly setup: Setup;
  phase: Phase = 'lobby';
  players: PlayerState[] = [];
  deck: Card[] = [];
  discard: Card[] = [];
  cur = 0;
  turnsLeft = 1;
  pending: Pending | null = null;
  doom: { player: PlayerId; card: Card } | null = null;
  winner: PlayerId | null = null;
  /** Host time until which presentation is running. Decisions are not accepted before this. */
  busyUntil = 0;
  /** Deadline of the current phase (absolute ms) or null for none. */
  deadline: number | null = null;
  /** Turn time that was left when we left the 'turn' phase to resolve something. */
  private turnBank: number | null = null;
  private nextId = 1;
  private seq = 0;
  private out: GameEvent[] = [];
  private now = 0;

  constructor(cfg: GameConfig, seats: SeatInfo[], setup: Setup = {}) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.setup = setup;
    this.players = seats.map((s) => ({
      ...s,
      alive: true,
      hand: [],
      stats: { played: 0, parries: 0, rescues: 0, steals: 0, turns: 0, drawn: 0 },
    }));
  }

  // ------------------------------------------------------------------ helpers

  private card(type: CardType): Card {
    return { id: this.nextId++, type };
  }

  player(id: PlayerId): PlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }

  get current(): PlayerState {
    return this.players[this.cur];
  }

  alive(): PlayerState[] {
    return this.players.filter((p) => p.alive);
  }

  handsInDeck(): number {
    return this.deck.filter((c) => c.type === 'hand').length;
  }

  sync(): SyncInfo {
    const hands: Record<PlayerId, number> = {};
    for (const p of this.players) hands[p.id] = p.hand.length;
    return {
      deck: this.deck.length,
      handsInDeck: this.handsInDeck(),
      hands,
      alive: this.alive().map((p) => p.id),
      current: this.phase === 'over' || this.phase === 'lobby' ? null : this.current.id,
      turnsLeft: this.turnsLeft,
    };
  }

  private emit(body: Body, durOverride?: number): void {
    const dur = durOverride ?? (DUR as Record<string, number>)[body.e] ?? 0;
    const ev = { ...body, n: ++this.seq, dur, sync: this.sync() } as GameEvent;
    this.out.push(ev);
    this.busyUntil = Math.max(this.busyUntil, this.now) + dur;
  }

  /** Take all events produced since the last call. */
  drain(): GameEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  isBusy(now: number): boolean {
    return now < this.busyUntil;
  }

  // ------------------------------------------------------------------ setup

  start(now: number): void {
    this.now = now;
    this.busyUntil = now;
    const st = this.setup;
    const firstId = st.first ?? this.rng.pick(this.players).id;
    this.cur = this.players.findIndex((p) => p.id === firstId);
    this.phase = 'intro';

    let deals: Array<{ p: PlayerState; c: Card }> = [];
    if (st.hands && st.deck) {
      for (const p of this.players) {
        for (const t of st.hands[p.id] ?? []) deals.push({ p, c: this.card(t) });
      }
      this.deck = st.deck.map((t) => this.card(t));
    } else {
      const pool: Card[] = [];
      for (const [t, n] of Object.entries(ACTION_POOL_1V1)) {
        for (let i = 0; i < (n ?? 0); i++) pool.push(this.card(t as CardType));
      }
      this.rng.shuffle(pool);
      // Every player starts with one Guardian Angel plus handSize action cards, dealt round-robin.
      for (const p of this.players) deals.push({ p, c: this.card('angel') });
      for (let i = 0; i < this.cfg.handSize; i++) {
        for (const p of this.players) deals.push({ p, c: pool.pop()! });
      }
      // Interleave: angel first per player, then round-robin actions (already in that order).
      const n = this.players.length;
      for (let i = 0; i < n - 1; i++) pool.push(this.card('hand'));
      // One spare angel per table of up to 3, two above.
      const spare = n <= 3 ? 1 : 2;
      for (let i = 0; i < spare; i++) pool.push(this.card('angel'));
      this.rng.shuffle(pool);
      this.deck = pool;
    }

    // During the deal, the deck visually contains the dealt cards too; we count them down as they go out.
    const stash = this.deck;
    this.deck = [...deals.map((d) => d.c), ...stash];
    this.emit({ e: 'start', seats: this.players.map(seatOf), mode: this.cfg.mode, first: this.current.id });
    // Deal alternating so it looks like a real deal.
    const order = interleave(this.players, deals);
    for (const d of order) {
      this.deck.shift();
      d.p.hand.push(d.c);
      this.emit({ e: 'deal', to: d.p.id, secret: { [d.p.id]: { card: d.c } } });
    }
    this.deck = stash;
    this.emit({ e: 'intro' });
    this.beginTurn(this.cur, 1);
  }

  // ------------------------------------------------------------------ turn flow

  private beginTurn(idx: number, turns: number): void {
    this.cur = idx;
    this.turnsLeft = turns;
    this.phase = 'turn';
    this.pending = null;
    this.turnBank = null;
    this.current.stats.turns++;
    this.emit({ e: 'turn', player: this.current.id, turnsLeft: turns, ms: this.cfg.turnMs });
    this.deadline = this.cfg.turnMs == null ? null : this.busyUntil + this.cfg.turnMs;
  }

  private resumeTurn(): void {
    this.phase = 'turn';
    this.pending = null;
    const bank = this.turnBank;
    this.turnBank = null;
    if (this.cfg.turnMs == null) this.deadline = null;
    else this.deadline = this.busyUntil + Math.max(6000, bank ?? this.cfg.turnMs);
  }

  private bankTurn(): void {
    if (this.phase === 'turn' && this.deadline != null) {
      this.turnBank = Math.max(0, this.deadline - this.now);
    }
  }

  private nextAliveAfter(idx: number): number {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const j = (idx + k) % n;
      if (this.players[j].alive) return j;
    }
    return idx;
  }

  /** One owed turn is complete. */
  private endTurnUnit(): void {
    if (this.phase === 'over') return;
    this.turnsLeft--;
    if (this.turnsLeft > 0 && this.current.alive) this.beginTurn(this.cur, this.turnsLeft);
    else this.beginTurn(this.nextAliveAfter(this.cur), 1);
  }

  // ------------------------------------------------------------------ actions

  act(pid: PlayerId, a: Action, now: number): PlayResult {
    this.now = now;
    const p = this.player(pid);
    if (!p || !p.alive) return fail('not in game');
    if (this.phase === 'over' || this.phase === 'intro' || this.phase === 'lobby') return fail('not now');
    const busy = this.isBusy(now);

    switch (a.t) {
      case 'play': {
        if (this.phase !== 'turn' || this.current.id !== pid) return fail('not your turn');
        if (busy) return fail('busy');
        const card = p.hand.find((c) => c.id === a.cardId);
        if (!card) return fail('no such card');
        const d = def(card.type);
        if (!d.playable) return fail('cannot play that now');
        let target: PlayerId | undefined;
        if (d.targeted) {
          const t = a.targetId ? this.player(a.targetId) : undefined;
          if (!t || !t.alive || t.id === pid) return fail('bad target');
          target = t.id;
        }
        this.bankTurn();
        removeCard(p.hand, card.id);
        this.discard.push(card);
        p.stats.played++;
        this.emit({ e: 'play', player: pid, card, target });
        this.pending = { player: pid, card, target, cancelled: false };
        this.openWindow();
        return ok();
      }
      case 'parry': {
        if (this.phase !== 'reaction' || !this.pending) return fail('nothing to parry');
        const card = p.hand.find((c) => c.id === a.cardId && c.type === 'parry');
        if (!card) return fail('no parry');
        removeCard(p.hand, card.id);
        this.discard.push(card);
        p.stats.played++;
        p.stats.parries++;
        this.pending.cancelled = !this.pending.cancelled;
        this.emit({ e: 'parry', player: pid, card, cancelled: this.pending.cancelled });
        this.openWindow();
        return ok();
      }
      case 'draw': {
        if (this.phase !== 'turn' || this.current.id !== pid) return fail('not your turn');
        if (busy) return fail('busy');
        this.bankTurn();
        this.doDraw(false);
        return ok();
      }
      case 'rescue': {
        if (this.phase !== 'rescue' || !this.doom || this.doom.player !== pid) return fail('not now');
        const card = p.hand.find((c) => c.id === a.cardId && c.type === 'angel');
        if (!card) return fail('no angel');
        removeCard(p.hand, card.id);
        this.discard.push(card);
        p.stats.rescues++;
        this.emit({ e: 'rescue', player: pid, card });
        this.phase = 'hide';
        this.emit({ e: 'hidePrompt', player: pid, ms: this.cfg.hideMs });
        this.deadline = this.busyUntil + this.cfg.hideMs;
        return ok();
      }
      case 'hide': {
        if (this.phase !== 'hide' || !this.doom || this.doom.player !== pid) return fail('not now');
        this.doHide(a.position);
        return ok();
      }
      case 'scryDone': {
        if (this.phase !== 'scry' || this.current.id !== pid) return fail('not now');
        this.endScry();
        return ok();
      }
    }
  }

  private openWindow(): void {
    this.phase = 'reaction';
    const custom = this.pending && this.setup.reactionFor ? this.setup.reactionFor(this.pending) : null;
    const ms = custom ?? this.cfg.reactionMs;
    this.emit({ e: 'window', ms });
    this.deadline = this.busyUntil + ms;
  }

  private resolvePending(): void {
    const pend = this.pending!;
    this.pending = null;
    const p = this.player(pend.player)!;
    this.emit({ e: 'resolve', player: pend.player, card: pend.card, target: pend.target, cancelled: pend.cancelled });
    if (pend.cancelled) {
      this.resumeTurn();
      return;
    }
    switch (pend.card.type) {
      case 'scry': {
        const cards = this.deck.slice(0, 3);
        this.phase = 'scry';
        this.emit({ e: 'scry', player: p.id, ms: this.cfg.scryMs, secret: { [p.id]: { cards } } });
        this.deadline = this.busyUntil + this.cfg.scryMs;
        return;
      }
      case 'slip':
        this.endTurnUnit();
        return;
      case 'bounty': {
        const t = this.player(pend.target!)!;
        if (!t.alive) {
          this.endTurnUnit();
          return;
        }
        const owed = (this.turnsLeft > 1 ? this.turnsLeft : 0) + 2;
        this.emit({ e: 'owed', player: t.id, by: p.id, turnsLeft: owed });
        this.beginTurn(this.players.indexOf(t), owed);
        return;
      }
      case 'brawl':
        this.rng.shuffle(this.deck);
        this.emit({ e: 'shuffle' });
        this.resumeTurn();
        return;
      case 'pickpocket': {
        const t = this.player(pend.target!)!;
        if (t.alive && t.hand.length > 0) {
          const c = t.hand[this.rng.int(t.hand.length)];
          removeCard(t.hand, c.id);
          p.hand.push(c);
          p.stats.steals++;
          this.emit({ e: 'steal', from: t.id, to: p.id, secret: { [t.id]: { card: c }, [p.id]: { card: c } } });
        } else {
          this.emit({ e: 'steal', from: t.id, to: p.id }, 600);
        }
        this.resumeTurn();
        return;
      }
      case 'backdoor':
        this.doDraw(true);
        return;
      default:
        this.resumeTurn();
    }
  }

  private doDraw(bottom: boolean): void {
    const p = this.current;
    if (this.deck.length === 0) {
      // Should not happen (the deck always holds at least one Hooded Hand while 2+ players live).
      this.endTurnUnit();
      return;
    }
    const card = bottom ? this.deck.pop()! : this.deck.shift()!;
    p.stats.drawn++;
    if (card.type === 'hand') {
      this.emit({ e: 'draw', player: p.id, card, bottom });
      const hasAngel = p.hand.some((c) => c.type === 'angel');
      this.doom = { player: p.id, card };
      this.phase = 'rescue';
      const ms = hasAngel ? this.cfg.rescueMs : 2600;
      this.emit({ e: 'doom', player: p.id, card, ms, secret: { [p.id]: { hasAngel } } });
      this.deadline = this.busyUntil + ms;
      return;
    }
    p.hand.push(card);
    this.emit({ e: 'draw', player: p.id, bottom, secret: { [p.id]: { card } } });
    this.endTurnUnit();
  }

  private doHide(position: number): void {
    const d = this.doom!;
    const pos = Math.max(0, Math.min(this.deck.length, Math.floor(position)));
    this.deck.splice(pos, 0, d.card);
    this.doom = null;
    this.emit({ e: 'hidden', player: d.player, secret: { [d.player]: { position: pos } } });
    this.endTurnUnit();
  }

  private endScry(): void {
    this.emit({ e: 'scryEnd', player: this.current.id });
    this.resumeTurn();
  }

  private slay(pid: PlayerId): void {
    const p = this.player(pid)!;
    const doomCard = this.doom!.card;
    this.doom = null;
    p.alive = false;
    const discarded = p.hand.splice(0);
    this.discard.push(doomCard, ...discarded);
    this.emit({ e: 'slain', player: pid, doom: doomCard, discarded });
    const left = this.alive();
    if (left.length <= 1) {
      this.finish(left[0]?.id ?? null);
      return;
    }
    this.beginTurn(this.nextAliveAfter(this.players.indexOf(p)), 1);
  }

  private finish(winner: PlayerId | null): void {
    this.phase = 'over';
    this.winner = winner;
    this.deadline = null;
    const stats: Record<PlayerId, PlayerStats> = {};
    for (const p of this.players) stats[p.id] = { ...p.stats };
    this.emit({ e: 'over', winner, stats });
  }

  /** A player left the table: treat as slain by the hand of fate. */
  forfeit(pid: PlayerId, now: number): void {
    this.now = now;
    const p = this.player(pid);
    if (!p || !p.alive || this.phase === 'over') return;
    const fake = this.card('hand');
    this.doom = { player: pid, card: fake };
    const wasCurrent = this.current.id === pid;
    p.alive = false;
    const discarded = p.hand.splice(0);
    this.emit({ e: 'slain', player: pid, doom: fake, discarded });
    this.doom = null;
    const left = this.alive();
    if (left.length <= 1) return this.finish(left[0]?.id ?? null);
    if (wasCurrent) this.beginTurn(this.nextAliveAfter(this.cur), 1);
  }

  // ------------------------------------------------------------------ clock

  /** Advance timers. Call frequently (e.g. every 50-100 ms). */
  update(now: number): void {
    this.now = now;
    if (this.deadline == null || now < this.deadline || now < this.busyUntil) return;
    this.deadline = null;
    switch (this.phase) {
      case 'turn':
        this.doDraw(false);
        break;
      case 'reaction':
        this.resolvePending();
        break;
      case 'scry':
        this.endScry();
        break;
      case 'rescue':
        this.slay(this.doom!.player);
        break;
      case 'hide':
        this.doHide(this.rng.int(this.deck.length + 1));
        break;
    }
  }

  // ------------------------------------------------------------------ views

  view(pid: PlayerId, now: number): PlayerView {
    const p = this.player(pid);
    return {
      you: pid,
      phase: this.phase,
      seats: this.players.map(seatOf),
      hand: p ? p.hand.map((c) => ({ ...c })) : [],
      sync: this.sync(),
      pending: this.pending ? { ...this.pending } : null,
      doomed: this.doom?.player ?? null,
      busy: this.isBusy(now),
    };
  }
}

// -------------------------------------------------------------------- utils

function seatOf(p: PlayerState): SeatInfo {
  return { id: p.id, name: p.name, isBot: p.isBot, seat: p.seat, epithet: p.epithet, cloak: p.cloak };
}

function removeCard(hand: Card[], id: number): void {
  const i = hand.findIndex((c) => c.id === id);
  if (i >= 0) hand.splice(i, 1);
}

function ok(): PlayResult {
  return { ok: true };
}
function fail(err: string): PlayResult {
  return { ok: false, err };
}

function interleave<T extends { id: string }>(players: T[], deals: Array<{ p: T; c: Card }>) {
  const byP = new Map<string, Array<{ p: T; c: Card }>>();
  for (const d of deals) {
    if (!byP.has(d.p.id)) byP.set(d.p.id, []);
    byP.get(d.p.id)!.push(d);
  }
  const out: Array<{ p: T; c: Card }> = [];
  let more = true;
  for (let i = 0; more; i++) {
    more = false;
    for (const p of players) {
      const arr = byP.get(p.id);
      if (arr && arr[i]) {
        out.push(arr[i]);
        more = true;
      }
    }
  }
  return out;
}

/** Strip and merge per-recipient secrets for one player. */
export function filterFor(ev: GameEvent, pid: PlayerId | null): GameEvent {
  const { secret, ...rest } = ev;
  if (pid && secret && secret[pid]) return { ...rest, ...secret[pid] } as GameEvent;
  return rest as GameEvent;
}
