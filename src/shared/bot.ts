import { type Card, type CardType, def } from './cards';
import { Rng } from './rng';
import type { Action, GameEvent, PlayerId, PlayerView } from './types';

/** How much a bot hates giving a card away (higher = keep). */
const VALUE: Partial<Record<CardType, number>> = {
  angel: 100,
  glass: 40,
  parry: 30,
  breath: 32,
  misdirect: 34,
  bounty: 26,
  warband: 28,
  aegis: 24,
  scry: 20,
  slip: 18,
  turnabout: 17,
  backdoor: 15,
  shackles: 16,
  sands: 19,
  privateer: 14,
  pickpocket: 12,
  mistletoe: 13,
  brawl: 8,
  yule: 9,
};

const ESCAPES: CardType[] = ['bounty', 'warband', 'slip', 'turnabout', 'backdoor'];

/**
 * Computer opponent. Sees exactly what a human in its seat would see (filtered events + its own view),
 * remembers what it has scried and acts with human-like delays.
 */
export class Bot {
  readonly id: PlayerId;
  protected rng: Rng;
  protected known: (CardType | null)[] = [];
  protected readyAt = 0;
  protected lastKey = '';
  protected playedThisTurn = 0;
  protected skill: number;
  /** An enemy just hid the Hand somewhere they know: shuffle if we can. */
  protected enemyKnows = false;

  constructor(id: PlayerId, seed: number, skill = 0.75) {
    this.id = id;
    this.rng = new Rng(seed);
    this.skill = skill;
  }

  retry(now: number): void {
    this.readyAt = now + 350;
  }

  observe(ev: GameEvent): void {
    switch (ev.e) {
      case 'scry':
        if (ev.cards) this.known = ev.cards.map((c) => c.type);
        break;
      case 'draw':
        if (!ev.bottom) this.known.shift();
        else if (this.known.length >= ev.sync.deck) this.known = [];
        break;
      case 'shuffle':
        this.known = [];
        this.enemyKnows = false;
        break;
      case 'reveal':
        this.known = [ev.card.type];
        break;
      case 'burn':
        this.known = [];
        break;
      case 'hidden':
        if (ev.position != null) {
          this.known = this.known.slice(0, ev.position);
          while (this.known.length < ev.position) this.known.push(null);
          this.known.splice(ev.position, 0, 'hand');
          this.enemyKnows = false;
        } else {
          this.known = [];
          this.enemyKnows = true;
        }
        break;
      case 'turn':
        if (ev.player === this.id) this.playedThisTurn = 0;
        break;
    }
  }

  tick(now: number, v: PlayerView): Action | null {
    if (v.phase === 'over' || v.busy) return null;
    const key = this.situationKey(v);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.readyAt = now + this.thinkTime(v);
      return null;
    }
    if (now < this.readyAt) return null;
    const a = this.decide(v);
    this.readyAt = Number.POSITIVE_INFINITY;
    if (a && (a.t === 'play' || a.t === 'react')) this.playedThisTurn++;
    return a;
  }

  protected situationKey(v: PlayerView): string {
    const p = v.pending;
    return [
      v.phase,
      v.sync.current,
      v.sync.turnsLeft,
      v.sync.deck,
      v.hand.length,
      p ? `${p.card.id}:${p.cancelled}:${p.target}` : '-',
      v.doomed ?? '-',
      v.give ? v.give.from : '-',
    ].join('|');
  }

  protected thinkTime(v: PlayerView): number {
    if (v.phase === 'reaction') return this.rng.range(450, 1100);
    if (v.phase === 'rescue') return this.rng.range(1300, 2600);
    if (v.phase === 'hide') return this.rng.range(1200, 2400);
    if (v.phase === 'scry') return this.rng.range(1600, 2600);
    if (v.phase === 'give') return this.rng.range(900, 1900);
    if (v.phase === 'turn' && v.sync.current !== this.id) return this.rng.range(1500, 3500);
    return this.rng.range(1100, 2300);
  }

  // ------------------------------------------------------------------ helpers

  protected locked(v: PlayerView, t: CardType): boolean {
    return v.sync.lock?.type === t;
  }

  protected has(v: PlayerView, t: CardType): Card | undefined {
    if (this.locked(v, t)) return undefined;
    return v.hand.find((c) => c.type === t);
  }

  protected team(v: PlayerView, id: PlayerId): number | undefined {
    return v.seats.find((s) => s.id === id)?.team;
  }

  protected friend(v: PlayerView, id: PlayerId): boolean {
    if (id === this.id) return true;
    const t = this.team(v, this.id);
    return t != null && t === this.team(v, id);
  }

  protected enemies(v: PlayerView): PlayerId[] {
    return v.sync.alive.filter((id) => !this.friend(v, id));
  }

  /** Whoever plays after us in the current direction. */
  protected nextPlayer(v: PlayerView): PlayerId | undefined {
    const order = v.seats.map((s) => s.id);
    const i = order.indexOf(this.id);
    const n = order.length;
    for (let k = 1; k <= n; k++) {
      const id = order[(((i + k * v.sync.dir) % n) + n) % n];
      if (v.sync.alive.includes(id)) return id;
    }
    return undefined;
  }

  protected danger(v: PlayerView): number {
    return v.sync.deck > 0 ? v.sync.handsInDeck / v.sync.deck : 1;
  }

  protected canRescue(v: PlayerView): boolean {
    return !!this.has(v, 'angel') || (v.sync.last === 'angel' && !!this.has(v, 'glass'));
  }

  // ------------------------------------------------------------------ decisions

  protected decide(v: PlayerView): Action | null {
    switch (v.phase) {
      case 'reaction':
        return this.react(v);
      case 'scry':
        return v.pending?.player === this.id ? { t: 'scryDone' } : null;
      case 'rescue': {
        if (v.doomed !== this.id) return null;
        const a = this.has(v, 'angel') ?? (v.sync.last === 'angel' ? this.has(v, 'glass') : undefined);
        return a ? { t: 'rescue', cardId: a.id } : null;
      }
      case 'hide':
        if (v.doomed !== this.id) return null;
        return { t: 'hide', position: this.hidePosition(v) };
      case 'give': {
        if (v.give?.from !== this.id || !v.hand.length) return null;
        const worst = [...v.hand].sort((a, b) => (VALUE[a.type] ?? 10) - (VALUE[b.type] ?? 10))[0];
        // Never hand a rival an angel if anything else will do.
        return { t: 'give', cardId: worst.id };
      }
      case 'turn':
        if (v.sync.current !== this.id) return this.offTurn(v);
        return this.takeTurn(v);
    }
    return null;
  }

  /** Quick plays on someone else's turn. */
  protected offTurn(v: PlayerView): Action | null {
    if (this.enemyKnows && this.rng.next() < 0.6) {
      const s = this.has(v, 'brawl') ?? this.has(v, 'yule');
      if (s) {
        this.enemyKnows = false;
        return { t: 'play', cardId: s.id };
      }
    }
    return null;
  }

  protected react(v: PlayerView): Action | null {
    const p = v.pending;
    if (!p) return null;
    const smart = this.rng.next() < this.skill;
    const parry = this.has(v, 'parry') ?? this.has(v, 'breath');
    const mis = this.has(v, 'misdirect');
    const mine = p.player === this.id;
    const friendly = this.friend(v, p.player);
    const hostile = ['bounty', 'warband', 'pickpocket', 'mistletoe'].includes(p.effect);
    const aimedAtFriend = p.target != null && this.friend(v, p.target);

    // A rival marks me or my teammate.
    if (!p.cancelled && hostile && aimedAtFriend && !friendly) {
      const others = this.enemies(v).filter((e) => e !== p.player && e !== p.target);
      if (mis && (smart || p.effect !== 'pickpocket')) {
        const to = others.length ? this.rng.pick(others) : p.player;
        if (to !== p.target && to !== p.player) return { t: 'react', cardId: mis.id, targetId: to };
      }
      if (parry && (p.effect !== 'pickpocket' || this.rng.next() < 0.45) && (this.danger(v) > 0.1 || smart)) return { t: 'react', cardId: parry.id };
      return null;
    }
    // My (or my team's) card got cancelled: fight back when it matters.
    if (p.cancelled && friendly && parry) {
      const vital = ESCAPES.includes(p.effect);
      if (vital && (this.known[0] === 'hand' || (smart && this.danger(v) > 0.25))) return { t: 'react', cardId: parry.id };
      return null;
    }
    // A rival is dodging the deck. If I know the top is deadly, deny the escape.
    if (!p.cancelled && !friendly && ESCAPES.includes(p.effect) && parry) {
      if (this.known[0] === 'hand' && smart) return { t: 'react', cardId: parry.id };
      if (this.danger(v) > 0.3 && this.rng.next() < 0.25) return { t: 'react', cardId: parry.id };
    }
    // Copy something good.
    const pv = this.has(v, 'privateer');
    if (pv && !mine && !p.cancelled && (VALUE[p.card.type] ?? 0) >= 18 && this.rng.next() < 0.6) return { t: 'react', cardId: pv.id };
    return null;
  }

  protected hidePosition(v: PlayerView): number {
    const deck = v.sync.deck;
    const next = this.nextPlayer(v);
    const nextIsFriend = next != null && this.friend(v, next);
    const r = this.rng.next();
    if (nextIsFriend) return Math.min(deck, 2 + this.rng.int(Math.max(1, deck - 1)));
    if (r < 0.45) return 0;
    if (r < 0.7) return Math.min(deck, 1);
    if (r < 0.85) return Math.min(deck, 2 + this.rng.int(2));
    return this.rng.int(deck + 1);
  }

  protected takeTurn(v: PlayerView): Action {
    const enemies = this.enemies(v);
    const next = this.nextPlayer(v);
    const nextEnemy = next && !this.friend(v, next) ? next : undefined;
    const richest = [...enemies].sort((a, b) => (v.sync.hands[b] ?? 0) - (v.sync.hands[a] ?? 0))[0];
    const top = this.known[0];
    const d = this.danger(v);
    const safe = this.canRescue(v);
    const cap = this.playedThisTurn >= 3;
    const pileTop = v.sync.last;

    const play = (t: CardType, target?: PlayerId): Action | null => {
      const c = this.has(v, t);
      if (!c) return null;
      if (def(t).targeted && !target) return null;
      return { t: 'play', cardId: c.id, targetId: def(t).targeted ? target : undefined };
    };
    const glassAs = (types: CardType[], target?: PlayerId): Action | null => {
      if (!pileTop || !types.includes(pileTop)) return null;
      const c = this.has(v, 'glass');
      if (!c) return null;
      if (def(pileTop).targeted && !target) return null;
      return { t: 'play', cardId: c.id, targetId: def(pileTop).targeted ? target : undefined };
    };
    const victim = nextEnemy ?? (enemies.length ? this.rng.pick(enemies) : undefined);

    if (!cap) {
      // Chain the Angels if the deadly card is about to reach a rival.
      if (pileTop === 'angel' && top === 'hand' && this.has(v, 'shackles') && this.rng.next() < 0.5 + this.skill * 0.4) return play('shackles')!;
      // Take back a discarded Angel.
      if (!safe && pileTop === 'angel') {
        const s = play('sands');
        if (s) return s;
      }
      if (top === 'hand') {
        const esc =
          play('bounty', victim) ??
          play('warband', victim) ??
          glassAs(['bounty', 'warband', 'slip', 'turnabout'], victim) ??
          play('slip') ??
          (v.sync.dir && enemies.length >= 1 ? play('turnabout') : null) ??
          (this.known.length < v.sync.deck ? play('backdoor') : null) ??
          play('brawl') ??
          play('yule');
        if (esc) return esc;
        return { t: 'draw' };
      }
      if (top) {
        if (this.rng.next() < 0.4) {
          const pp = richest && (v.sync.hands[richest] ?? 0) > 0 ? play('pickpocket', richest) : null;
          if (pp) return pp;
        }
        return { t: 'draw' };
      }
      // Unknown top.
      if (d >= 0.16 && this.rng.next() < 0.55 + this.skill * 0.3) {
        const s = play('scry') ?? glassAs(['scry']);
        if (s) return s;
      }
      if (this.team(v, this.id) != null && this.rng.next() < 0.5) {
        const mates = v.sync.alive.filter((id) => this.friend(v, id) && !v.sync.wards.includes(id));
        const ward = mates.length ? play('aegis', safe ? this.rng.pick(mates) : this.id) : null;
        if (ward && !v.sync.wards.includes(this.id)) return ward;
      }
      if (!safe && richest && (v.sync.hands[richest] ?? 0) >= 3 && this.rng.next() < 0.35) {
        const m = play('mistletoe', richest);
        if (m) return m;
      }
      if (this.rng.next() < 0.3 && richest && (v.sync.hands[richest] ?? 0) > 0) {
        const pp = play('pickpocket', richest);
        if (pp) return pp;
      }
      if (!safe && d >= 0.2) {
        const esc = play('bounty', victim) ?? play('warband', victim) ?? play('slip') ?? play('turnabout') ?? play('backdoor');
        if (esc && this.rng.next() < 0.75) return esc;
      }
      if (safe && d >= 0.4 && this.rng.next() < 0.45) {
        const esc = play('slip') ?? play('bounty', victim) ?? play('turnabout');
        if (esc) return esc;
      }
      if (v.sync.turnsLeft > 1 && this.rng.next() < 0.6) {
        const esc = play('bounty', victim) ?? play('warband', victim) ?? play('slip') ?? play('turnabout');
        if (esc) return esc;
      }
    }
    return { t: 'draw' };
  }
}
