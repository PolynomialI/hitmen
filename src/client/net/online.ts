// The browser side of an online table: one WebSocket to the server that served this page (same origin only),
// with automatic reconnects and resume-after-reload (the seat token lives in sessionStorage).
import { isEmote, type EmoteId } from '../../shared/emotes';
import type { ClientMsg, LobbyInfo, Look, OnlineMode, RoomSummary, ServerMsg } from '../../shared/online';
import type { Action, GameEvent, PlayResult } from '../../shared/types';

const STORE = 'hooded-hand-online';

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface SessionHandlers {
  lobby?: (l: LobbyInfo) => void;
  /** Non-fatal problems (e.g. "too many players on one team"). */
  error?: (message: string) => void;
  /** The session is over for good (left, table closed, or the connection could not be restored). */
  closed?: (message: string | null) => void;
  state?: (s: ConnState) => void;
  presence?: (id: string, connected: boolean) => void;
  emote?: (from: string, id: EmoteId) => void;
}

function wsUrl(): string {
  const u = new URL('ws', location.href);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.search = '';
  u.hash = '';
  return u.href;
}

async function getJson<T>(path: string, ms = 2500): Promise<T | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(new URL(path, location.href), { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

let available: Promise<boolean> | null = null;
/** Is a game server behind this page? (No server when the client is served on its own, e.g. `npm run dev` alone.) */
export function serverAvailable(): Promise<boolean> {
  available ??= getJson<{ online?: boolean }>('api/info').then((j) => j?.online === true);
  return available;
}

export async function listRooms(): Promise<RoomSummary[]> {
  return (await getJson<RoomSummary[]>('api/rooms')) ?? [];
}

export class OnlineSession {
  /** The one live table session, if any. */
  static current: OnlineSession | null = null;

  me = '';
  room = '';
  lobby: LobbyInfo | null = null;
  state: ConnState = 'connecting';
  /** Events of the current match received so far. */
  private received = 0;
  /** The round those events belong to. */
  private eventsRound = -1;
  private token = '';
  private ws: WebSocket | null = null;
  private hello: ClientMsg;
  private buffer: Array<{ ev: GameEvent; replay: boolean }> = [];
  private sink: ((ev: GameEvent, replay: boolean) => boolean) | null = null;
  private handlers = new Set<SessionHandlers>();
  private pending = new Map<number, (r: PlayResult) => void>();
  private seq = 0;
  private retries = 0;

  private constructor(hello: ClientMsg) {
    OnlineSession.current?.leave();
    OnlineSession.current = this;
    this.hello = hello;
    if (hello.t === 'rejoin') {
      this.room = hello.room;
      this.token = hello.token;
    }
    this.connect();
  }

  static create(o: { name: string; look?: Look; mode: OnlineMode; size: number; public: boolean }): OnlineSession {
    return new OnlineSession({ t: 'create', ...o });
  }

  static join(room: string, name: string, look?: Look): OnlineSession {
    return new OnlineSession({ t: 'join', room, name, look });
  }

  /** After a page reload: take the seat back if this tab was at a table. */
  static resume(): OnlineSession | null {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) ?? 'null');
      if (s && typeof s.room === 'string' && typeof s.token === 'string') return new OnlineSession({ t: 'rejoin', room: s.room, token: s.token, since: 0, round: -1 });
    } catch {
      /* storage unavailable */
    }
    return null;
  }

  on(h: SessionHandlers): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  private emit<K extends keyof SessionHandlers>(k: K, ...args: Parameters<NonNullable<SessionHandlers[K]>>): void {
    for (const h of [...this.handlers]) (h[k] as ((...a: unknown[]) => void) | undefined)?.(...args);
  }

  private setState(s: ConnState): void {
    if (this.state === s) return;
    this.state = s;
    this.emit('state', s);
  }

  // ------------------------------------------------------------------ connection

  private connect(): void {
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.addEventListener('open', () => {
      const hello: ClientMsg = this.token ? { t: 'rejoin', room: this.room, token: this.token, since: this.received, round: this.eventsRound } : this.hello;
      ws.send(JSON.stringify(hello));
    });
    ws.addEventListener('message', (m) => {
      try {
        this.onMsg(JSON.parse(String(m.data)) as ServerMsg);
      } catch (e) {
        console.error('online message failed', e);
      }
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.state !== 'closed') this.reconnect();
    });
  }

  private reconnect(): void {
    if (!this.token) return this.close('Could not reach the tavern. Is the game server running?');
    if (this.retries >= 14) return this.close('Lost the connection to the table.');
    this.setState('reconnecting');
    const wait = Math.min(5000, 300 * 2 ** this.retries++);
    setTimeout(() => this.state !== 'closed' && this.connect(), wait);
  }

  private onMsg(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        this.me = m.you;
        this.token = m.token;
        this.room = m.room;
        this.retries = 0;
        try {
          sessionStorage.setItem(STORE, JSON.stringify({ room: m.room, token: m.token }));
        } catch {
          /* storage unavailable: no resume after reload */
        }
        this.setState('open');
        return;
      case 'lobby':
        this.lobby = m.lobby;
        this.emit('lobby', m.lobby);
        return;
      case 'history':
        // from 0 = the whole match so far (after a reload, or the table moved on): replay it instantly.
        if (m.from === 0) this.received = 0;
        for (const ev of m.evs) this.deliver(ev, m.from === 0);
        return;
      case 'event':
        this.deliver(m.ev, false);
        return;
      case 'result':
        this.pending.get(m.id)?.(m.result);
        this.pending.delete(m.id);
        return;
      case 'presence':
        this.emit('presence', m.id, m.connected);
        return;
      case 'emote':
        if (isEmote(m.id)) this.emit('emote', m.from, m.id);
        return;
      case 'error':
        if (m.fatal) this.close(m.message);
        else this.emit('error', m.message);
        return;
    }
  }

  private deliver(ev: GameEvent, replay: boolean): void {
    if (ev.e === 'start') {
      this.received = 0;
      this.eventsRound = this.lobby?.round ?? 0;
      // Nobody is showing the table (waiting room): only the newest match matters.
      if (!this.sink) this.buffer.length = 0;
    }
    this.received++;
    this.buffer.push({ ev, replay });
    this.flush();
  }

  private flush(): void {
    while (this.sink && this.buffer.length) {
      const { ev, replay } = this.buffer[0];
      if (!this.sink(ev, replay)) break;
      this.buffer.shift();
    }
  }

  /** Game events go to one consumer (the match screen). It may refuse an event (returns false) to leave it queued. */
  attach(sink: (ev: GameEvent, replay: boolean) => boolean): void {
    this.sink = sink;
    this.flush();
  }

  detach(sink: (ev: GameEvent, replay: boolean) => boolean): void {
    if (this.sink === sink) this.sink = null;
  }

  // ------------------------------------------------------------------ commands

  private send(msg: ClientMsg): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  action(a: Action): Promise<PlayResult> {
    const id = ++this.seq;
    if (!this.send({ t: 'action', id, action: a })) return Promise.resolve({ ok: false, err: 'not connected' });
    return new Promise((res) => {
      this.pending.set(id, res);
      setTimeout(() => {
        if (this.pending.delete(id)) res({ ok: false, err: 'no answer' });
      }, 8000);
    });
  }

  start(): void {
    this.send({ t: 'start' });
  }

  again(): void {
    this.send({ t: 'again' });
  }

  emote(id: EmoteId): void {
    this.send({ t: 'emote', id });
  }

  setTeam(team: number): void {
    this.send({ t: 'team', team });
  }

  /** Give up the seat for good. */
  leave(): void {
    this.send({ t: 'leave' });
    this.close(null);
  }

  private close(message: string | null): void {
    if (this.state === 'closed') return;
    this.setState('closed');
    try {
      sessionStorage.removeItem(STORE);
    } catch {
      /* ignore */
    }
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    for (const res of this.pending.values()) res({ ok: false, err: 'closed' });
    this.pending.clear();
    if (OnlineSession.current === this) OnlineSession.current = null;
    this.emit('closed', message);
  }
}
