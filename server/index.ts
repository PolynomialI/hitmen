// The Hooded Hand — game server.
// Serves the built client (dist/) and runs authoritative game rooms over WebSocket at /ws.
// Deploy on Render with render.yaml (one web service). Locally: `npm run build && npm start`.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Bot } from '../src/shared/bot';
import { Host } from '../src/shared/host';
import { RIVALS } from '../src/shared/match';
import { DEFAULT_TIMERS } from '../src/shared/timing';
import type { Action, GameEvent, SeatInfo } from '../src/shared/types';

const PORT = Number(process.env.PORT) || 8787;
const DIST = resolve(process.cwd(), 'dist');
const MAX_SEATS = 6;
const CLOAKS = ['#5a1a1a', '#2b3b2a', '#3b2a4a', '#4a3322', '#1f2633', '#3a1f1f'];

// ------------------------------------------------------------------ static files

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

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
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
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(p).pipe(res);
}

// ------------------------------------------------------------------ rooms

interface Client {
  ws: WebSocket;
  pid: string;
  name: string;
  ready: boolean;
}

class Room {
  readonly code: string;
  clients: Client[] = [];
  host: Host | null = null;
  private timer: NodeJS.Timeout | null = null;
  private t0 = Date.now();
  private nextPid = 1;

  constructor(code: string) {
    this.code = code;
  }

  now(): number {
    return Date.now() - this.t0;
  }

  join(ws: WebSocket, name: string): Client | null {
    if (this.host || this.clients.length >= MAX_SEATS) return null;
    const c: Client = { ws, pid: 'p' + this.nextPid++, name: name.slice(0, 16) || 'Stranger', ready: false };
    this.clients.push(c);
    send(ws, { t: 'welcome', you: c.pid, room: this.code, seats: this.clients.map((x) => ({ id: x.pid, name: x.name })) });
    this.broadcastLobby();
    return c;
  }

  broadcastLobby(): void {
    for (const c of this.clients) send(c.ws, { t: 'lobby', seats: this.clients.map((x) => ({ id: x.pid, name: x.name, ready: x.ready })) });
  }

  ready(c: Client): void {
    c.ready = true;
    this.broadcastLobby();
    if (this.clients.every((x) => x.ready)) this.start();
  }

  start(): void {
    if (this.host) return;
    const seats: SeatInfo[] = this.clients.map((c, i) => ({ id: c.pid, name: c.name, isBot: false, seat: i, epithet: 'Known for playing with fire', cloak: CLOAKS[i % CLOAKS.length] }));
    const bots: Bot[] = [];
    if (seats.length < 2) {
      const r = RIVALS[Math.floor(Math.random() * RIVALS.length)];
      seats.push({ id: 'bot1', name: r.name, isBot: true, seat: seats.length, epithet: r.epithet, cloak: r.cloak });
      bots.push(new Bot('bot1', Date.now() & 0xffff, 0.8));
    }
    const host = new Host({ mode: 'original', deck: 'original', seed: (Math.random() * 2 ** 31) | 0, ...DEFAULT_TIMERS, handSize: seats.length >= 5 ? 4 : 5 }, seats, {}, bots);
    for (const c of this.clients) host.listen(c.pid, (ev: GameEvent) => send(c.ws, { t: 'event', ev }));
    this.host = host;
    host.start(this.now());
    this.timer = setInterval(() => {
      host.tick(this.now());
      if (host.engine.phase === 'over') this.closeSoon();
    }, 50);
  }

  act(c: Client, id: number, a: Action): void {
    if (!this.host) return;
    const result = this.host.act(c.pid, a, this.now());
    send(c.ws, { t: 'result', id, result });
  }

  leave(c: Client): void {
    this.clients = this.clients.filter((x) => x !== c);
    if (this.host) this.host.leave(c.pid, this.now());
    else this.broadcastLobby();
    if (!this.clients.length) this.close();
  }

  private closing = false;
  private closeSoon(): void {
    if (this.closing) return;
    this.closing = true;
    setTimeout(() => this.close(), 30_000);
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    rooms.delete(this.code);
  }
}

const rooms = new Map<string, Room>();

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ------------------------------------------------------------------ server

const http = createServer(serveStatic);
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  let room: Room | null = null;
  let me: Client | null = null;
  let alive = true;
  ws.on('pong', () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 20_000);

  ws.on('message', (raw) => {
    let msg: { t?: string; room?: string; name?: string; id?: number; action?: Action };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.t === 'join' && !room) {
      const code = String(msg.room ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || randomCode();
      room = rooms.get(code) ?? new Room(code);
      rooms.set(code, room);
      me = room.join(ws, String(msg.name ?? ''));
      if (!me) {
        send(ws, { t: 'error', message: 'That table is full or already playing.' });
        room = null;
      }
    } else if (msg.t === 'ready' && room && me) room.ready(me);
    else if (msg.t === 'action' && room && me && msg.action && typeof msg.id === 'number') room.act(me, msg.id, msg.action);
  });

  ws.on('close', () => {
    clearInterval(ping);
    if (room && me) room.leave(me);
  });
});

function randomCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

http.listen(PORT, () => console.log(`The Hooded Hand server listening on :${PORT} (static from ${DIST})`));
