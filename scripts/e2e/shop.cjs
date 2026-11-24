// Requires a running dev server (npm run dev) and Playwright with Chromium (npx playwright install chromium).
// BASE=http://localhost:5173 SHOTS=e2e-shots node scripts/e2e/<name>.cjs
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:5173';
const SHOTS = process.env.SHOTS || 'e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) { errors.push(m.text()); console.log('[console]', m.text().slice(0, 300)); } });
  await page.goto(BASE + '/?station=shop&q=low&dtcap=0.5');
  await page.waitForSelector('body[data-ready]', { timeout: 120000, state: 'attached' });
  await page.waitForTimeout(3000);

  await page.click('.ware >> nth=0');
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOTS + '/bf_detail.png' });
  await page.click('.panel.detail .buy >> nth=1');
  await page.waitForTimeout(600);
  await page.click('.panel.detail .buy >> nth=0');
  await page.waitForTimeout(1500);
  await page.click('.panel.detail .btn-text');
  await page.click('text=Fate\'s Wheel');
  await page.waitForTimeout(500);
  await page.click('text=Spin · 1 token');
  await page.waitForTimeout(8000);
  await page.screenshot({ path: SHOTS + '/bf_wheel.png' });
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('hooded-hand-profile-v2')));
  console.log('equipped', JSON.stringify(prof.equipped), 'owned', Object.keys(prof.owned).length, 'coins', prof.coins, 'tokens', prof.tokens);
  await page.goto(BASE + '/?start=original&rivals=2&q=low&dtcap=0.4');
  await page.waitForSelector('body[data-ready]', { timeout: 120000, state: 'attached' });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: SHOTS + '/bf_match.png' });
  console.log('errors', errors.length);
  process.exitCode = errors.length ? 1 : 0;
  await browser.close();
})();
