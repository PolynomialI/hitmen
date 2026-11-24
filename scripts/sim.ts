// Headless simulation: bot-vs-bot matches and a scripted tutorial run, checking rule invariants.
import { Bot } from '../src/shared/bot';
import { Host } from '../src/shared/host';
import { createBotMatch, HUMAN_ID, BOT_ID } from '../src/shared/match';
import { DEFAULT_TIMERS } from '../src/shared/timing';
import type { GameEvent, SeatInfo } from '../src/shared/types';

function assert(c: unknown, msg: string): asserts c {
  if (!c) throw new Error('ASSERT: ' + msg);
}

function runBotVsBot(seed: number) {
  const seats: SeatInfo[] = [
    { id: 'a', name: 'A', isBot: true, seat: 0, epithet: '', cloak: '#000' },
    { id: 'b', name: 'B', isBot: true, seat: 1, epithet: '', cloak: '#000' },
  ];
  const host = new Host({ mode: 'original', seed, ...DEFAULT_TIMERS, handSize: 4 }, seats, {}, [
    new Bot('a', seed + 1, 0.8),
    new Bot('b', seed + 2, 0.5),
  ]);
  const evs: GameEvent[] = [];
  host.listen('a', (e) => evs.push(e));
  let now = 0;
  host.start(now);
  const total = () => {
    const e = host.engine;
    return e.deck.length + e.discard.length + e.players.reduce((s, p) => s + p.hand.length, 0);
  };
  let cards = -1;
  for (let i = 0; i < 200000 && host.engine.phase !== 'over'; i++) {
    now += 50;
    host.tick(now);
    if (host.engine.phase === 'turn' && cards < 0) cards = total();
    if (cards > 0 && host.engine.phase !== 'over') {
      const t = total() + (host.engine.doom ? 1 : 0);
      assert(t === cards, `card count drift ${t} vs ${cards} (seed ${seed})`);
    }
  }
  assert(host.engine.phase === 'over', `game did not finish (seed ${seed})`);
  return { winner: host.engine.winner, minutes: now / 60000, events: evs.length };
}

let wins: Record<string, number> = {};
let mins = 0;
const N = 300;
for (let s = 1; s <= N; s++) {
  const r = runBotVsBot(s * 7919);
  wins[r.winner ?? 'none'] = (wins[r.winner ?? 'none'] ?? 0) + 1;
  mins += r.minutes;
}
console.log(`bot-vs-bot x${N}: wins`, wins, `avg length ${(mins / N).toFixed(1)} min`);

// Tutorial: a "student" that follows the hints.
{
  const { host } = createBotMatch({ mode: 'tutorial', playerName: 'Tester', seed: 1 });
  const log: string[] = [];
  let hand: { id: number; type: string }[] = [];
  host.listen(HUMAN_ID, (e) => {
    log.push(e.e + ('player' in e ? ':' + e.player : '') + ('card' in e && e.card ? ':' + e.card.type : ''));
  });
  let now = 0;
  host.start(now);
  const view = () => host.engine.view(HUMAN_ID, now);
  const tryAct = (a: any) => host.act(HUMAN_ID, a, now);
  let step = 0;
  for (let i = 0; i < 100000 && host.engine.phase !== 'over'; i++) {
    now += 50;
    host.tick(now);
    const v = view();
    if (v.busy) continue;
    hand = v.hand;
    const find = (t: string) => v.hand.find((c) => c.type === t);
    if (v.phase === 'turn' && v.sync.current === HUMAN_ID) {
      if (find('scry') && step === 0) { if (tryAct({ t: 'play', cardId: find('scry')!.id }).ok) step = 1; }
      else if (step === 1) { if (tryAct({ t: 'draw' }).ok) step = 2; }
      else if (step === 2 && find('bounty')) { if (tryAct({ t: 'play', cardId: find('bounty')!.id, targetId: BOT_ID }).ok) step = 3; }
      else if (step >= 3) { tryAct({ t: 'draw' }); }
    } else if (v.phase === 'scry' && v.sync.current === HUMAN_ID) tryAct({ t: 'scryDone' });
    else if (v.phase === 'reaction' && v.pending?.player === BOT_ID && v.pending.card.type === 'pickpocket' && !v.pending.cancelled && find('parry')) tryAct({ t: 'parry', cardId: find('parry')!.id });
    else if (v.phase === 'rescue' && v.doomed === HUMAN_ID && find('angel')) tryAct({ t: 'rescue', cardId: find('angel')!.id });
    else if (v.phase === 'hide' && v.doomed === HUMAN_ID) tryAct({ t: 'hide', position: 0 });
  }
  console.log('tutorial log:', log.filter((l) => !l.startsWith('deal') && !l.startsWith('window')).join(' > '));
  assert(host.engine.winner === HUMAN_ID, 'student should win the tutorial');
  console.log(`tutorial finished in ${(now / 1000).toFixed(0)}s, winner ${host.engine.winner}`);
}
console.log('ALL OK');
