// Online tables end to end, against the game server serving the built client (same origin, as on Render):
//   npm run build && npm start            (or: npm run build && npx tsx server/index.ts)
//   BASE=http://localhost:8787 SHOTS=e2e-shots node scripts/e2e/online.cjs
// Real players only. Alys creates an open 4-seat table from the board, Bram finds it in Join Table, Cobb arrives by
// invite link and leaves again, Alys begins (just the two of them, no bots), Dee watches it from Watch Table; Bram
// reloads mid-match and must get his seat back (Alys sees the countdown meanwhile); results; back to the table.
// Then a Duel from the queue: Ezra and Finn are matched, Finn closes the tab and is knocked out after 30 s.
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
    // The papers are pinned and the server was found.
    await p.waitForFunction(() => { const s = window.__app.screen; return s && s.tickets && s.online && s.tickets.every((t) => t.mesh.scale.x > 0.99); }, null, { timeout: 30000 });
  };
  // Click a paper on the notice board (a 3D object): project it to the screen and click there.
  const ticket = async (p, title) => {
    const at = await p.evaluate((title) => {
      const app = window.__app;
      const t = app.screen.tickets.find((x) => x.title === title);
      const v = new t.mesh.position.constructor();
      t.mesh.getWorldPosition(v);
      v.project(app.gfx.camera);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
    }, title);
    await p.mouse.move(at.x, at.y);
    await p.waitForTimeout(150);
    await p.mouse.click(at.x, at.y);
  };
  const seatsIs = (p, n) => p.waitForFunction((n) => { const s = window.__app.screen; return s && s.seats && s.seats.length === n; }, n, { timeout: 60000 });
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
  await shot(A, '00_board');
  await ticket(A, 'Create Table');
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
  await ticket(B, 'Join Table');
  await B.waitForSelector('.open-table:has-text("Alys")', { timeout: 20000 });
  await B.waitForTimeout(400);
  await shot(B, '02_join_list');
  await B.click('.open-table:has-text("Alys")');
  await until(A, async () => (await seated(A)) === 2, 'Bram seated');

  // 3. Cobb opens the invite link Alys would send (it lands him straight at the table), then thinks better of it.
  //    (Joining by typing the code is covered by scripts/serverSmoke.ts and the Join a Table panel above.)
  await C.goto(`${BASE}/?join=${code.toLowerCase()}&q=low&dtcap=0.4`);
  await C.waitForSelector('body[data-ready]', { timeout: 120000, state: 'attached' });
  await C.waitForSelector('.panel.lobby .seat.me', { timeout: 30000 });
  await until(A, async () => (await seated(A)) === 3, 'Cobb seated');
  await B.waitForSelector('.panel.lobby .wait');
  await A.waitForTimeout(500);
  await shot(A, '03_lobby_host');
  await shot(B, '03_lobby_guest');
  await C.click('.panel.lobby >> text=Leave');
  await until(A, async () => (await seated(A)) === 2, 'Cobb left');
  await C.context().close();

  // 4. Alys begins: just the two of them at the table, no bots.
  await A.click('.panel.lobby >> text=Begin');
  for (const p of [A, B]) await seatsIs(p, 2);
  const meA = await A.evaluate(() => window.__app.screen.me);
  const meB = await B.evaluate(() => window.__app.screen.me);
  if (meA === meB || meA === 'you') fail(`player ids look wrong: ${meA} ${meB}`);
  const bots = await A.evaluate(() => window.__app.screen.seats.filter((s) => s.isBot).length);
  if (bots) fail(`bots at an online table: ${bots}`);

  // Dee watches from Watch Table: no seat, no hand, the arrows switch between the players' chairs.
  const D = await open('Dee');
  await board(D);
  await ticket(D, 'Watch Table');
  await D.waitForSelector('.open-table:has-text("Alys")', { timeout: 20000 });
  await shot(D, '04_watch_list');
  await D.click('.open-table:has-text("Alys")');
  await seatsIs(D, 2);
  await D.waitForSelector('.spectate-bar', { timeout: 30000 });
  await D.waitForTimeout(2500);
  await shot(D, '04_watching');
  const first = await D.textContent('.spec-name');
  await D.click('.spec-arrow >> nth=1');
  await D.waitForTimeout(1500);
  if ((await D.textContent('.spec-name')) === first) fail('watch: the arrow did not switch players');
  await shot(D, '04_watching_other');

  // 5. Both play. Bram reloads mid-match and must get his seat back.
  const playA = autoplay(A, { snap: (n) => shot(A, 'a_' + n) });
  const playB = (async () => {
    const t0 = Date.now();
    await autoplay(B, { stop: () => Date.now() - t0 > 12000 });
    const { state } = helpers(B);
    const before = await state();
    await shot(B, '04_before_reload');
    if (before && before.over) { console.log('match ended before the reload; skipping it'); return; }
    await B.reload();
    // Alys is told Bram dropped, with the time he has to come back.
    await A.waitForSelector('.away-chip:has-text("Bram")', { timeout: 15000 }).then(() => shot(A, '05_away')).catch(() => fail('no countdown while Bram was away'));
    await B.waitForSelector('body[data-ready]', { timeout: 120000, state: 'attached' });
    // Two players make a short match: if it ended while Bram was away he is back at the table's lobby instead.
    await B.waitForFunction(() => { const s = window.__app.screen; return (s && s.seats && s.seats.length === 2 && s.queue.length === 0 && !s.processing) || document.querySelector('.panel.lobby .seat.me'); }, null, { timeout: 90000 });
    if (await B.$('.panel.lobby .seat.me')) { console.log('match ended during the reload: Bram is back in the lobby'); return; }
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
  await A.waitForSelector('.panel.results', { timeout: 60000 });
  await A.waitForTimeout(1500);
  await shot(A, '06_results');
  await A.click('text=Back to the table');
  await A.waitForSelector('.panel.lobby .seat.me', { timeout: 30000 });
  if (!(await B.$('.panel.lobby .seat.me'))) {
    await B.waitForSelector('.panel.results', { timeout: 60000 });
    await B.click('text=Back to the table');
  }
  await until(A, async () => (await seated(A)) === 2, 'both back at the table');
  await A.waitForTimeout(800);
  await shot(A, '07_again');
  await D.context().close();
  await A.context().close();
  await B.context().close();

  // 7. A Duel from the queue. Finn closes his tab mid-match and never comes back: knocked out after 30 s.
  const E = await open('Ezra');
  const F = await open('Finn');
  await board(E);
  await board(F);
  await ticket(E, 'Duel');
  await E.waitForSelector('.panel.queue', { timeout: 10000 });
  await E.waitForTimeout(500);
  await shot(E, '08_queue');
  await ticket(F, 'Duel');
  for (const p of [E, F]) await seatsIs(p, 2);
  await E.waitForFunction(() => { const s = window.__app.screen; return s.phase === 'turn' && s.queue.length === 0; }, null, { timeout: 60000 });
  await F.context().close();
  await E.waitForSelector('.away-chip:has-text("Finn")', { timeout: 15000 });
  await shot(E, '09_finn_away');
  await E.waitForSelector('.panel.results', { timeout: 70000 });
  const won = await E.evaluate(() => { const s = window.__app.screen; return s.result.winner === s.me; });
  if (!won) fail('Duel: Ezra should win when Finn never returns');
  await shot(E, '10_duel_won');

  console.log('errors', errors.length);
  process.exitCode = errors.length ? 1 : 0;
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
