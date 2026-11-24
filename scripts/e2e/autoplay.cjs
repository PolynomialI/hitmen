// Auto-plays the human seat of a match page by clicking real 3D objects, until the match is over (or `stop()`).
// Shared by match.cjs (bot tables) and online.cjs (online tables, where the player id is not 'you').
const PLAY = ['scry', 'bounty', 'slip', 'brawl', 'pickpocket', 'backdoor', 'glass', 'shackles', 'turnabout', 'aegis', 'warband', 'sands', 'mistletoe', 'yule'];

function helpers(page) {
  const S = (fn, a) => page.evaluate(fn, a);
  const state = () =>
    S(() => {
      const s = window.__app.screen;
      if (!s || !s.hand) return null;
      return { me: s.me, phase: s.phase, cur: s.current, q: s.queue.length, proc: s.processing, hand: s.hand.cards.map((c) => c.card && c.card.type), doomed: s.doomed, give: s.give, pending: s.pending && { p: s.pending.player, t: s.pending.target, e: s.pending.effect, x: s.pending.cancelled }, over: !!s.result, aiming: !!s.aiming, last: s.sync && s.sync.last, lock: s.sync && s.sync.lock, deck: s.sync && s.sync.deck, seats: s.seats.length };
    });
  // Projects a scene object to screen pixels. `expr` is a fixed expression written in these test scripts (never
  // external input), evaluated inside the test browser page.
  const proj = (expr) => S((expr) => { const app = window.__app; const s = app.screen; const o = eval(expr); const v = new o.position.constructor(); o.getWorldPosition(v); v.project(app.gfx.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }, expr);
  const clickCard = async (type) => { const p = await proj(`s.hand.cards.find(c => c.card.type === '${type}').root`); await page.mouse.move(p.x, p.y + 8); await page.waitForTimeout(200); await page.mouse.click(p.x, p.y + 8); };
  const clickMarker = async () => { const p = await proj(`[...s.table.seats.values()].find(x => x.markerOn).marker`); await page.mouse.click(p.x, p.y); };
  return { state, proj, clickCard, clickMarker };
}

/**
 * @param page Playwright page showing a MatchScreen
 * @param o.snap (name) => Promise, called at notable moments (first aim, scry, give, doom, hide, lock)
 * @param o.stop () => boolean | Promise<boolean>, checked every step; return true to stop early
 * @param o.ms overall time limit
 */
async function autoplay(page, o = {}) {
  const { state, proj, clickCard, clickMarker } = helpers(page);
  const snap = o.snap || (async () => {});
  const seen = new Set();
  const t0 = Date.now();
  let actions = 0;
  while (Date.now() - t0 < (o.ms || 900000)) {
    if (o.stop && (await o.stop())) break;
    let st;
    try {
      st = await state();
    } catch (e) {
      // Page navigating (e.g. reloaded mid-match).
      await page.waitForTimeout(500);
      continue;
    }
    if (!st) { await page.waitForTimeout(500); continue; }
    if (st.over) break;
    const me = st.me;
    const idle = st.q === 0 && !st.proc;
    try {
      if (idle && st.phase === 'turn' && st.cur === me && !st.aiming) {
        const playable = st.hand.filter((t) => PLAY.includes(t) && !(st.lock && st.lock.type === t));
        if (playable.length && Math.random() < 0.55 && actions % 3 !== 2) {
          const t = playable[Math.floor(Math.random() * playable.length)];
          await clickCard(t); actions++;
          await page.waitForTimeout(1500);
          const s2 = await state();
          if (s2 && s2.aiming) { if (!seen.has('aim')) { seen.add('aim'); await snap('aim'); } await clickMarker(); }
        } else { const p = await proj('s.table.deckHit'); await page.mouse.click(p.x, p.y); actions++; }
        await page.waitForTimeout(500);
      } else if (st.phase === 'scry' && idle) {
        if (!seen.has('scry')) { seen.add('scry'); await snap('scry'); }
        try { await page.click('text=Done', { timeout: 1500 }); } catch {}
      } else if (st.phase === 'reaction' && st.pending && st.pending.p !== me && !st.pending.x && st.pending.t === me) {
        const r = st.hand.find((t) => ['misdirect', 'parry', 'breath'].includes(t));
        if (r) { await clickCard(r); await page.waitForTimeout(900); const s2 = await state(); if (s2 && s2.aiming) await clickMarker(); }
      } else if (st.phase === 'give' && st.give && st.give.from === me && idle) {
        if (!seen.has('give')) { seen.add('give'); await snap('give'); }
        await clickCard(st.hand[0]);
      } else if (st.phase === 'rescue' && st.doomed === me && idle) {
        await snap('doom');
        const a = st.hand.includes('angel') ? 'angel' : (st.last === 'angel' && st.hand.includes('glass') ? 'glass' : null);
        if (a) await clickCard(a);
      } else if (st.phase === 'hide' && st.doomed === me) {
        await page.waitForTimeout(500); await snap('hide');
        try { await page.click('text=Confirm', { timeout: 1500 }); } catch {}
      } else if (st.lock && !seen.has('lock')) { seen.add('lock'); await snap('lock'); }
    } catch (e) { console.log('act err', e.message.slice(0, 160)); }
    await page.waitForTimeout(300);
  }
  return { actions, secs: ((Date.now() - t0) / 1000) | 0, final: await state().catch(() => null) };
}

module.exports = { autoplay, helpers };
