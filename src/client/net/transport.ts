import { createLocalMatch, HUMAN_ID, type LocalMatchOptions } from '../../shared/match';
import type { Host } from '../../shared/host';
import type { Action, GameEvent, GameMode, PlayerId, PlayResult } from '../../shared/types';

/**
 * How the match screen talks to the authoritative game. Bot games run the host locally;
 * online games (see WsTransport) talk to the server, which runs the very same Host.
 */
export interface Transport {
  readonly me: PlayerId;
  onEvent(fn: (ev: GameEvent) => void): void;
  send(a: Action): Promise<PlayResult>;
  start(): void;
  dispose(): void;
}

export class LocalTransport implements Transport {
  readonly me = HUMAN_ID;
  readonly host: Host;
  private timer: number | null = null;
  private fn: ((ev: GameEvent) => void) | null = null;
  private t0 = performance.now();

  constructor(opts: LocalMatchOptions) {
    this.host = createLocalMatch(opts).host;
    this.host.listen(this.me, (ev) => this.fn?.(ev));
  }

  private now(): number {
    return performance.now() - this.t0;
  }

  onEvent(fn: (ev: GameEvent) => void): void {
    this.fn = fn;
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

/** Online transport (server runs the Host). Not exposed in the UI yet. */
export class WsTransport implements Transport {
  me: PlayerId = '';
  private ws: WebSocket;
  private fn: ((ev: GameEvent) => void) | null = null;
  private pending = new Map<number, (r: PlayResult) => void>();
  private seq = 0;
  private queue: GameEvent[] = [];

  constructor(url: string, room: string, name: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => this.ws.send(JSON.stringify({ t: 'join', room, name })));
    this.ws.addEventListener('message', (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.t === 'welcome') this.me = msg.you;
      else if (msg.t === 'event') {
        if (this.fn) this.fn(msg.ev);
        else this.queue.push(msg.ev);
      } else if (msg.t === 'result') {
        this.pending.get(msg.id)?.(msg.result);
        this.pending.delete(msg.id);
      }
    });
  }

  onEvent(fn: (ev: GameEvent) => void): void {
    this.fn = fn;
    for (const e of this.queue.splice(0)) fn(e);
  }

  send(a: Action): Promise<PlayResult> {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ t: 'action', id, action: a }));
    return new Promise((res) => this.pending.set(id, res));
  }

  start(): void {
    this.ws.readyState === WebSocket.OPEN ? this.ws.send(JSON.stringify({ t: 'ready' })) : this.ws.addEventListener('open', () => this.ws.send(JSON.stringify({ t: 'ready' })));
  }

  dispose(): void {
    this.ws.close();
  }
}
