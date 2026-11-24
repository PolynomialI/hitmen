// Online smoke test against a running server (npm run build && npm start, or npm run server:dev).
//   BASE=http://localhost:8787 npx tsx scripts/serverSmoke.ts
// Covers: room list API, create/join by code, errors, host-only start, bots filling seats, a dropped connection
// resuming with only the missed events, another round, full/private tables and team picks.
import WebSocket from 'ws';
import type { LobbyInfo, RoomSummary, ServerMsg } from '../src/shared/online';
import type { GameEvent } from '../src/shared/types';

const BASE = process.env.BASE || 'http://localhost:8787';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

class Player {
  ws!: WebSocket;
  me = '';
  token = '';
  room = '';
  lobby: LobbyInfo | null = null;
  events = 0;
  over: (GameEvent & { e: 'over' }) | null = null;
  start: (GameEvent & { e: 'start' }) | null = null;
  errors: string[] = [];
  historyFrom = -1;
  private hand: { id: number; type: string }[] = [];
  private seq = 0;
  private waiters: Array<() => void> = [];
  auto = true;

  constructor(readonly name: string) {}

  connect(): Promise<void> {
    this.ws = new WebSocket(WS_URL);
    this.ws.on('message', (raw) => this.onMsg(JSON.parse(String(raw)) as ServerMsg));
    return new Promise((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  act(action: unknown): void {
    this.send({ t: 'action', id: ++this.seq, action });
  }

  until(pred: () => boolean, label: string, ms = 30_000): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${this.name}: timeout waiting for ${label}`)), ms);
      const check = () => {
        if (pred()) {
          clearTimeout(t);
          this.waiters = this.waiters.filter((w) => w !== check);
          res();
        }
      };
      this.waiters.push(check);
    });
  }

  private onMsg(m: ServerMsg): void {
    if (m.t === 'welcome') Object.assign(this, { me: m.you, token: m.token, room: m.room });
    else if (m.t === 'lobby') this.lobby = m.lobby;
    else if (m.t === 'error') this.errors.push(m.message);
    else if (m.t === 'result' && !m.result.ok) setTimeout(() => this.auto && this.act({ t: 'draw' }), 300);
    else if (m.t === 'history') {
      this.historyFrom = m.from;
      for (const ev of m.evs) this.onEvent(ev);
    } else if (m.t === 'event') this.onEvent(m.ev);
    for (const w of [...this.waiters]) w();
  }

  private onEvent(ev: GameEvent): void {
    this.events++;
    const me = this.me;
    if (ev.e === 'start') {
      this.start = ev;
      this.over = null;
      this.hand = [];
    }
    if (ev.e === 'deal' && ev.to === me && ev.card) this.hand.push(ev.card);
    if (ev.e === 'draw' && ev.player === me && ev.card && ev.card.type !== 'hand') this.hand.push(ev.card);
    if ((ev.e === 'play' || ev.e === 'parry' || ev.e === 'rescue') && ev.player === me) this.hand = this.hand.filter((c) => c.id !== ev.card.id);
    if (ev.e === 'steal' && ev.card) {
      if (ev.from === me) this.hand = this.hand.filter((c) => c.id !== ev.card!.id);
      if (ev.to === me) this.hand.push(ev.card);
    }
    if (ev.e === 'over') this.over = ev;
    if (!this.auto) return;
    const later = (fn: () => void) => setTimeout(fn, ev.dur + 60);
    if (ev.e === 'turn' && ev.player === me) later(() => this.act({ t: 'draw' }));
    if (ev.e === 'doom' && ev.player === me) {
      const a = this.hand.find((c) => c.type === 'angel');
      if (a) later(() => this.act({ t: 'rescue', cardId: a.id }));
    }
    if (ev.e === 'hidePrompt' && ev.player === me) later(() => this.act({ t: 'hide', position: 0 }));
    if (ev.e === 'givePrompt' && ev.from === me && this.hand[0]) later(() => this.act({ t: 'give', cardId: this.hand[0].id }));
  }

  close(): void {
    this.ws.close();
  }
}

const getJson = async <T,>(path: string): Promise<T> => (await fetch(BASE + path)).json() as Promise<T>;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const info = await getJson<{ online: boolean }>('/api/info');
  assert(info.online, '/api/info says online');

  // ---- A public 3-seat Original table: list, join, start, drop + resume, finish, another round.
  const a = new Player('Alys');
  const b = new Player('Bram');
  await a.connect();
  a.send({ t: 'create', name: 'Alys 🐉', mode: 'original', size: 3, public: true, look: { seat: 'throne', charm: 'skull', bogus: 'x' } });
  await a.until(() => !!a.lobby, 'lobby after create');
  assert(a.lobby!.seats[0].name === 'Alys', 'name cleaned to safe glyphs: ' + a.lobby!.seats[0].name);
  assert(a.lobby!.seats[0].host, 'creator hosts');
  const listed = await getJson<RoomSummary[]>('/api/rooms');
  assert(listed.some((r) => r.code === a.room && r.players === 1 && r.mode === 'original'), 'public room listed');

  await b.connect();
  b.send({ t: 'join', room: a.room.toLowerCase(), name: 'Bram' });
  await a.until(() => a.lobby!.seats.length === 2, 'second seat');
  await b.until(() => b.lobby?.seats.length === 2, 'B sees lobby');

  const c = new Player('Cobb');
  await c.connect();
  c.send({ t: 'join', room: 'ZZZZZ', name: 'Cobb' });
  await c.until(() => c.errors.length > 0, 'bad code error');
  c.close();

  b.send({ t: 'start' });
  await pause(400);
  assert(a.lobby!.status === 'waiting', 'only the host may start');
  a.send({ t: 'start' });
  await a.until(() => !!a.start, 'start event');
  await b.until(() => !!b.start, 'B start event');
  assert(a.start!.seats.length === 3 && a.start!.seats.filter((s) => s.isBot).length === 1, 'a bot fills the empty seat');
  assert(a.start!.seats.find((s) => s.id === a.me)?.look?.seat === 'throne', 'seat look carried');
  assert(!(await getJson<RoomSummary[]>('/api/rooms')).some((r) => r.code === a.room), 'playing table no longer listed');

  // Drop B's connection mid-match, then resume: only the missed events come back.
  await b.until(() => b.events >= 25, 'B 25 events', 60_000);
  b.auto = false;
  b.ws.terminate();
  const seen = b.events;
  // Let the table move on without B (A receives the same events B would have).
  await a.until(() => a.events >= seen + 4, 'table moves on while B is away', 60_000);
  b.auto = true;
  await b.connect();
  b.send({ t: 'rejoin', room: a.room, token: b.token, since: seen, round: b.lobby!.round });
  await b.until(() => b.historyFrom >= 0, 'history after rejoin');
  assert(b.historyFrom === seen, `history resumes at ${seen} (got ${b.historyFrom})`);
  assert(b.events > seen, 'missed events were delivered');

  await a.until(() => !!a.over, 'A over', 600_000);
  await b.until(() => !!b.over, 'B over', 30_000);
  assert(a.over!.winner === b.over!.winner, 'same winner for everyone');
  console.log('match 1 winner:', a.start!.seats.find((s) => s.id === a.over!.winner)?.name, '| events A', a.events, 'B', b.events);

  a.send({ t: 'again' });
  await b.until(() => b.lobby?.status === 'waiting', 'another round lobby');
  assert(b.lobby!.seats.length === 2, 'both kept for another round');
  a.send({ t: 'leave' });
  await b.until(() => b.lobby!.seats.length === 1 && b.lobby!.seats[0].host, 'host passes on when the host leaves');
  a.close();
  b.close();

  // ---- A private 2-seat table: not listed, third player is turned away.
  const d = new Player('Dora');
  const e = new Player('Eli');
  const f = new Player('Fen');
  await Promise.all([d.connect(), e.connect(), f.connect()]);
  d.send({ t: 'create', name: 'Dora', mode: 'winter', size: 2, public: false });
  await d.until(() => !!d.lobby, 'private lobby');
  assert(!(await getJson<RoomSummary[]>('/api/rooms')).some((r) => r.code === d.room), 'private room not listed');
  e.send({ t: 'join', room: d.room, name: 'Eli' });
  await d.until(() => d.lobby!.seats.length === 2, 'private second seat');
  f.send({ t: 'join', room: d.room, name: 'Fen' });
  await f.until(() => f.errors.length > 0, 'full table error');
  [d, e, f].forEach((p) => p.close());

  // ---- Teams 2v2: players pick a side; the table seats teams alternately.
  const g = new Player('Gil');
  const hh = new Player('Hob');
  await Promise.all([g.connect(), hh.connect()]);
  g.send({ t: 'create', name: 'Gil', mode: 'teams', size: 4, public: false });
  await g.until(() => !!g.lobby, 'teams lobby');
  hh.send({ t: 'join', room: g.room, name: 'Hob' });
  await g.until(() => g.lobby!.seats.length === 2, 'teams second seat');
  assert(g.lobby!.seats[0].team !== g.lobby!.seats[1].team, 'joiners balance the teams');
  hh.send({ t: 'team', team: g.lobby!.seats[0].team });
  await g.until(() => g.lobby!.seats[1].team === g.lobby!.seats[0].team, 'team switch');
  g.send({ t: 'start' });
  await g.until(() => !!g.start, 'teams start');
  const st = g.start!.seats;
  assert(st.length === 4, 'teams table has 4 seats');
  assert(st.find((s) => s.id === g.me)!.team === st.find((s) => s.id === hh.me)!.team, 'friends share a team');
  assert(st.every((s, i) => s.team !== st[(i + 1) % st.length].team), 'teams alternate around the table');
  g.close();
  hh.close();

  console.log('SERVER SMOKE OK');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
