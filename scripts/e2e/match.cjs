// Requires a running dev server (npm run dev) and Playwright with Chromium (npx playwright install chromium).
// BASE=http://localhost:5173 SHOTS=e2e-shots node scripts/e2e/<name>.cjs
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || 'e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
// Auto-play a multi-rival match, screenshot moments, report errors.
const { chromium } = require('playwright');
(async () => {
  const [mode = 'original', rivals = '3', tag = 'm'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  const errors = [];
  require('./offOrigin.cjs')(page, BASE, errors);
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('GPU stall')) { errors.push(t); console.log('[console]', t.slice(0, 400)); } });
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
  await page.goto(`${BASE}/?start=${mode}&rivals=${rivals}&q=low&dtcap=0.4`);
  await page.waitForSelector('body[data-ready]', { timeout: 120000, state: 'attached' });
  const S = (fn, a) => page.evaluate(fn, a);
  const state = () => S(() => { const s = window.__app.screen; if (!s || !s.hand) return null; return { phase: s.phase, cur: s.current, q: s.queue.length, proc: s.processing, hand: s.hand.cards.map(c => c.card && c.card.type), doomed: s.doomed, give: s.give, pending: s.pending && { p: s.pending.player, t: s.pending.target, e: s.pending.effect, x: s.pending.cancelled }, over: !!s.result, aiming: !!s.aiming, last: s.sync && s.sync.last, lock: s.sync && s.sync.lock }; });
  const proj = (expr) => S((expr) => { const app = window.__app; const s = app.screen; const o = eval(expr); const v = new o.position.constructor(); o.getWorldPosition(v); v.project(app.gfx.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }, expr);
  const clickCard = async (type) => { const p = await proj(`s.hand.cards.find(c => c.card.type === '${type}').root`); await page.mouse.move(p.x, p.y + 8); await page.waitForTimeout(200); await page.mouse.click(p.x, p.y + 8); };
  const clickMarker = async () => { const p = await proj(`[...s.table.seats.values()].find(x => x.markerOn).marker`); await page.mouse.click(p.x, p.y); };
  let shots = 0, t0 = Date.now(), actions = 0;
  const snap = async (n) => { await page.screenshot({ path: `${SHOTS}/${tag}_${String(shots++).padStart(2, '0')}_${n}.png` }); };
  await page.waitForTimeout(3500); await snap('intro');
  const PLAY = ['scry', 'bounty', 'slip', 'brawl', 'pickpocket', 'backdoor', 'glass', 'shackles', 'turnabout', 'aegis', 'warband', 'sands', 'mistletoe', 'yule'];
  const seenPhases = new Set();
  while (Date.now() - t0 < 900000) {
    const st = await state();
    if (!st) { await page.waitForTimeout(500); continue; }
    if (st.over) break;
    const idle = st.q === 0 && !st.proc;
    try {
      if (idle && st.phase === 'turn' && st.cur === 'you' && !st.aiming) {
        const playable = st.hand.filter((t) => PLAY.includes(t) && !(st.lock && st.lock.type === t));
        if (playable.length && Math.random() < 0.55 && actions % 3 !== 2) {
          const t = playable[Math.floor(Math.random() * playable.length)];
          await clickCard(t); actions++;
          await page.waitForTimeout(1500);
          const s2 = await state();
          if (s2 && s2.aiming) { if (!seenPhases.has('aim')) { seenPhases.add('aim'); await snap('aim'); } await clickMarker(); }
        } else { const p = await proj('s.table.deckHit'); await page.mouse.click(p.x, p.y); actions++; }
        await page.waitForTimeout(500);
      } else if (st.phase === 'scry' && idle) {
        if (!seenPhases.has('scry')) { seenPhases.add('scry'); await snap('scry'); }
        try { await page.click('text=Done', { timeout: 1500 }); } catch {}
      } else if (st.phase === 'reaction' && st.pending && st.pending.p !== 'you' && !st.pending.x && st.pending.t === 'you') {
        const r = st.hand.find((t) => ['misdirect', 'parry', 'breath'].includes(t));
        if (r) { await clickCard(r); await page.waitForTimeout(900); const s2 = await state(); if (s2 && s2.aiming) await clickMarker(); }
      } else if (st.phase === 'give' && st.give && st.give.from === 'you' && idle) {
        if (!seenPhases.has('give')) { seenPhases.add('give'); await snap('give'); }
        await clickCard(st.hand[0]);
      } else if (st.phase === 'rescue' && st.doomed === 'you' && idle) {
        await snap('doom');
        const a = st.hand.includes('angel') ? 'angel' : (st.last === 'angel' && st.hand.includes('glass') ? 'glass' : null);
        if (a) await clickCard(a);
      } else if (st.phase === 'hide' && st.doomed === 'you') {
        await page.waitForTimeout(500); await snap('hide');
        try { await page.click('text=Confirm', { timeout: 1500 }); } catch {}
      } else if (st.lock && !seenPhases.has('lock')) { seenPhases.add('lock'); await snap('lock'); }
    } catch (e) { console.log('act err', e.message.slice(0, 160)); }
    await page.waitForTimeout(300);
  }
  const fin = await state();
  console.log('final', JSON.stringify(fin), 'actions', actions, 'secs', ((Date.now() - t0) / 1000) | 0);
  await page.waitForTimeout(3500);
  await snap('end');
  console.log('errors', errors.length);
  process.exitCode = errors.length ? 1 : 0;
  await browser.close();
})();
