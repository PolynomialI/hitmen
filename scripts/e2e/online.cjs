// Online tables end to end, against the game server serving the built client (same origin, as on Render):
//   npm run build && npm start            (or: npm run build && npx tsx server/index.ts)
//   BASE=http://localhost:8787 SHOTS=e2e-shots node scripts/e2e/online.cjs
// Three players: Alys creates an open 4-seat table from the board, Bram finds it in Join a Table, Cobb joins by
// code and leaves again, Alys starts (two regulars fill the chairs), both play; Bram reloads mid-match and must get
// his seat back (the table is rebuilt from the server's history); results; back to the table for another round.
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8787';
const SHOTS = process.env.SHOTS || 'e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
const { autoplay, helpers } = require('./autoplay.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const fail = (msg) => { errors.push(msg); console.log('[FAIL]', msg); };
  const open = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 } });
    await ctx.addInitScript((n) => {
      try { if (!localStorage.getItem('hooded-hand-profile-v2')) localStorage.setItem('hooded-hand-profile-v2', JSON.stringify({ name: n })); } catch {}
    }, name);
    const page = await ctx.newPage();
    require('./offOrigin.cjs')(page, BASE, errors);
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('GPU stall')) { errors.push(`${name}: ${t}`); console.log(`[${name} console]`, t.slice(0, 300)); } });
    page.on('pageerror', (e) => { errors.push(`${name}: ${e.message}`); console.log(`[${name} pageerror]`, e.message); });
    return page;
  };
  const shot = (p, n) => p.screenshot({ path: `${SHOTS}/on_${n}.png` });
  const board = async (p) => {
    await p.goto(BASE + '/?station=play&q=low&dtcap=0.4');
    await p.waitForSelector('body[data-ready]', { timeout: 120000, state: 'attached' });
    // The server was found: Join a Table is unlocked.
    await p.waitForSelector('.pb:not(.locked):has-text("Join a Table")', { timeout: 30000 });
  };
  const seated = (p) => p.evaluate(() => document.querySelectorAll('.panel.lobby .seat:not(.empty)').length);
  const until = async (p, fn, label, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await fn()) return; await p.waitForTimeout(300); }
    throw new Error('timeout: ' + label);
  };

  const A = await open('Alys');
  const B = await open('Bram');
  const C = await open('Cobb');

  // 1. Alys opens a table for four from the board.
  await board(A);
  await A.click('text=Create Table');
  await A.click('.mode:has-text("Original")');
  await A.click('.size-row .size:text-is("4")');
  await A.click('.who:has-text("Open table")');
  await A.waitForTimeout(400);
  await shot(A, '01_create');
  await A.click('text=Sit down');
  await A.waitForSelector('.panel.lobby .seat.me', { timeout: 20000 });
  const code = (await A.textContent('.panel.lobby .code')).trim();
  console.log('table code', code);

  // 2. Bram finds it under Join a Table.
  await board(B);
  await B.waitForSelector('.pb-count.on', { timeout: 20000 });
  await B.click('text=Join a Table');
  await B.waitForSelector('.open-table:has-text("Alys")', { timeout: 20000 });
  await B.waitForTimeout(400);
  await shot(B, '02_join_list');
  await B.click('.open-table:has-text("Alys")');
  await until(A, async () => (await seated(A)) === 2, 'Bram seated');

  // 3. Cobb joins with the code (typed in lower case), then thinks better of it.
  await board(C);
  await C.click('text=Join a Table');
  await C.fill('.code-input', code.toLowerCase());
  await C.click('.code-row >> text=Join');
  await until(A, async () => (await seated(A)) === 3, 'Cobb seated');
  await B.waitForSelector('.panel.lobby .wait');
  await A.waitForTimeout(500);
  await shot(A, '03_lobby_host');
  await shot(B, '03_lobby_guest');
  await C.click('.panel.lobby >> text=Leave');
  await until(A, async () => (await seated(A)) === 2, 'Cobb left');
  await C.context().close();

  // 4. Alys starts; two regulars take the empty chairs.
  await A.click('.panel.lobby >> text=Start the night');
  for (const p of [A, B]) await p.waitForFunction(() => { const s = window.__app.screen; return s && s.seats && s.seats.length === 4; }, null, { timeout: 60000 });
  const meA = await A.evaluate(() => window.__app.screen.me);
  const meB = await B.evaluate(() => window.__app.screen.me);
  if (meA === meB || meA === 'you') fail(`player ids look wrong: ${meA} ${meB}`);

  // 5. Both play. Bram reloads mid-match and must get his seat back.
  const playA = autoplay(A, { snap: (n) => shot(A, 'a_' + n) });
  const playB = (async () => {
    const t0 = Date.now();
    await autoplay(B, { stop: () => Date.now() - t0 > 40000 });
    const { state } = helpers(B);
    const before = await state();
    await shot(B, '04_before_reload');
    if (before && before.over) { console.log('match ended before the reload; skipping it'); return; }
    await B.reload();
    await B.waitForSelector('body[data-ready]', { timeout: 120000, state: 'attached' });
    await B.waitForFunction(() => { const s = window.__app.screen; return s && s.seats && s.seats.length === 4 && s.queue.length === 0 && !s.processing; }, null, { timeout: 90000 });
    const after = await state();
    console.log('reload: before', JSON.stringify({ me: before.me, deck: before.deck, hand: before.hand.length }), 'after', JSON.stringify({ me: after.me, deck: after.deck, hand: after.hand.length, phase: after.phase }));
    if (after.me !== before.me) fail('reload: different seat');
    if (after.phase === 'intro') fail('reload: stuck in the intro');
    if (!after.over && after.deck > before.deck + 2) fail('reload: deck went backwards');
    await B.waitForTimeout(1500);
    await shot(B, '05_after_reload');
    await autoplay(B, {});
  })();
  await Promise.all([playA, playB]);

  // 6. Results for both, then back to the table for another round.
  for (const p of [A, B]) await p.waitForSelector('.panel.results', { timeout: 60000 });
  await A.waitForTimeout(1500);
  await shot(A, '06_results');
  await A.click('text=Back to the table');
  await A.waitForSelector('.panel.lobby .seat.me', { timeout: 30000 });
  await B.click('text=Back to the table');
  await until(A, async () => (await seated(A)) === 2, 'both back at the table');
  await A.waitForTimeout(800);
  await shot(A, '07_again');

  console.log('errors', errors.length);
  process.exitCode = errors.length ? 1 : 0;
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
