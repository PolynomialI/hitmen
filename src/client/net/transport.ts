import { createLocalMatch, HUMAN_ID, type LocalMatchOptions } from '../../shared/match';
import type { Host } from '../../shared/host';
import type { Action, GameEvent, PlayerId, PlayResult } from '../../shared/types';
import type { OnlineSession } from './online';

/**
 * How the match screen talks to the authoritative game. Bot games run the host locally;
 * online games (see WsTransport) talk to the server, which runs the very same Host.
 */
export interface Transport {
  readonly me: PlayerId;
  /**
   * Receive game events in order. `replay` marks events of a match being rebuilt after a reload (show them at once).
   * Online, the handler may return false to leave an event queued (a new round starting while the results show).
   */
  onEvent(fn: (ev: GameEvent, replay: boolean) => boolean | void): void;
  send(a: Action): Promise<PlayResult>;
  start(): void;
  dispose(): void;
}

export class LocalTransport implements Transport {
  readonly me: string;
  readonly host: Host;
  private timer: number | null = null;
  private fn: ((ev: GameEvent) => void) | null = null;
  private t0 = performance.now();

  constructor(opts: LocalMatchOptions) {
    this.me = opts.spectate ? 'spectator' : HUMAN_ID;
    this.host = createLocalMatch(opts).host;
    this.host.listen(this.me, (ev) => this.fn?.(ev));
  }

  private now(): number {
    return performance.now() - this.t0;
  }

  onEvent(fn: (ev: GameEvent, replay: boolean) => boolean | void): void {
    this.fn = (ev) => void fn(ev, false);
  }

  send(a: Action): Promise<PlayResult> {
    return Promise.resolve(this.host.act(this.me, a, this.now()));
  }

  start(): void {
    this.host.start(this.now());
    this.timer = window.setInterval(() => this.host.tick(this.now()), 50);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.fn = null;
  }
}

/** Online table: the server runs the Host; events and actions go through the table's OnlineSession. */
export class WsTransport implements Transport {
  private sink: ((ev: GameEvent, replay: boolean) => boolean) | null = null;

  constructor(readonly session: OnlineSession) {}

  get me(): PlayerId {
    return this.session.me;
  }

  onEvent(fn: (ev: GameEvent, replay: boolean) => boolean | void): void {
    this.sink = (ev, replay) => fn(ev, replay) !== false;
    this.session.attach(this.sink);
  }

  send(a: Action): Promise<PlayResult> {
    return this.session.action(a);
  }

  /** The server starts the match. */
  start(): void {}

  dispose(): void {
    if (this.sink) this.session.detach(this.sink);
    this.sink = null;
  }
}
