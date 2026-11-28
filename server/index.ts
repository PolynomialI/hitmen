// The Hooded Hand — game server.
// Serves the built client (dist/) and runs authoritative game rooms over WebSocket at /ws, plus a tiny JSON API
// (/api/info, /api/rooms). Everything is same-origin: the client never talks to any other host.
// Deploy on Render with render.yaml (one web service). Locally: `npm run build && npm start`.

import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Host } from '../src/shared/host';
import { createTableMatch } from '../src/shared/match';
import { normalizeCode, QUEUE_SIZE, ROOM_CODE, seatOptions, TABLE_MODES, type ClientMsg, type LeaderRow, type LiveTable, type LobbyInfo, type Look, type OnlineMode, type QueueMode, type RoomSummary, type ServerMsg } from '../src/shared/online';
import { cleanName, NAME_MAX } from '../src/shared/text';
import type { Action, GameEvent } from '../src/shared/types';

const PORT = Number(process.env.PORT) || 8787;
const DIST = resolve(process.cwd(), 'dist');
const MAX_ROOMS = 300;
/** How long a seat is kept for a player whose connection dropped. */
const GRACE_WAITING_MS = 20_000;
/** A player who drops out of a match has this long to come back; then they are knocked out. */
const GRACE_PLAYING_MS = 30_000;
/** A finished table with nobody asking for another round closes after this long. */
const OVER_TTL_MS = 5 * 60_000;
/** On shutdown (a redeploy), matches in progress may run on this long before the process exits. Render stops a free
 * service 30 s after SIGTERM (paid plans can raise that with maxShutdownDelaySeconds; raise this env var to match). */
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 25_000;
const UPDATING = 'The tavern is being updated. Open the board again in a minute.';
let closing = false;

// ------------------------------------------------------------------ static files + API

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/**
 * Text files go out compressed (brotli, else gzip): the game script shrinks about 3x, which matters on school networks.
 * Each file is compressed once and kept in memory (dist/ is a few MB at most); a rebuilt file is picked up by its mtime.
 */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);
interface Packed {
  mtime: number;
  raw: Buffer;
  br: Buffer;
  gz: Buffer;
}
const packed = new Map<string, Promise<Packed>>();
const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** The file compressed both ways. Compression runs on Node's worker threads, so games carry on meanwhile. */
function pack(p: string): Promise<Packed> {
  const mtime = statSync(p).mtimeMs;
  const known = packed.get(p);
  if (known) return known.then((e) => (e.mtime === mtime ? e : (packed.delete(p), pack(p))));
  const job = (async () => {
    const raw = readFileSync(p);
    const [br, gz] = await Promise.all([
      brotliAsync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 10, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length } }),
      gzipAsync(raw, { level: 9 }),
    ]);
    return { mtime, raw, br, gz };
  })();
  packed.set(p, job);
  job.catch(() => packed.delete(p));
  return job;
}

/** Compress the whole client once at start-up, so no visitor waits on it. */
function warmUp(dir = DIST): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) warmUp(p);
    else if (COMPRESSIBLE.has(extname(p))) void pack(p).catch(() => {});
  }
}

function json(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serve(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url.pathname === '/api/info') return json(res, { online: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.clients.length, 0) });
  if (url.pathname === '/api/rooms') return json(res, publicRooms());
  if (url.pathname === '/api/live') return json(res, liveTables());
  if (url.pathname === '/api/leaderboard') return json(res, leaderboard());
  let p = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!p.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html');
  if (!existsSync(p)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Client not built. Run `npm run build`.');
    return;
  }
  const ext = extname(p);
  const headers: Record<string, string> = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  };
  if (COMPRESSIBLE.has(ext)) {
    const accept = String(req.headers['accept-encoding'] ?? '');
    const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
    pack(p).then(
      (e) => {
        const body = enc === 'br' ? e.br : enc === 'gzip' ? e.gz : e.raw;
        if (enc) headers['content-encoding'] = enc;
        headers.vary = 'Accept-Encoding';
        headers['content-length'] = String(body.length);
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : body);
      },
      () => {
        res.writeHead(200, headers);
        createReadStream(p).pipe(res);
      }
    );
    return;
  }
  res.writeHead(200, headers);
  createReadStream(p).pipe(res);
}

// ------------------------------------------------------------------ rooms

interface Client {
  pid: string;
  name: string;
  look?: Look;
  token: string;
  ws: WebSocket | null;
  team: number;
  grace: NodeJS.Timeout | null;
}

class Room {
  readonly clients: Client[] = [];
  host: Host | null = null;
  hostPid = '';
  status: LobbyInfo['status'] = 'waiting';
  round = 0;
  private timer: NodeJS.Timeout | null = null;
  private overTimer: NodeJS.Timeout | null = null;
  private t0 = Date.now();
  private nextPid = 1;
  /** Spectators: socket -> stop listening. */
  readonly watchers = new Map<WebSocket, () => void>();
  private nextWatcher = 1;
  /** Names of everyone dealt into the current match (for the standings, even if they leave). */
  private dealt = new Map<string, string>();

  constructor(
    readonly code: string,
    readonly mode: OnlineMode,
    readonly size: number,
    readonly isPublic: boolean
  ) {}

  private now(): number {
    return Date.now() - this.t0;
  }

  lobby(): LobbyInfo {
    return {
      code: this.code,
      mode: this.mode,
      size: this.size,
      public: this.isPublic,
      status: this.status,
      round: this.round,
      seats: this.clients.map((c) => ({ id: c.pid, name: c.name, look: c.look, host: c.pid === this.hostPid, connected: !!c.ws, team: this.mode === 'teams' ? c.team : undefined })),
    };
  }

  broadcast(msg: ServerMsg): void {
    for (const c of this.clients) if (c.ws) send(c.ws, msg);
    if (msg.t === 'lobby') for (const ws of this.watchers.keys()) send(ws, msg);
  }

  broadcastLobby(): void {
    this.broadcast({ t: 'lobby', lobby: this.lobby() });
  }

  /** Seat a new player (only while waiting). */
  join(ws: WebSocket, name: string, look: Look | undefined): Client | string {
    if (this.status !== 'waiting') return 'That table is already playing.';
    if (this.clients.length >= this.size) return 'That table is full.';
    const teamCount = [0, 1].map((t) => this.clients.filter((c) => c.team === t).length);
    // Two "Stranger"s at one table would be confusing: the second becomes "Stranger II".
    const taken = new Set(this.clients.map((x) => x.name));
    const numerals = ['II', 'III', 'IV', 'V', 'VI'];
    for (let k = 0; taken.has(name) && k < numerals.length; k++) name = `${name.replace(/ (II|III|IV|V|VI)$/, '').slice(0, NAME_MAX - 1 - numerals[k].length)} ${numerals[k]}`;
    const c: Client = { pid: 'p' + this.nextPid++, name, look, token: randomBytes(18).toString('base64url'), ws, team: teamCount[0] <= teamCount[1] ? 0 : 1, grace: null };
    this.clients.push(c);
    if (!this.hostPid) this.hostPid = c.pid;
    send(ws, { t: 'welcome', you: c.pid, token: c.token, room: this.code });
    this.broadcastLobby();
    return c;
  }

  /** Re-attach a player whose connection dropped (or who reloaded the page). */
  rejoin(ws: WebSocket, token: string, since: number, round: number): Client | string {
    const c = this.clients.find((x) => x.token === token);
    if (!c) return 'Your seat at that table is gone.';
    if (c.ws && c.ws !== ws) c.ws.close(4000, 'replaced');
    c.ws = ws;
    if (c.grace) clearTimeout(c.grace);
    c.grace = null;
    send(ws, { t: 'welcome', you: c.pid, token: c.token, room: this.code });
    send(ws, { t: 'lobby', lobby: this.lobby() });
    if (this.host && this.status === 'playing') {
      const evs = this.host.history(c.pid);
      // A different round (the table moved on while they were away) means the whole current match.
      const from = round === this.round ? Math.max(0, Math.min(evs.length, Math.floor(since) || 0)) : 0;
      send(ws, { t: 'history', evs: evs.slice(from), from });
    }
    this.broadcast({ t: 'presence', id: c.pid, connected: true });
    if (this.status === 'waiting') this.broadcastLobby();
    return c;
  }

  setTeam(c: Client, team: number): void {
    if (this.status !== 'waiting' || this.mode !== 'teams' || (team !== 0 && team !== 1)) return;
    if (this.clients.filter((x) => x.team === team && x !== c).length >= this.size / 2) return;
    c.team = team;
    this.broadcastLobby();
  }

  start(c: Client): void {
    if (this.status !== 'waiting' || c.pid !== this.hostPid) return;
    const why = this.cannotStart();
    if (why) {
      if (c.ws) send(c.ws, { t: 'error', message: why });
      return;
    }
    this.begin();
  }

  /** Why the night cannot begin yet (no bots: real players only), or null. */
  cannotStart(): string | null {
    if (this.clients.length < 2) return 'Wait for at least one more player.';
    if (this.mode === 'teams') {
      const n = [0, 1].map((t) => this.clients.filter((x) => x.team === t).length);
      if (n.some((k) => k === 0)) return 'Both teams need a player.';
      if (n.some((k) => k > this.size / 2)) return 'Too many players on one team.';
    }
    return null;
  }

  /** Deal everyone at the table into a new match. */
  begin(): void {
    const humans = this.clients.map((x) => ({ id: x.pid, name: x.name, look: x.look, team: this.mode === 'teams' ? x.team : undefined }));
    this.dealt = new Map(this.clients.map((x) => [x.pid, x.name]));
    const { host } = createTableMatch({ mode: this.mode, humans, seed: (Math.random() * 2 ** 31) | 0 });
    for (const x of this.clients) host.listen(x.pid, (ev: GameEvent) => x.ws && send(x.ws, { t: 'event', ev }));
    this.host = host;
    this.status = 'playing';
    this.round++;
    this.t0 = Date.now();
    this.broadcastLobby();
    host.start(this.now());
    this.timer = setInterval(() => {
      host.tick(this.now());
      if (host.engine.phase === 'over' && this.status === 'playing') this.finish();
    }, 50);
  }

  private finish(): void {
    // Server-wide standings: a game for everyone dealt in, a win for the winners.
    const over = [...(this.host?.log ?? [])].reverse().find((e) => e.e === 'over') as (GameEvent & { e: 'over' }) | undefined;
    const winners = new Set(over ? (over.winners?.length ? over.winners : over.winner ? [over.winner] : []) : []);
    for (const [pid, name] of this.dealt) {
      const row = standings.get(name) ?? { name, wins: 0, games: 0 };
      row.games++;
      if (winners.has(pid)) row.wins++;
      standings.set(name, row);
    }
    this.status = 'over';
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.broadcastLobby();
    this.overTimer = setTimeout(() => this.close('The table has closed.'), OVER_TTL_MS);
  }

  /** Back to the lobby for another round (anyone may ask once the match is over). */
  again(): void {
    if (this.status !== 'over') return;
    if (this.overTimer) clearTimeout(this.overTimer);
    this.overTimer = null;
    this.host = null;
    this.status = 'waiting';
    // Players who never came back are not kept for the next round.
    for (const c of [...this.clients]) if (!c.ws) this.remove(c);
    if (this.clients.length) this.broadcastLobby();
  }

  act(c: Client, id: number, a: Action): void {
    if (!this.host || this.status !== 'playing') return;
    let result;
    try {
      result = this.host.act(c.pid, a, this.now());
    } catch {
      result = { ok: false, err: 'bad action' };
    }
    if (c.ws) send(c.ws, { t: 'result', id, result });
  }

  /** The host asks a player to leave (waiting room only). */
  kick(by: Client, id: string): void {
    if (this.status !== 'waiting' || by.pid !== this.hostPid || id === by.pid) return;
    const c = this.clients.find((x) => x.pid === id);
    if (!c) return;
    const ws = c.ws;
    c.ws = null;
    this.remove(c);
    if (ws) {
      send(ws, { t: 'error', message: 'The host has asked you to leave the table.', fatal: true });
      ws.close(4001, 'kicked');
    }
  }

  /** The socket closed: keep the seat for a while so the player can come back. */
  dropped(c: Client): void {
    c.ws = null;
    if (c.grace) clearTimeout(c.grace);
    c.grace = setTimeout(() => this.remove(c), this.status === 'playing' ? GRACE_PLAYING_MS : GRACE_WAITING_MS);
    this.broadcast({ t: 'presence', id: c.pid, connected: false, graceMs: this.status === 'playing' ? GRACE_PLAYING_MS : GRACE_WAITING_MS });
    if (this.status !== 'playing') this.broadcastLobby();
  }

  /** The player is gone for good (left, or never came back). */
  remove(c: Client): void {
    if (c.grace) clearTimeout(c.grace);
    c.grace = null;
    const i = this.clients.indexOf(c);
    if (i < 0) return;
    this.clients.splice(i, 1);
    if (this.host && this.status === 'playing') this.host.leave(c.pid, this.now());
    if (c.pid === this.hostPid) this.hostPid = this.clients[0]?.pid ?? '';
    if (!this.clients.length) this.close();
    else this.broadcastLobby();
  }

  /** A spectator: the match so far (no hands), then every event as it happens. */
  watch(ws: WebSocket): string | null {
    if (!this.host || this.status === 'waiting') return 'That table has not started yet.';
    const id = 'w' + this.nextWatcher++;
    send(ws, { t: 'welcome', you: id, token: '', room: this.code });
    send(ws, { t: 'lobby', lobby: this.lobby() });
    send(ws, { t: 'history', evs: this.host.history(id), from: 0 });
    this.watchers.set(ws, this.host.listen(id, (ev: GameEvent) => send(ws, { t: 'event', ev })));
    return null;
  }

  unwatch(ws: WebSocket): void {
    this.watchers.get(ws)?.();
    this.watchers.delete(ws);
  }

  close(message?: string): void {
    for (const [ws, off] of this.watchers) {
      off();
      if (message) send(ws, { t: 'error', message, fatal: true });
    }
    this.watchers.clear();
    if (this.timer) clearInterval(this.timer);
    if (this.overTimer) clearTimeout(this.overTimer);
    this.timer = this.overTimer = null;
    for (const c of this.clients) {
      if (c.grace) clearTimeout(c.grace);
      if (message && c.ws) send(c.ws, { t: 'error', message, fatal: true });
    }
    rooms.delete(this.code);
  }
}

const rooms = new Map<string, Room>();
/** Server-wide standings by player name (kept in memory: they reset when the server restarts). */
const standings = new Map<string, LeaderRow>();

function leaderboard(): LeaderRow[] {
  return [...standings.values()].sort((a, b) => b.wins - a.wins || b.wins / Math.max(1, b.games) - a.wins / Math.max(1, a.games) || a.games - b.games).slice(0, 30);
}

/** Open (and matchmade) matches being played: anyone may watch. */
function liveTables(): LiveTable[] {
  const out: LiveTable[] = [];
  for (const r of rooms.values()) {
    if (!r.isPublic || r.status !== 'playing' || !r.host) continue;
    const seats = r.host.engine.players;
    out.push({ code: r.code, mode: r.mode, players: seats.map((p) => p.name), alive: seats.filter((p) => p.alive).length, watchers: r.watchers.size });
  }
  return out.slice(0, 40);
}

// ------------------------------------------------------------------ matchmaking

interface Waiting {
  ws: WebSocket;
  name: string;
  look?: Look;
}
const queues: Record<QueueMode, Waiting[]> = { duel: [], teams: [] };

function queueStatus(mode: QueueMode): void {
  for (const w of queues[mode]) send(w.ws, { t: 'queued', mode, waiting: queues[mode].length, need: QUEUE_SIZE[mode] });
}

function unqueue(ws: WebSocket): void {
  for (const mode of Object.keys(queues) as QueueMode[]) {
    const i = queues[mode].findIndex((w) => w.ws === ws);
    if (i >= 0) {
      queues[mode].splice(i, 1);
      queueStatus(mode);
    }
  }
}

/** Enough players waiting: seat them at a fresh (watchable) table and deal at once. */
function matchmake(mode: QueueMode, seated: (ws: WebSocket, room: Room, c: Client) => void): void {
  const need = QUEUE_SIZE[mode];
  while (queues[mode].length >= need) {
    const group = queues[mode].splice(0, need).filter((w) => w.ws.readyState === 1);
    if (group.length < need) {
      queues[mode].unshift(...group);
      break;
    }
    const r = new Room(randomCode(), mode === 'duel' ? 'duel' : 'teams', need, true);
    rooms.set(r.code, r);
    group.forEach((w, i) => {
      const c = r.join(w.ws, w.name, w.look);
      if (typeof c === 'string') return;
      c.team = i % 2;
      seated(w.ws, r, c);
    });
    r.begin();
  }
  queueStatus(mode);
}

function publicRooms(): RoomSummary[] {
  const out: RoomSummary[] = [];
  for (const r of rooms.values()) {
    if (!r.isPublic || r.status !== 'waiting' || r.clients.length >= r.size) continue;
    out.push({ code: r.code, host: r.clients.find((c) => c.pid === r.hostPid)?.name ?? '?', mode: r.mode, size: r.size, players: r.clients.length });
  }
  return out.slice(0, 40);
}

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function randomCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let s = '';
    for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(s)) return s;
  }
}

/** Cosmetic ids are only ever used as lookup keys on the client; keep them short and plain. */
function cleanLook(l: unknown): Look | undefined {
  if (!l || typeof l !== 'object') return undefined;
  const out: Look = {};
  for (const k of ['sleeve', 'impact', 'seat', 'banner', 'charm'] as const) {
    const v = (l as Record<string, unknown>)[k];
    if (typeof v === 'string' && /^[a-z0-9_]{1,32}$/.test(v)) out[k] = v;
  }
  return out;
}

// ------------------------------------------------------------------ sockets

const http = createServer(serve);
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

/** How matchmaking seats a waiting socket at its new table (each connection registers its own). */
const binders = new WeakMap<WebSocket, (r: Room, c: Client) => void>();

wss.on('connection', (ws) => {
  let room: Room | null = null;
  let me: Client | null = null;
  let watching: Room | null = null;
  binders.set(ws, (r, c) => {
    room = r;
    me = c;
  });
  let alive = true;
  // Simple flood guard: at most 40 messages per 2 seconds.
  let budget = 40;
  const refill = setInterval(() => (budget = 40), 2000);
  ws.on('pong', () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 20_000);

  const fail = (message: string) => send(ws, { t: 'error', message, fatal: true });

  ws.on('message', (raw) => {
    if (--budget < 0) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'create': {
        if (room) return;
        if (closing) return fail(UPDATING);
        if (rooms.size >= MAX_ROOMS) return fail('The tavern is full tonight. Try again soon.');
        const mode = TABLE_MODES.includes(msg.mode) ? msg.mode : 'original';
        const size = seatOptions(mode).includes(msg.size) ? msg.size : seatOptions(mode)[0];
        const r = new Room(randomCode(), mode, size, !!msg.public);
        rooms.set(r.code, r);
        const c = r.join(ws, cleanName(msg.name), cleanLook(msg.look));
        if (typeof c === 'string') return fail(c);
        room = r;
        me = c;
        return;
      }
      case 'join': {
        if (room) return;
        if (closing) return fail(UPDATING);
        const code = normalizeCode(String(msg.room ?? ''));
        const r = ROOM_CODE.test(code) ? rooms.get(code) : undefined;
        if (!r) return fail('No table with that code. Check the letters and try again.');
        const c = r.join(ws, cleanName(msg.name), cleanLook(msg.look));
        if (typeof c === 'string') return fail(c);
        room = r;
        me = c;
        return;
      }
      case 'queue': {
        if (room || watching) return;
        if (closing) return fail(UPDATING);
        const mode: QueueMode = msg.mode === 'teams' ? 'teams' : 'duel';
        unqueue(ws);
        queues[mode].push({ ws, name: cleanName(msg.name), look: cleanLook(msg.look) });
        matchmake(mode, (w, r, c) => binders.get(w)?.(r, c));
        return;
      }
      case 'unqueue':
        unqueue(ws);
        return;
      case 'watch': {
        if (room || watching) return;
        const r = rooms.get(normalizeCode(String(msg.room ?? '')));
        if (!r) return fail('That table has closed.');
        const why = r.watch(ws);
        if (why) return fail(why);
        watching = r;
        return;
      }
      case 'rejoin': {
        if (room) return;
        const r = rooms.get(normalizeCode(String(msg.room ?? '')));
        if (!r) return fail('That table has closed.');
        const c = r.rejoin(ws, String(msg.token ?? ''), Number(msg.since), Number(msg.round));
        if (typeof c === 'string') return fail(c);
        room = r;
        me = c;
        return;
      }
    }
    if (!room || !me) return;
    switch (msg.t) {
      case 'team':
        return room.setTeam(me, Number(msg.team));
      case 'start':
        return room.start(me);
      case 'again':
        return room.again();
      case 'kick':
        return room.kick(me, String(msg.id ?? ''));
      case 'leave':
        room.remove(me);
        room = me = null;
        return;
      case 'action':
        if (msg.action && typeof msg.action === 'object' && typeof msg.id === 'number') room.act(me, msg.id, msg.action);
        return;
    }
  });

  ws.on('close', () => {
    clearInterval(ping);
    clearInterval(refill);
    unqueue(ws);
    watching?.unwatch(ws);
    if (room && me && me.ws === ws) room.dropped(me);
  });
});

http.listen(PORT, () => {
  console.log(`The Hooded Hand server listening on :${PORT} (static from ${DIST})`);
  warmUp();
});

// A redeploy stops this process (SIGTERM) while a new one takes new players. Matches already being played may finish
// (up to SHUTDOWN_GRACE_MS); waiting and finished tables are told to come back shortly.
function shutdown(): void {
  if (closing) return;
  closing = true;
  console.log('Shutting down: letting matches in progress finish.');
  // Stop accepting connections right away (frees the port; new players reach the new instance). Open sockets of
  // matches in progress stay up.
  http.close();
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  const check = (): void => {
    for (const r of [...rooms.values()]) if (r.status !== 'playing' || Date.now() > deadline) r.close(UPDATING);
    if (rooms.size === 0) {
      clearInterval(timer);
      setTimeout(() => process.exit(0), 300);
    }
  };
  const timer = setInterval(check, 1000);
  check();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
