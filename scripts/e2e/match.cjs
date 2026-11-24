// Requires a running dev server (npm run dev) and Playwright with Chromium (npx playwright install chromium).
// BASE=http://localhost:5173 SHOTS=e2e-shots node scripts/e2e/<name>.cjs
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || 'e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
// Auto-play a multi-rival match, screenshot moments, report errors.
const { chromium } = require('playwright');
const { autoplay } = require('./autoplay.cjs');
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
  let shots = 0;
  const snap = async (n) => { await page.screenshot({ path: `${SHOTS}/${tag}_${String(shots++).padStart(2, '0')}_${n}.png` }); };
  await page.waitForTimeout(3500); await snap('intro');
  const { actions, secs, final: fin } = await autoplay(page, { snap });
  console.log('final', JSON.stringify(fin), 'actions', actions, 'secs', secs);
  await page.waitForTimeout(3500);
  await snap('end');
  console.log('errors', errors.length);
  process.exitCode = errors.length ? 1 : 0;
  await browser.close();
})();
