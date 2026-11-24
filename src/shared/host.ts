import { Bot } from './bot';
import { BOT_EMOTE_COOLDOWN_MS, botReaction, type EmoteId } from './emotes';
import { Engine, filterFor, type Setup } from './engine';
import type { Action, GameConfig, GameEvent, PlayerId, PlayResult, SeatInfo } from './types';

export type Listener = (ev: GameEvent) => void;

/**
 * Runs one match: the engine, any bots, and delivery of filtered events to human listeners.
 * Environment-agnostic: the browser drives it with setInterval for bot games, the server drives it
 * per room for online games.
 */
export class Host {
  readonly engine: Engine;
  private bots = new Map<PlayerId, Bot>();
  private listeners = new Map<PlayerId, Set<Listener>>();
  /** Every event so far (unfiltered), for late joiners / reconnects. */
  readonly log: GameEvent[] = [];
  started = false;
  /** Tavern regulars' emotes (cosmetic; delivered outside the event stream). */
  onEmote: ((from: PlayerId, id: EmoteId) => void) | null = null;
  private emotes: Array<{ from: PlayerId; id: EmoteId; at: number }> = [];
  private lastEmote = new Map<PlayerId, number>();

  constructor(cfg: GameConfig, seats: SeatInfo[], setup: Setup = {}, bots: Bot[] = []) {
    this.engine = new Engine(cfg, seats, setup);
    for (const b of bots) this.bots.set(b.id, b);
  }

  listen(pid: PlayerId, fn: Listener): () => void {
    if (!this.listeners.has(pid)) this.listeners.set(pid, new Set());
    this.listeners.get(pid)!.add(fn);
    return () => this.listeners.get(pid)?.delete(fn);
  }

  /** Events this player is allowed to see so far (for reconnects). */
  history(pid: PlayerId): GameEvent[] {
    return this.log.map((e) => filterFor(e, pid));
  }

  start(now: number): void {
    if (this.started) return;
    this.started = true;
    this.engine.start(now);
    this.flush(now);
  }

  act(pid: PlayerId, a: Action, now: number): PlayResult {
    const r = this.engine.act(pid, a, now);
    this.flush(now);
    return r;
  }

  tick(now: number): void {
    if (!this.started) return;
    this.engine.update(now);
    this.flush(now);
    if (this.emotes.length && this.onEmote) {
      const due = this.emotes.filter((e) => e.at <= now);
      this.emotes = this.emotes.filter((e) => e.at > now);
      for (const e of due) this.onEmote(e.from, e.id);
    }
    for (const bot of this.bots.values()) {
      const p = this.engine.player(bot.id);
      if (!p || !p.alive) continue;
      const a = bot.tick(now, this.engine.view(bot.id, now));
      if (a) {
        const r = this.engine.act(bot.id, a, now);
        if (!r.ok) bot.retry(now);
        this.flush(now);
      }
    }
  }

  private maybeEmote(bot: PlayerId, ev: GameEvent, now: number): void {
    const alive = this.engine.player(bot)?.alive;
    if (!alive && ev.e !== 'over') return;
    if (now - (this.lastEmote.get(bot) ?? -Infinity) < BOT_EMOTE_COOLDOWN_MS) return;
    const r = botReaction(ev, bot);
    if (!r) return;
    this.lastEmote.set(bot, now);
    this.emotes.push({ from: bot, id: r.id, at: now + r.delay });
  }

  leave(pid: PlayerId, now: number): void {
    this.engine.forfeit(pid, now);
    this.flush(now);
  }

  private flush(now: number): void {
    const evs = this.engine.drain();
    for (const ev of evs) {
      this.log.push(ev);
      for (const bot of this.bots.values()) {
        bot.observe(filterFor(ev, bot.id));
        if (this.onEmote) this.maybeEmote(bot.id, ev, now);
      }
      for (const [pid, set] of this.listeners) {
        const f = filterFor(ev, pid);
        for (const fn of set) fn(f);
      }
    }
  }
}
