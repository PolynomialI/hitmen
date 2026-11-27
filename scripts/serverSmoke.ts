// Online smoke test against a running server (npm run build && npm start, or npm run server:dev).
//   BASE=http://localhost:8787 npx tsx scripts/serverSmoke.ts
// Covers: room list API, create/join by code, errors, host-only start, tables of real players only (no bots), a
// dropped connection resuming with only the missed events, another round, full/private tables, team picks, Duel and
// Teams matchmaking, watching a live table, the 30 s knockout for a player who never comes back, and the leaderboard.
import WebSocket from 'ws';
import type { LeaderRow, LiveTable, LobbyInfo, RoomSummary, ServerMsg } from '../src/shared/online';
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
  queued = 0;
  presence: Array<{ id: string; connected: boolean; graceMs?: number }> = [];
  slain: string[] = [];
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
      const t = setTimeout(() => rej(new Error(`${this.name}: timeout waiting for ${label} (errors: ${this.errors.join(" / ") || "none"})`)), ms);
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
    else if (m.t === 'queued') this.queued = m.waiting;
    else if (m.t === 'presence') this.presence.push(m);
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
    if (ev.e === 'slain') this.slain.push(ev.player);
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

  // Nobody plays alone: the host cannot start with an empty table.
  a.send({ t: 'start' });
  await a.until(() => a.errors.length > 0, 'start refused with one player');
  assert(a.lobby!.status === 'waiting', 'still waiting with one player');

  await b.connect();
  b.send({ t: 'join', room: a.room.toLowerCase(), name: 'Bram' });
  await a.until(() => a.lobby!.seats.length === 2, 'second seat');
  await b.until(() => b.lobby?.seats.length === 2, 'B sees lobby');

  const c = new Player('Cobb');
  await c.connect();
  c.send({ t: 'join', room: 'ZZZZZ', name: 'Cobb' });
  await c.until(() => c.errors.length > 0, 'bad code error');
  c.close();

  // A second "Alys" gets a distinct name; the host can ask them to leave before the start.
  const twin = new Player('Alys');
  await twin.connect();
  twin.send({ t: 'join', room: a.room, name: 'Alys' });
  await a.until(() => a.lobby!.seats.length === 3, 'twin seated');
  assert(a.lobby!.seats.some((x) => x.name === 'Alys II'), 'duplicate name becomes "Alys II": ' + a.lobby!.seats.map((x) => x.name).join(', '));
  b.send({ t: 'kick', id: twin.me });
  await pause(300);
  assert(a.lobby!.seats.length === 3, 'only the host may ask someone to leave');
  a.send({ t: 'kick', id: twin.me });
  await twin.until(() => twin.errors.some((m) => m.includes('asked you to leave')), 'kicked player is told');
  await a.until(() => a.lobby!.seats.length === 2, 'kicked player removed');
  twin.close();

  b.send({ t: 'start' });
  await pause(400);
  assert(a.lobby!.status === 'waiting', 'only the host may start');
  a.send({ t: 'start' });
  await a.until(() => !!a.start, 'start event');
  await b.until(() => !!b.start, 'B start event');
  assert(a.start!.seats.length === 2 && !a.start!.seats.some((s) => s.isBot), 'only the two players, no bots: ' + a.start!.seats.map((s) => s.name).join(', '));
  assert(a.start!.seats.find((s) => s.id === a.me)?.look?.seat === 'throne', 'seat look carried');
  assert(!(await getJson<RoomSummary[]>('/api/rooms')).some((r) => r.code === a.room), 'playing table no longer listed');

  // Drop B's connection mid-match, then resume: only the missed events come back.
  await b.until(() => b.events >= 25, 'B 25 events', 60_000);
  b.auto = false;
  b.ws.terminate();
  const seen = b.events;
  await a.until(() => a.presence.some((p) => p.id === b.me && !p.connected && p.graceMs === 30_000), 'A is told B dropped, with 30 s to return');
  // A few seconds away (well inside the 30 s grace); A may play on meanwhile (A receives the events B would have).
  await pause(5000);
  const missed = a.events - seen; // A has the same stream of events as B
  b.auto = true;
  await b.connect();
  b.send({ t: 'rejoin', room: a.room, token: b.token, since: seen, round: b.lobby!.round });
  await b.until(() => b.historyFrom >= 0, 'history after rejoin');
  assert(b.historyFrom === seen, `history resumes at ${seen} (got ${b.historyFrom})`);
  assert(b.events >= seen + Math.min(missed, 1), 'missed events were delivered');
  await a.until(() => a.presence.some((p) => p.id === b.me && p.connected), 'A is told B is back');

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
  const other = g.lobby!.seats[1].team;
  hh.send({ t: 'team', team: g.lobby!.seats[0].team });
  await g.until(() => g.lobby!.seats[1].team === g.lobby!.seats[0].team, 'team switch');
  g.send({ t: 'start' });
  await g.until(() => g.errors.length > 0, 'start refused while one side is empty');
  hh.send({ t: 'team', team: other });
  await g.until(() => g.lobby!.seats[1].team === other, 'team switch back');
  g.send({ t: 'start' });
  await g.until(() => !!g.start, 'teams start');
  const st = g.start!.seats;
  assert(st.length === 2 && !st.some((s) => s.isBot), 'teams table seats only its players');
  assert(st.every((s, i) => s.team !== st[(i + 1) % st.length].team), 'teams alternate around the table');
  g.close();
  hh.close();

  // ---- Teams matchmaking: four in the queue are dealt in together, sides alternating.
  const tq = ['Ivo', 'Jem', 'Kit', 'Lia'].map((n) => new Player(n));
  await Promise.all(tq.map((p) => p.connect()));
  for (const p of tq.slice(0, 3)) p.send({ t: 'queue', mode: 'teams', name: p.name });
  await tq[0].until(() => tq[0].queued === 3, 'three waiting for Teams');
  tq[3].send({ t: 'queue', mode: 'teams', name: tq[3].name });
  for (const p of tq) await p.until(() => !!p.start, p.name + ' dealt into Teams');
  const ts = tq[0].start!.seats;
  assert(ts.length === 4 && !ts.some((s) => s.isBot), 'Teams queue: four players, no bots');
  assert(ts.every((s, i) => s.team !== ts[(i + 1) % ts.length].team), 'Teams queue: sides alternate');
  assert(new Set(tq.map((p) => p.room)).size === 1, 'Teams queue: one table');
  tq.forEach((p) => p.close());

  // ---- Duel matchmaking, watching it, and a player who never comes back.
  const p1 = new Player('Mab');
  const p2 = new Player('Ned');
  await Promise.all([p1.connect(), p2.connect()]);
  p1.send({ t: 'queue', mode: 'duel', name: 'Mab' });
  await p1.until(() => p1.queued === 1, 'one waiting for a Duel');
  p1.send({ t: 'unqueue' });
  await pause(200);
  p1.send({ t: 'queue', mode: 'duel', name: 'Mab' });
  p2.send({ t: 'queue', mode: 'duel', name: 'Ned' });
  await p1.until(() => !!p1.start, 'Duel dealt');
  await p2.until(() => !!p2.start, 'Duel dealt (Ned)');
  assert(p1.room === p2.room && p1.start!.seats.length === 2, 'Duel: one table of two');
  const live = await getJson<LiveTable[]>('/api/live');
  assert(live.some((t) => t.code === p1.room && t.mode === 'duel' && t.players.length === 2), 'Duel is listed to watch');
  const w = new Player('Watcher');
  w.auto = false;
  await w.connect();
  w.send({ t: 'watch', room: p1.room });
  await w.until(() => !!w.start && w.historyFrom === 0, 'watcher gets the match from the start');
  assert(w.me.startsWith('w') && !w.start!.seats.some((s) => s.id === w.me), 'watcher has no seat');
  // Ned closes the tab for good: Mab is told, and 30 s later Ned is out and Mab wins.
  p2.auto = false;
  p2.ws.terminate();
  await p1.until(() => p1.presence.some((p) => p.id === p2.me && !p.connected), 'Mab is told Ned dropped');
  await p1.until(() => p1.slain.includes(p2.me), 'Ned knocked out after the grace', 45_000);
  await p1.until(() => !!p1.over, 'Duel over', 15_000);
  assert(p1.over!.winner === p1.me, 'Mab wins when Ned never returns');
  await w.until(() => !!w.over, 'watcher sees the end');
  await pause(300);
  const board = await getJson<LeaderRow[]>('/api/leaderboard');
  assert(board.some((r) => r.name === 'Mab' && r.wins >= 1), 'leaderboard counts the Duel win: ' + JSON.stringify(board));
  p1.close();
  w.close();

  console.log('SERVER SMOKE OK');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
