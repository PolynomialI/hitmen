// Stutter probe: plays a whole match from the board (menu -> match -> results) and logs every shader program
// compiled after loading and every long frame, with what was happening at the time.
//   npm run build && npx vite preview --port 5174 --strictPort &
//   BASE=http://localhost:5174 node scripts/hitches.cjs
const BASE = process.env.BASE || 'http://localhost:5174';
const { chromium } = require('playwright');
const { autoplay } = require('./e2e/autoplay.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(BASE + '/?station=play&dtcap=0.4&q=' + (process.env.Q || 'high'));
  await page.waitForSelector('body[data-ready]', { timeout: 180000, state: 'attached' });
  await page.evaluate(() => {
    const app = window.__app;
    const r = app.gfx.renderer;
    const log = (window.__hitch = { programs: [], frames: [] });
    let known = new Set(r.info.programs.map((p) => p.id));
    let last = performance.now();
    const what = () => { const s = app.screen; return s && s.queue !== undefined ? (s.phase || '') + (s.processing ? '*' : '') : s ? s.constructor.name : '-'; };
    const tick = () => {
      const now = performance.now();
      const ms = now - last;
      last = now;
      for (const p of r.info.programs) if (!known.has(p.id)) { known.add(p.id); log.programs.push({ t: Math.round(now), name: (p.cacheKey || '').replace(/,+/g, ',').slice(0, 90), at: what() }); }
      log.frames.push({ t: Math.round(now), ms: Math.round(ms), at: what() });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // Into a match the way a player does: Create Table, Original, 4 seats, Sit down.
  await page.click('text=Create Table');
  await page.click('.mode:has-text("Original")');
  await page.click('.size-row .size:text-is("4")');
  await page.click('text=Sit down');
  await page.waitForFunction(() => { const s = window.__app.screen; return s && s.hand; }, null, { timeout: 60000 });
  await autoplay(page, { ms: Number(process.env.MS) || 240000 });
  await page.waitForTimeout(2000);
  const log = await page.evaluate(() => window.__hitch);
  console.log('programs compiled after load:', log.programs.length);
  for (const p of log.programs) console.log('  ', p.t, p.name, p.at);
  // Hitches: frames far slower than the typical frame (the software GPU makes every frame slow).
  const sorted = log.frames.map((f) => f.ms).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const hitches = log.frames.filter((f) => f.ms > Math.max(median * 2.5, median + 250));
  console.log('frames', log.frames.length, 'median', median + 'ms', 'hitches (>2.5x median):', hitches.length);
  for (const f of hitches.slice(0, 30)) console.log('  ', f.t, f.ms + 'ms', f.at);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
