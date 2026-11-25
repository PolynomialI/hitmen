// Aiming at a rival works at every table size: enter aim mode with every rival as an option and check each one's
// white arrow is on screen and turns green under the pointer.
//   BASE=http://localhost:5173 node scripts/e2e/targets.cjs
const BASE = process.env.BASE || 'http://localhost:5173';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  for (const rivals of (process.env.RIVALS || '1,3,5').split(',').map(Number)) {
    // A fresh context per table size (pages sharing one were flaky about pointer hover).
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    require('./offOrigin.cjs')(page, BASE, errors);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/?start=original&rivals=${rivals}&q=low&dtcap=0.4`);
    await page.waitForFunction(() => { const s = window.__app.screen; return s && s.phase === 'turn' && s.queue.length === 0 && !s.processing && s.current === s.me; }, null, { timeout: 300000 });
    await page.evaluate(() => {
      const s = window.__app.screen;
      s.enterAim({ kind: 'play', card: { id: -1, type: 'bounty' }, effect: 'bounty' }, [...s.table.seats.keys()], false);
    });
    await page.waitForTimeout(2500);
    const marks = await page.evaluate(() => {
      const app = window.__app, s = app.screen;
      return [...s.table.seats.values()].map((sv) => {
        const v = new sv.marker.position.constructor();
        sv.marker.getWorldPosition(v);
        v.project(app.gfx.camera);
        return { id: sv.info.id, on: sv.markerOn, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
      });
    });
    let green = 0;
    for (const m of marks) {
      if (!m.on) errors.push(`${rivals} rivals: ${m.id} has no arrow`);
      if (m.x < 0 || m.x > 1280 || m.y < 0 || m.y > 720) errors.push(`${rivals} rivals: ${m.id}'s arrow is off screen`);
      await page.mouse.move(m.x, m.y);
      await page.waitForTimeout(500);
      const hover = await page.evaluate((id) => window.__app.screen.table.seat(id).markerHover, m.id);
      if (hover > 0.5) green++;
      else {
        const st = await page.evaluate(([x, y]) => { const s = window.__app.screen, pk = s.nav.picker; const el = document.elementFromPoint(x, y); return { top: el && el.tagName + '.' + el.className + ' ' + (el.textContent || '').slice(0, 40), aiming: !!s.aiming, phase: s.phase, cur: s.current, me: s.me, q: s.queue.length, proc: s.processing, hovered: pk.hovered && pk.hovered.object.type, ndc: [pk.ndc.x.toFixed(2), pk.ndc.y.toFixed(2)], pickerOn: pk.enabled }; }, [m.x, m.y]);
        errors.push(`${rivals} rivals: ${m.id}'s arrow does not light up under the pointer ${JSON.stringify(st)}`);
      }
    }
    console.log(`${rivals} rivals: ${marks.length} arrows, ${green} light up`);
    await ctx.close();
  }
  console.log('errors', errors.length, errors.slice(0, 5));
  process.exitCode = errors.length ? 1 : 0;
  await browser.close();
})();
