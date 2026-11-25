// Headless simulation: bot-only matches in every mode and table size, plus a scripted tutorial run.
import { Bot } from '../src/shared/bot';
import { Host } from '../src/shared/host';
import { createLocalMatch, HUMAN_ID } from '../src/shared/match';
import { DEFAULT_TIMERS } from '../src/shared/timing';
import type { GameEvent, GameMode, SeatInfo } from '../src/shared/types';
import type { DeckKind } from '../src/shared/cards';

function assert(c: unknown, msg: string): asserts c {
  if (!c) throw new Error('ASSERT: ' + msg);
}

function runBots(seed: number, n: number, deck: DeckKind, teams: boolean) {
  const seats: SeatInfo[] = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, isBot: true, seat: i, epithet: '', cloak: '#000', team: teams ? i % 2 : undefined }));
  const bots = seats.map((s, i) => new Bot(s.id, seed + i * 31, 0.4 + (i % 3) * 0.25));
  const host = new Host({ mode: teams ? 'teams' : 'original', deck, seed, ...DEFAULT_TIMERS, handSize: n >= 5 ? 4 : 5 }, seats, {}, bots);
  const kinds = new Map<string, number>();
  host.listen('p0', (e: GameEvent) => kinds.set(e.e, (kinds.get(e.e) ?? 0) + 1));
  let now = 0;
  host.start(now);
  const total = () => {
    const e = host.engine;
    const priv = e.pending ? e.pending.privateers.length : 0;
    return e.deck.length + e.discard.length + e.players.reduce((s, p) => s + p.hand.length, 0) + (e.doom ? 1 : 0) + priv;
  };
  let cards = -1;
  let copies = 0;
  host.listen('p0', (e: GameEvent) => {
    if (e.e === 'copy') copies++;
  });
  for (let i = 0; i < 400000 && host.engine.phase !== 'over'; i++) {
    now += 50;
    host.tick(now);
    if (host.engine.phase === 'turn' && cards < 0) cards = total();
    if (cards > 0 && (host.engine.phase as string) !== 'over') {
      const t = total();
      assert(t === cards + copies, `card count drift ${t} vs ${cards}+${copies} (seed ${seed}, n ${n}, ${deck})`);
    }
  }
  assert((host.engine.phase as string) === 'over', `game did not finish (seed ${seed}, n ${n}, ${deck})`);
  return { winner: host.engine.winner, minutes: now / 60000, kinds };
}

const seen = new Map<string, number>();
const configs: Array<[number, DeckKind, boolean]> = [
  [2, 'original', false],
  [3, 'original', false],
  [4, 'original', false],
  [6, 'original', false],
  [4, 'teams', true],
  [6, 'teams', true],
  [2, 'ranked', false],
  [4, 'winter', false],
];
for (const [n, deck, teams] of configs) {
  let mins = 0;
  const N = n >= 6 ? 40 : 80;
  for (let s = 1; s <= N; s++) {
    const r = runBots(s * 7919 + n, n, deck, teams);
    mins += r.minutes;
    for (const [k, v] of r.kinds) seen.set(k, (seen.get(k) ?? 0) + v);
  }
  console.log(`${deck.padEnd(8)} x${n}${teams ? ' (teams)' : ''}: ${N} games OK, avg ${(mins / N).toFixed(1)} min`);
}
console.log('event coverage:', [...seen.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
for (const must of ['burn', 'copy', 'redirect', 'reverse', 'lock', 'unlock', 'ward', 'warded', 'retake', 'swap', 'reveal', 'givePrompt', 'steal', 'privateer']) {
  assert(seen.has(must), 'never saw event ' + must);
}

// Every local mode builds and finishes when the human just keeps drawing (and rescues).
for (const mode of ['original', 'scrimmage', 'teams', 'winter', 'ranked'] as GameMode[]) {
  const { host } = createLocalMatch({ mode, playerName: 'T', rivals: 3, seed: 5 });
  let now = 0;
  host.start(now);
  for (let i = 0; i < 300000 && host.engine.phase !== 'over'; i++) {
    now += 50;
    host.tick(now);
    const v = host.engine.view(HUMAN_ID, now);
    if (v.busy) continue;
    if (v.phase === 'turn' && v.sync.current === HUMAN_ID) host.act(HUMAN_ID, { t: 'draw' }, now);
    else if (v.phase === 'rescue' && v.doomed === HUMAN_ID) {
      const a = host.engine.rescueCards(host.engine.player(HUMAN_ID)!)[0];
      if (a) host.act(HUMAN_ID, { t: 'rescue', cardId: a.id }, now);
    } else if (v.phase === 'hide' && v.doomed === HUMAN_ID) host.act(HUMAN_ID, { t: 'hide', position: 0 }, now);
    else if (v.phase === 'give' && v.give?.from === HUMAN_ID) host.act(HUMAN_ID, { t: 'give', cardId: v.hand[0].id }, now);
    else if (v.phase === 'scry' && v.pending?.player === HUMAN_ID) host.act(HUMAN_ID, { t: 'scryDone' }, now);
  }
  assert(host.engine.phase === 'over', 'mode did not finish: ' + mode);
  console.log(`mode ${mode}: finished, winner ${host.engine.winner}`);
}

// Tutorial: a "student" that follows the hints.
{
  const { host } = createLocalMatch({ mode: 'tutorial', playerName: 'Tester', seed: 1 });
  const log: string[] = [];
  host.listen(HUMAN_ID, (e) => log.push(e.e + ('player' in e ? ':' + e.player : '') + ('card' in e && e.card ? ':' + e.card.type : '')));
  let now = 0;
  host.start(now);
  const tryAct = (a: any) => host.act(HUMAN_ID, a, now);
  let step = 0;
  for (let i = 0; i < 100000 && host.engine.phase !== 'over'; i++) {
    now += 50;
    host.tick(now);
    const v = host.engine.view(HUMAN_ID, now);
    if (v.busy) continue;
    const find = (t: string) => v.hand.find((c) => c.type === t);
    if (v.phase === 'turn' && v.sync.current === HUMAN_ID) {
      if (find('scry') && step === 0) { if (tryAct({ t: 'play', cardId: find('scry')!.id }).ok) step = 1; }
      else if (step === 1) { if (tryAct({ t: 'draw' }).ok) step = 2; }
      else if (step === 2 && find('bounty')) { if (tryAct({ t: 'play', cardId: find('bounty')!.id, targetId: 'b1' }).ok) step = 3; }
      else if (step >= 3) tryAct({ t: 'draw' });
    } else if (v.phase === 'scry' && v.pending?.player === HUMAN_ID) tryAct({ t: 'scryDone' });
    else if (v.phase === 'reaction' && v.pending?.player === 'b1' && v.pending.card.type === 'pickpocket' && !v.pending.cancelled && find('parry')) tryAct({ t: 'react', cardId: find('parry')!.id });
    else if (v.phase === 'rescue' && v.doomed === HUMAN_ID && find('angel')) tryAct({ t: 'rescue', cardId: find('angel')!.id });
    else if (v.phase === 'hide' && v.doomed === HUMAN_ID) tryAct({ t: 'hide', position: 0 });
  }
  console.log('tutorial log:', log.filter((l) => !l.startsWith('deal') && !l.startsWith('window')).join(' > '));
  assert(host.engine.winner === HUMAN_ID, 'student should win the tutorial');
}
// ---- Rules: attacks stack; surviving the Hooded Hand ends all owed turns.
{
  const seats: SeatInfo[] = ['A', 'B', 'C'].map((id, i) => ({ id, name: id, isBot: false, seat: i, epithet: '', cloak: '#000' }));
  const host = new Host(
    { mode: 'original', deck: 'original', seed: 7, ...DEFAULT_TIMERS, turnMs: null, handSize: 5 },
    seats,
    { first: 'A', hands: { A: ['bounty', 'bounty'], B: ['bounty'], C: ['angel'] }, deck: ['slip', 'hand', 'slip', 'slip', 'slip', 'slip', 'slip', 'slip'] }
  );
  const turns: string[] = [];
  host.listen('A', (e) => e.e === 'turn' && turns.push(`${e.player}${e.turnsLeft}`));
  let now = 0;
  host.start(now);
  const settle = (ok: () => boolean, label: string) => {
    for (let i = 0; i < 4000; i++) {
      if (ok() && !host.engine.view('A', now).busy) return;
      now += 50;
      host.tick(now);
    }
    throw new Error('rules test stuck: ' + label + ' ' + host.engine.phase);
  };
  const E = host.engine;
  const act = (pid: string, a: any) => {
    const r = host.act(pid, a, now);
    assert(r.ok, `${pid} ${a.t} failed: ${r.err}`);
  };
  const cardOf = (pid: string, t: string) => E.player(pid)!.hand.find((c) => c.type === t)!.id;
  const turnOf = (pid: string, n: number) => () => E.phase === 'turn' && E.current.id === pid && E.turnsLeft === n;
  settle(turnOf('A', 1), 'A starts');
  act('A', { t: 'play', cardId: cardOf('A', 'bounty'), targetId: 'B' });
  settle(turnOf('B', 2), 'bounty gives B 2 turns');
  act('B', { t: 'play', cardId: cardOf('B', 'bounty'), targetId: 'C' });
  settle(turnOf('C', 4), 'stacked bounty gives C 2 + 2 = 4 turns');
  act('C', { t: 'draw' });
  settle(turnOf('C', 3), 'C takes one of four turns');
  act('C', { t: 'draw' });
  settle(() => E.phase === 'rescue', 'C draws the Hand');
  act('C', { t: 'rescue', cardId: cardOf('C', 'angel') });
  settle(() => E.phase === 'hide', 'C hides the Hand');
  act('C', { t: 'hide', position: 3 });
  settle(turnOf('A', 1), 'surviving the Hand ends all of C\'s owed turns: A plays next');
  act('A', { t: 'play', cardId: cardOf('A', 'bounty'), targetId: 'C' });
  settle(turnOf('C', 2), 'a fresh bounty after the reset is 2 turns again');
  console.log('rules: attacks stack, the Hand resets owed turns:', turns.join(' '));
}
console.log('ALL OK');
