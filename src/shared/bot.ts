import type { Card, CardType } from './cards';
import { Rng } from './rng';
import type { Action, GameEvent, PlayerId, PlayerView } from './types';

/**
 * Computer opponent. Sees exactly what a human in its seat would see (filtered events + its own view),
 * and remembers what it has scried. Acts with human-like delays.
 */
export class Bot {
  readonly id: PlayerId;
  protected rng: Rng;
  /** Known top-of-deck card types (index 0 = top). null = unknown. */
  protected known: (CardType | null)[] = [];
  protected readyAt = 0;
  protected lastKey = '';
  /** How many cards it has played this turn (so it does not dump its hand). */
  protected playedThisTurn = 0;
  protected skill: number;

  constructor(id: PlayerId, seed: number, skill = 0.75) {
    this.id = id;
    this.rng = new Rng(seed);
    this.skill = skill;
  }

  /** The last action was rejected (e.g. host still busy); try again shortly. */
  retry(now: number): void {
    this.readyAt = now + 350;
  }

  observe(ev: GameEvent): void {
    switch (ev.e) {
      case 'scry':
        if (ev.player === this.id && ev.cards) this.known = ev.cards.map((c) => c.type);
        break;
      case 'draw':
        if (!ev.bottom) this.known.shift();
        else if (this.known.length >= ev.sync.deck) this.known = [];
        break;
      case 'shuffle':
        this.known = [];
        break;
      case 'hidden':
        if (ev.player === this.id && ev.position != null) {
          while (this.known.length < ev.position) this.known.push(null);
          this.known.splice(ev.position, 0, 'hand');
        } else this.known = [];
        break;
      case 'turn':
        if (ev.player === this.id) this.playedThisTurn = 0;
        break;
    }
  }

  /** Called every host tick. Returns an action when the bot decides to do something. */
  tick(now: number, v: PlayerView): Action | null {
    if (v.phase === 'over' || v.busy) return null;
    const key = this.situationKey(v);
    if (key !== this.lastKey) {
      // New situation: think for a moment before acting, like a person would.
      this.lastKey = key;
      this.readyAt = now + this.thinkTime(v);
      return null;
    }
    if (now < this.readyAt) return null;
    const a = this.decide(v);
    // Whatever we did (or chose not to do), re-think after the next change.
    this.readyAt = Number.POSITIVE_INFINITY;
    if (a && (a.t === 'play' || a.t === 'parry')) this.playedThisTurn++;
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
      p ? `${p.card.id}:${p.cancelled}` : '-',
      v.doomed ?? '-',
    ].join('|');
  }

  protected thinkTime(v: PlayerView): number {
    if (v.phase === 'reaction') return this.rng.range(450, 1100);
    if (v.phase === 'rescue') return this.rng.range(1300, 2600);
    if (v.phase === 'hide') return this.rng.range(1200, 2400);
    if (v.phase === 'scry') return this.rng.range(1600, 2600);
    return this.rng.range(1100, 2300);
  }

  protected has(v: PlayerView, t: CardType): Card | undefined {
    return v.hand.find((c) => c.type === t);
  }

  protected opponents(v: PlayerView): PlayerId[] {
    return v.sync.alive.filter((id) => id !== this.id);
  }

  protected danger(v: PlayerView): number {
    return v.sync.deck > 0 ? v.sync.handsInDeck / v.sync.deck : 1;
  }

  protected decide(v: PlayerView): Action | null {
    switch (v.phase) {
      case 'reaction':
        return this.react(v);
      case 'scry':
        return v.sync.current === this.id ? { t: 'scryDone' } : null;
      case 'rescue': {
        if (v.doomed !== this.id) return null;
        const angel = this.has(v, 'angel');
        return angel ? { t: 'rescue', cardId: angel.id } : null;
      }
      case 'hide':
        if (v.doomed !== this.id) return null;
        return { t: 'hide', position: this.hidePosition(v) };
      case 'turn':
        if (v.sync.current !== this.id) return null;
        return this.takeTurn(v);
    }
    return null;
  }

  protected react(v: PlayerView): Action | null {
    const p = v.pending;
    if (!p) return null;
    const parry = this.has(v, 'parry');
    if (!parry) return null;
    const parries = v.hand.filter((c) => c.type === 'parry').length;
    const aimedAtMe = p.target === this.id;
    const mine = p.player === this.id;
    const smart = this.rng.next() < this.skill;
    if (!p.cancelled && aimedAtMe && !mine) {
      // Someone is hitting me. Bounty is worth stopping when the deck is dangerous.
      if (p.card.type === 'bounty' && (this.danger(v) > 0.12 || smart)) return { t: 'parry', cardId: parry.id };
      if (p.card.type === 'pickpocket' && (parries > 1 || this.rng.next() < 0.35)) return { t: 'parry', cardId: parry.id };
      return null;
    }
    if (p.cancelled && mine) {
      // My card got parried. Fight back if it matters.
      const vital = p.card.type === 'bounty' || p.card.type === 'slip' || p.card.type === 'backdoor';
      if (vital && this.known[0] === 'hand') return { t: 'parry', cardId: parry.id };
      if (vital && smart && this.danger(v) > 0.25) return { t: 'parry', cardId: parry.id };
      return null;
    }
    if (!p.cancelled && !mine && (p.card.type === 'slip' || p.card.type === 'backdoor')) {
      // Opponent is dodging. If I know the top is deadly, deny the escape.
      if (this.known[0] === 'hand' && parries > 0 && smart) return { t: 'parry', cardId: parry.id };
      if (parries >= 2 && this.danger(v) > 0.3 && this.rng.next() < 0.3) return { t: 'parry', cardId: parry.id };
    }
    return null;
  }

  protected hidePosition(v: PlayerView): number {
    const deck = v.sync.deck;
    const r = this.rng.next();
    if (r < 0.45) return 0; // right on top for the next player
    if (r < 0.7) return Math.min(deck, 1);
    if (r < 0.85) return Math.min(deck, 2 + this.rng.int(2));
    return this.rng.int(deck + 1);
  }

  protected takeTurn(v: PlayerView): Action {
    const opp = this.opponents(v);
    const target = opp.length ? this.rng.pick(opp) : undefined;
    const top = this.known[0];
    const d = this.danger(v);
    const angel = this.has(v, 'angel');
    const cap = this.playedThisTurn >= 3;

    const play = (t: CardType, withTarget = false): Action | null => {
      const c = this.has(v, t);
      if (!c) return null;
      if (withTarget && !target) return null;
      return { t: 'play', cardId: c.id, targetId: withTarget ? target : undefined };
    };

    if (!cap) {
      if (top === 'hand') {
        // Certain death (or a spent angel) on top: get out.
        const esc =
          play('bounty', true) ??
          play('slip') ??
          (this.known.length < v.sync.deck ? play('backdoor') : null) ??
          play('brawl');
        if (esc) return esc;
        return { t: 'draw' };
      }
      if (top) {
        // Safe draw ahead. Maybe steal something first.
        if (this.rng.next() < 0.45) {
          const pp = play('pickpocket', true);
          if (pp && target && (v.sync.hands[target] ?? 0) > 0) return pp;
        }
        return { t: 'draw' };
      }
      // Unknown top.
      if (d >= 0.18 && this.rng.next() < 0.55 + this.skill * 0.3) {
        const s = play('scry');
        if (s) return s;
      }
      if (this.rng.next() < 0.3) {
        const pp = play('pickpocket', true);
        if (pp && target && (v.sync.hands[target] ?? 0) > 0) return pp;
      }
      if (!angel && d >= 0.22) {
        const esc = play('bounty', true) ?? play('slip') ?? play('backdoor') ?? play('brawl');
        if (esc && this.rng.next() < 0.75) return esc;
      }
      if (angel && d >= 0.4 && this.rng.next() < 0.5) {
        const esc = play('slip') ?? play('bounty', true);
        if (esc) return esc;
      }
      if (v.sync.turnsLeft > 1 && this.rng.next() < 0.6) {
        const esc = play('bounty', true) ?? play('slip');
        if (esc) return esc;
      }
    }
    return { t: 'draw' };
  }
}
