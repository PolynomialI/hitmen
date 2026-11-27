import { type Card, type CardType, DECK_PER_PLAYER, def, poolFor } from './cards';
import { Rng } from './rng';
import { DRAW_HAND, DUR } from './timing';
import type {
  Action,
  EventBody,
  GameConfig,
  GameEvent,
  PendingInfo,
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

interface Pending extends PendingInfo {
  privateers: Array<{ player: PlayerId; card: Card }>;
}

/** Optional stacked setup (used by the tutorial). */
export interface Setup {
  hands?: Record<PlayerId, CardType[]>;
  deck?: CardType[];
  first?: PlayerId;
  reactionFor?: (p: PendingInfo) => number | null;
}

type Body = EventBody & { secret?: Record<PlayerId, Partial<EventBody>> };

/** Effects a Looking Glass may copy. */
const COPYABLE = new Set<CardType>(['scry', 'bounty', 'slip', 'brawl', 'pickpocket', 'backdoor', 'turnabout', 'shackles', 'aegis', 'warband', 'sands', 'mistletoe', 'yule']);
/** Effects that mark a player. */
const MARKS = new Set<CardType>(['bounty', 'pickpocket', 'aegis', 'warband', 'mistletoe']);
/** Hostile marks an Aegis blocks. */
const HOSTILE = new Set<CardType>(['bounty', 'pickpocket', 'warband', 'mistletoe']);

/**
 * Authoritative rules engine. Pure TypeScript (no DOM/Node APIs): runs in the browser for bot games
 * and on the server for online rooms. Time is passed in explicitly (ms) to keep it deterministic.
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
  dir: 1 | -1 = 1;
  turnsLeft = 1;
  pending: Pending | null = null;
  doom: { player: PlayerId; card: Card } | null = null;
  give: { from: PlayerId; to: PlayerId } | null = null;
  lock: { type: CardType; turns: number } | null = null;
  wards = new Set<PlayerId>();
  lastPlayed: CardType | null = null;
  private holds = new Set<PlayerId>();
  winner: PlayerId | null = null;
  busyUntil = 0;
  deadline: number | null = null;
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
      stats: { played: 0, parries: 0, rescues: 0, steals: 0, turns: 0, drawn: 0, slain: 0 },
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

  teamOf(id: PlayerId): number | undefined {
    return this.player(id)?.team;
  }

  /** Teammates of a player (excluding themselves). */
  mates(id: PlayerId): PlayerState[] {
    const t = this.teamOf(id);
    if (t == null) return [];
    return this.players.filter((p) => p.team === t && p.id !== id);
  }

  sameTeam(a: PlayerId, b: PlayerId): boolean {
    const ta = this.teamOf(a);
    return ta != null && ta === this.teamOf(b);
  }

  /** Secret payload for a player and their teammates (Teams share hands and visions). */
  private sec(payloads: Array<[PlayerId, Partial<EventBody>]>): Record<PlayerId, Partial<EventBody>> {
    const out: Record<PlayerId, Partial<EventBody>> = {};
    for (const [pid, body] of payloads) {
      for (const m of this.mates(pid)) out[m.id] = { ...(out[m.id] ?? {}), ...body } as Partial<EventBody>;
    }
    for (const [pid, body] of payloads) out[pid] = { ...(out[pid] ?? {}), ...body } as Partial<EventBody>;
    return out;
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
      dir: this.dir,
      lock: this.lock ? { ...this.lock } : null,
      wards: [...this.wards],
      last: this.lastPlayed,
    };
  }

  private emit(body: Body, durOverride?: number): void {
    const dur = durOverride ?? (DUR as Record<string, number>)[body.e] ?? 0;
    const ev = { ...body, n: ++this.seq, dur, sync: this.sync() } as GameEvent;
    this.out.push(ev);
    this.busyUntil = Math.max(this.busyUntil, this.now) + dur;
  }

  drain(): GameEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  isBusy(now: number): boolean {
    return now < this.busyUntil;
  }

  isLocked(t: CardType): boolean {
    return !!this.lock && this.lock.type === t;
  }

  /** Can this player save themselves from the Hooded Hand right now? */
  rescueCards(p: PlayerState): Card[] {
    return p.hand.filter(
      (c) => (c.type === 'angel' && !this.isLocked('angel')) || (c.type === 'glass' && this.lastPlayed === 'angel' && !this.isLocked('glass'))
    );
  }

  // ------------------------------------------------------------------ setup

  start(now: number): void {
    this.now = now;
    this.busyUntil = now;
    const st = this.setup;
    const firstId = st.first ?? this.rng.pick(this.players).id;
    this.cur = this.players.findIndex((p) => p.id === firstId);
    this.phase = 'intro';
    const n = this.players.length;

    const deals: Array<{ p: PlayerState; c: Card }> = [];
    if (st.hands && st.deck) {
      for (const p of this.players) for (const t of st.hands[p.id] ?? []) deals.push({ p, c: this.card(t) });
      this.deck = st.deck.map((t) => this.card(t));
    } else {
      const spare = n <= 3 ? 1 : n <= 5 ? 2 : 3;
      // Enough action cards that, after the deal, about DECK_PER_PLAYER cards per player are left in the deck
      // (Hooded Hands and the spare Angels included).
      const size = DECK_PER_PLAYER * n + this.cfg.handSize * n - (n - 1) - spare;
      const pool = this.rng.shuffle(poolFor(this.cfg.deck, n, size).map((t) => this.card(t)));
      for (const p of this.players) deals.push({ p, c: this.card('angel') });
      for (let i = 0; i < this.cfg.handSize; i++) for (const p of this.players) deals.push({ p, c: pool.pop()! });
      for (let i = 0; i < n - 1; i++) pool.push(this.card('hand'));
      for (let i = 0; i < spare; i++) pool.push(this.card('angel'));
      this.rng.shuffle(pool);
      this.deck = pool;
    }
    const stash = this.deck;
    this.deck = [...deals.map((d) => d.c), ...stash];
    this.emit({ e: 'start', seats: this.players.map(seatOf), mode: this.cfg.mode, first: this.current.id });
    for (const d of interleave(this.players, deals)) {
      this.deck.shift();
      d.p.hand.push(d.c);
      this.emit({ e: 'deal', to: d.p.id, secret: this.sec([[d.p.id, { card: d.c }]]) }, n <= 2 ? DUR.deal : n <= 4 ? 220 : 170);
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
    if (this.lock) {
      this.lock.turns--;
      if (this.lock.turns <= 0) {
        const t = this.lock.type;
        this.lock = null;
        this.emit({ e: 'unlock', type: t });
      }
    }
    this.current.stats.turns++;
    this.emit({ e: 'turn', player: this.current.id, turnsLeft: turns, ms: this.cfg.turnMs });
    this.deadline = this.cfg.turnMs == null ? null : this.busyUntil + this.cfg.turnMs;
  }

  private resumeTurn(): void {
    this.phase = 'turn';
    this.pending = null;
    this.give = null;
    const bank = this.turnBank;
    this.turnBank = null;
    if (this.cfg.turnMs == null) this.deadline = null;
    else this.deadline = this.busyUntil + Math.max(6000, bank ?? this.cfg.turnMs);
  }

  private bankTurn(): void {
    if (this.phase === 'turn' && this.deadline != null) this.turnBank = Math.max(0, this.deadline - this.now);
  }

  private nextAliveAfter(idx: number): number {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const j = (((idx + k * this.dir) % n) + n) % n;
      if (this.players[j].alive) return j;
    }
    return idx;
  }

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
        if (this.phase !== 'turn') return fail('not now');
        if (busy) return fail('busy');
        const card = p.hand.find((c) => c.id === a.cardId);
        if (!card) return fail('no such card');
        const d = def(card.type);
        if (!d.playable) return fail('cannot play that now');
        if (this.isLocked(card.type)) return fail('that card is shackled');
        const mine = this.current.id === pid;
        if (d.timing === 'turn' && !mine) return fail('not your turn');
        if (d.timing !== 'turn' && d.timing !== 'quick') return fail('cannot play that now');
        // Looking Glass resolves as whatever was played last.
        let effect: CardType = card.type;
        if (card.type === 'glass') {
          if (!this.lastPlayed || !COPYABLE.has(this.lastPlayed)) return fail('nothing to copy');
          effect = this.lastPlayed;
          if (def(effect).timing === 'quick' && !mine) return fail('not your turn');
        }
        let target: PlayerId | undefined;
        if (MARKS.has(effect)) {
          const t = a.targetId ? this.player(a.targetId) : undefined;
          if (!t || !t.alive) return fail('bad target');
          if (effect === 'aegis') {
            if (this.teamOf(pid) != null && !this.sameTeam(pid, t.id) && t.id !== pid) return fail('ward a friend');
          } else {
            if (t.id === pid) return fail('bad target');
            if (effect === 'warband' && this.sameTeam(pid, t.id)) return fail('mark a rival');
          }
          target = t.id;
        }
        this.bankTurn();
        removeCard(p.hand, card.id);
        this.discard.push(card);
        p.stats.played++;
        if (card.type !== 'glass') this.lastPlayed = card.type;
        this.emit({ e: 'play', player: pid, card, effect, target });
        this.pending = { player: pid, card, effect, target, cancelled: false, burned: false, privateers: [] };
        this.openWindow();
        return ok();
      }
      case 'react': {
        if (this.phase !== 'reaction' || !this.pending) return fail('nothing to answer');
        const card = p.hand.find((c) => c.id === a.cardId);
        if (!card) return fail('no such card');
        if (def(card.type).timing !== 'reaction') return fail('not a reaction');
        if (this.isLocked(card.type)) return fail('that card is shackled');
        const pend = this.pending;
        if (card.type === 'misdirect') {
          if (!MARKS.has(pend.effect) || pend.effect === 'aegis' || pend.cancelled) return fail('nothing to misdirect');
          const t = a.targetId ? this.player(a.targetId) : undefined;
          if (!t || !t.alive || t.id === pend.target || t.id === pid) return fail('bad target');
          removeCard(p.hand, card.id);
          this.discard.push(card);
          p.stats.played++;
          pend.target = t.id;
          this.emit({ e: 'redirect', player: pid, card, target: t.id });
          this.openWindow();
          return ok();
        }
        if (card.type === 'privateer') {
          if (pend.player === pid || pend.privateers.some((x) => x.player === pid)) return fail('not now');
          removeCard(p.hand, card.id);
          p.stats.played++;
          pend.privateers.push({ player: pid, card });
          this.emit({ e: 'privateer', player: pid, card });
          this.openWindow();
          return ok();
        }
        // Parry or Dragon's Breath.
        removeCard(p.hand, card.id);
        this.discard.push(card);
        p.stats.played++;
        p.stats.parries++;
        pend.cancelled = !pend.cancelled;
        if (card.type === 'breath') pend.burned = true;
        this.emit({ e: 'parry', player: pid, card, cancelled: pend.cancelled, burned: card.type === 'breath' });
        this.openWindow();
        return ok();
      }
      case 'hold': {
        // A player reaching for a reaction card that needs a choice gets a few more seconds, once per card.
        if (this.phase !== 'reaction' || !this.pending || this.deadline == null) return fail('not now');
        if (this.holds.has(pid)) return fail('already waiting');
        if (!p.hand.some((c) => def(c.type).timing === 'reaction')) return fail('nothing to answer with');
        this.holds.add(pid);
        this.deadline = Math.max(this.deadline, now + 4500);
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
        const card = this.rescueCards(p).find((c) => c.id === a.cardId);
        if (!card) return fail('that cannot save you');
        removeCard(p.hand, card.id);
        this.discard.push(card);
        this.lastPlayed = 'angel';
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
      case 'give': {
        if (this.phase !== 'give' || !this.give || this.give.from !== pid) return fail('not now');
        const card = p.hand.find((c) => c.id === a.cardId);
        if (!card) return fail('no such card');
        this.doGive(card);
        return ok();
      }
      case 'scryDone': {
        if (this.phase !== 'scry' || this.pending?.player !== pid) return fail('not now');
        this.endScry();
        return ok();
      }
    }
  }

  private openWindow(): void {
    this.phase = 'reaction';
    this.holds.clear();
    const custom = this.pending && this.setup.reactionFor ? this.setup.reactionFor(this.pending) : null;
    const ms = custom ?? this.cfg.reactionMs;
    this.emit({ e: 'window', ms });
    this.deadline = this.busyUntil + ms;
  }

  private resolvePending(): void {
    const pend = this.pending!;
    const p = this.player(pend.player)!;
    this.emit({ e: 'resolve', player: pend.player, card: pend.card, effect: pend.effect, target: pend.target, cancelled: pend.cancelled });
    // Privateers: copy the card, or lose the Privateer to its owner if the card was cancelled.
    for (const claim of pend.privateers) {
      const cp = this.player(claim.player);
      if (!cp || !cp.alive) continue;
      if (pend.cancelled) {
        if (p.alive) {
          p.hand.push(claim.card);
          this.emit({ e: 'pass', from: claim.player, to: p.id, card: claim.card });
        } else this.discard.push(claim.card);
      } else {
        this.discard.push(claim.card);
        const copy = this.card(pend.card.type);
        cp.hand.push(copy);
        this.emit({ e: 'copy', player: cp.id, card: copy, from: p.id });
      }
    }
    pend.privateers = [];
    if (pend.cancelled) {
      if (pend.burned) {
        removeCard(this.discard, pend.card.id);
        const pos = this.rng.int(this.deck.length + 1);
        this.deck.splice(pos, 0, pend.card);
        this.emit({ e: 'burn', card: pend.card });
      }
      this.resumeTurn();
      return;
    }
    const target = pend.target ? this.player(pend.target) : undefined;
    if (target && HOSTILE.has(pend.effect) && this.wards.has(target.id)) {
      this.wards.delete(target.id);
      this.emit({ e: 'warded', target: target.id, card: pend.card });
      this.resumeTurn();
      return;
    }
    switch (pend.effect) {
      case 'scry': {
        const cards = this.deck.slice(0, 3);
        this.phase = 'scry';
        this.emit({ e: 'scry', player: p.id, ms: this.cfg.scryMs, secret: this.sec([[p.id, { cards }]]) });
        this.deadline = this.busyUntil + this.cfg.scryMs;
        return;
      }
      case 'slip':
        this.pending = null;
        this.endTurnUnit();
        return;
      case 'turnabout':
        this.pending = null;
        this.dir = this.dir === 1 ? -1 : 1;
        this.emit({ e: 'reverse', dir: this.dir });
        this.endTurnUnit();
        return;
      case 'bounty':
      case 'warband': {
        this.pending = null;
        if (!target || !target.alive) {
          if (p.id === this.current.id) this.endTurnUnit();
          else this.resumeTurn();
          return;
        }
        const add = pend.effect === 'warband' ? 3 : 2;
        const owed = (this.turnsLeft > 1 && p.id === this.current.id ? this.turnsLeft : 0) + add;
        this.emit({ e: 'owed', player: target.id, by: p.id, turnsLeft: owed });
        this.beginTurn(this.players.indexOf(target), owed);
        return;
      }
      case 'brawl':
        this.rng.shuffle(this.deck);
        this.emit({ e: 'shuffle', by: p.id });
        this.resumeTurn();
        return;
      case 'yule':
        this.rng.shuffle(this.deck);
        this.emit({ e: 'shuffle', by: p.id });
        if (this.deck.length) this.emit({ e: 'reveal', card: this.deck[0] });
        this.resumeTurn();
        return;
      case 'pickpocket': {
        if (target && target.alive && target.hand.length > 0) {
          this.give = { from: target.id, to: p.id };
          this.phase = 'give';
          this.emit({ e: 'givePrompt', from: target.id, to: p.id, ms: this.cfg.giveMs });
          this.deadline = this.busyUntil + this.cfg.giveMs;
          return;
        }
        this.emit({ e: 'steal', from: target?.id ?? p.id, to: p.id }, 600);
        this.resumeTurn();
        return;
      }
      case 'backdoor':
        this.pending = null;
        this.doDraw(true);
        return;
      case 'shackles': {
        // The card beneath this one on the pile gets chained.
        const under = this.discard[this.discard.length - 2];
        if (under && under.type !== 'hand' && under.type !== 'shackles') {
          this.lock = { type: under.type, turns: 3 };
          this.emit({ e: 'lock', player: p.id, type: under.type, turns: 3 });
        }
        this.resumeTurn();
        return;
      }
      case 'aegis':
        if (target) {
          this.wards.add(target.id);
          this.emit({ e: 'ward', player: p.id, target: target.id });
        }
        this.resumeTurn();
        return;
      case 'sands': {
        const idx = this.discard.length - 2;
        const under = this.discard[idx];
        if (under && under.type !== 'hand') {
          this.discard.splice(idx, 1);
          p.hand.push(under);
          this.emit({ e: 'retake', player: p.id, card: under });
        }
        this.resumeTurn();
        return;
      }
      case 'mistletoe': {
        if (target && target.alive) {
          const a = p.hand;
          p.hand = target.hand;
          target.hand = a;
          this.emit({
            e: 'swap',
            a: p.id,
            b: target.id,
            secret: this.sec([
              [p.id, { handA: p.hand.map((c) => ({ ...c })) }],
              [target.id, { handB: target.hand.map((c) => ({ ...c })) }],
            ]),
          });
        }
        this.resumeTurn();
        return;
      }
      default:
        this.resumeTurn();
    }
  }

  private doGive(card: Card): void {
    const g = this.give!;
    const from = this.player(g.from)!;
    const to = this.player(g.to)!;
    removeCard(from.hand, card.id);
    to.hand.push(card);
    to.stats.steals++;
    this.emit({ e: 'steal', from: from.id, to: to.id, secret: this.sec([[from.id, { card }], [to.id, { card }]]) });
    this.give = null;
    this.resumeTurn();
  }

  private doDraw(bottom: boolean): void {
    const p = this.current;
    if (this.deck.length === 0) {
      this.endTurnUnit();
      return;
    }
    const card = bottom ? this.deck.pop()! : this.deck.shift()!;
    p.stats.drawn++;
    if (card.type === 'hand') {
      this.emit({ e: 'draw', player: p.id, card, bottom }, DRAW_HAND);
      const hasAngel = this.rescueCards(p).length > 0;
      this.doom = { player: p.id, card };
      this.phase = 'rescue';
      const ms = hasAngel ? this.cfg.rescueMs : 2600;
      this.emit({ e: 'doom', player: p.id, card, ms, secret: { [p.id]: { hasAngel } } });
      this.deadline = this.busyUntil + ms;
      return;
    }
    p.hand.push(card);
    this.emit({ e: 'draw', player: p.id, bottom, secret: this.sec([[p.id, { card }]]) });
    this.endTurnUnit();
  }

  private doHide(position: number): void {
    const d = this.doom!;
    const pos = Math.max(0, Math.min(this.deck.length, Math.floor(position)));
    this.deck.splice(pos, 0, d.card);
    this.doom = null;
    this.emit({ e: 'hidden', player: d.player, secret: this.sec([[d.player, { position: pos }]]) });
    // Surviving the Hooded Hand ends all of your turns, however many you still owed.
    this.turnsLeft = 1;
    this.endTurnUnit();
  }

  private endScry(): void {
    this.emit({ e: 'scryEnd', player: this.pending?.player ?? this.current.id });
    this.resumeTurn();
  }

  private slay(pid: PlayerId): void {
    const p = this.player(pid)!;
    const doomCard = this.doom!.card;
    this.doom = null;
    p.alive = false;
    p.stats.slain++;
    this.wards.delete(pid);
    const discarded = p.hand.splice(0);
    this.discard.push(doomCard, ...discarded);
    this.emit({ e: 'slain', player: pid, doom: doomCard, discarded });
    if (this.checkOver()) return;
    this.beginTurn(this.nextAliveAfter(this.players.indexOf(p)), 1);
  }

  /** Finish if one player (or one team) remains. */
  private checkOver(): boolean {
    const left = this.alive();
    const teams = new Set(left.map((p) => (p.team != null ? 't' + p.team : 'p' + p.id)));
    if (teams.size > 1) return false;
    const w = left[0];
    const winners = w ? (w.team != null ? this.players.filter((p) => p.team === w.team).map((p) => p.id) : [w.id]) : [];
    this.finish(w?.id ?? null, winners);
    return true;
  }

  private finish(winner: PlayerId | null, winners: PlayerId[]): void {
    this.phase = 'over';
    this.winner = winner;
    this.deadline = null;
    const stats: Record<PlayerId, PlayerStats> = {};
    for (const p of this.players) stats[p.id] = { ...p.stats };
    this.emit({ e: 'over', winner, winners, stats });
  }

  forfeit(pid: PlayerId, now: number): void {
    this.now = now;
    const p = this.player(pid);
    if (!p || !p.alive || this.phase === 'over') return;
    const fake = this.card('hand');
    const wasCurrent = this.current.id === pid;
    p.alive = false;
    const discarded = p.hand.splice(0);
    this.emit({ e: 'slain', player: pid, doom: fake, discarded });
    if (this.doom?.player === pid) this.doom = null;
    if (this.give && (this.give.from === pid || this.give.to === pid)) this.give = null;
    if (this.checkOver()) return;
    if (wasCurrent) this.beginTurn(this.nextAliveAfter(this.cur), 1);
  }

  // ------------------------------------------------------------------ clock

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
      case 'give': {
        const from = this.player(this.give!.from)!;
        this.doGive(from.hand[this.rng.int(from.hand.length)]);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ views

  view(pid: PlayerId, now: number): PlayerView {
    const p = this.player(pid);
    const mates: Record<PlayerId, Card[]> = {};
    for (const m of this.mates(pid)) mates[m.id] = m.hand.map((c) => ({ ...c }));
    const pend = this.pending;
    return {
      you: pid,
      phase: this.phase,
      seats: this.players.map(seatOf),
      hand: p ? p.hand.map((c) => ({ ...c })) : [],
      sync: this.sync(),
      pending: pend ? { player: pend.player, card: pend.card, effect: pend.effect, target: pend.target, cancelled: pend.cancelled, burned: pend.burned } : null,
      doomed: this.doom?.player ?? null,
      give: this.give ? { ...this.give } : null,
      busy: this.isBusy(now),
      mates,
    };
  }
}

function seatOf(p: PlayerState): SeatInfo {
  return { id: p.id, name: p.name, isBot: p.isBot, seat: p.seat, epithet: p.epithet, cloak: p.cloak, team: p.team, look: p.look };
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
