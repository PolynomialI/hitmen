// Smoke test: two WebSocket players join one room and play until someone wins.
import WebSocket from 'ws';

const URL = process.env.WS_URL || 'ws://localhost:8787/ws';
const ROOM = 'SMOKE' + Math.floor(Math.random() * 999);

function player(name: string): Promise<{ won: boolean; events: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    let me = '';
    let hand: { id: number; type: string }[] = [];
    let id = 0;
    let events = 0;
    const act = (action: unknown) => ws.send(JSON.stringify({ t: 'action', id: ++id, action }));
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'join', room: ROOM, name }));
      setTimeout(() => ws.send(JSON.stringify({ t: 'ready' })), 200);
    });
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.t === 'welcome') me = m.you;
      if (m.t === 'result' && !m.result.ok) setTimeout(() => act({ t: 'draw' }), 300);
      if (m.t !== 'event') return;
      events++;
      const ev = m.ev;
      if (ev.e === 'deal' && ev.to === me && ev.card) hand.push(ev.card);
      if (ev.e === 'draw' && ev.player === me && ev.card && ev.card.type !== 'hand') hand.push(ev.card);
      if ((ev.e === 'play' || ev.e === 'parry' || ev.e === 'rescue') && ev.player === me) hand = hand.filter((c) => c.id !== ev.card.id);
      if (ev.e === 'steal' && ev.card) {
        if (ev.from === me) hand = hand.filter((c) => c.id !== ev.card.id);
        if (ev.to === me) hand.push(ev.card);
      }
      const later = (fn: () => void) => setTimeout(fn, ev.dur + 60);
      if (ev.e === 'turn' && ev.player === me) later(() => act({ t: 'draw' }));
      if (ev.e === 'doom' && ev.player === me) {
        const a = hand.find((c) => c.type === 'angel');
        if (a) later(() => act({ t: 'rescue', cardId: a.id }));
      }
      if (ev.e === 'hidePrompt' && ev.player === me) later(() => act({ t: 'hide', position: 0 }));
      if (ev.e === 'over') {
        ws.close();
        resolve({ won: ev.winner === me, events });
      }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('timeout')), 240_000);
  });
}

Promise.all([player('Alys'), player('Bram')]).then((r) => {
  console.log('results', r);
  if (r.filter((x) => x.won).length !== 1) throw new Error('expected exactly one winner');
  console.log('SERVER SMOKE OK');
  process.exit(0);
});
