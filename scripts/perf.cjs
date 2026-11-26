// Performance probe: per-screen render stats, frame rate and JS hot spots.
//   npm run build && npx vite preview --port 5174 --strictPort &
//   BASE=http://localhost:5174 node scripts/perf.cjs [title|board|match ...]
// Runs on the container's software GPU (SwiftShader), so absolute fps is low; compare runs with each other.
// Prints JSON lines: { scene, fps, cpuMs (main-thread JS per frame), calls, tris, programs, lights, shadowLights, ... }.
const BASE = process.env.BASE || 'http://localhost:5174';
const Q = process.env.Q || 'high';
const W = Number(process.env.W) || 960;
const H = Number(process.env.H) || 540;
const SECS = Number(process.env.SECS) || 6;
const { chromium } = require('playwright');

const SCENES = {
  title: `/?q=${Q}`,
  board: `/?station=play&q=${Q}`,
  match: `/?start=original&rivals=5&q=${Q}`,
};

(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const name of want) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.goto(BASE + SCENES[name]);
    await page.waitForSelector('body[data-ready]', { timeout: 180000, state: 'attached' });
    // Freeze the adaptive resolution so runs compare like with like: the quality's top scale, or SCALE=1 for the full
    // viewport whatever the quality (same pixel count across tiers and builds).
    await page.evaluate((full) => {
      const g = window.__app.gfx;
      g.adapt = () => {};
      g.scale = full ? 1 : g.maxScale;
      g.resize();
    }, !!process.env.SCALE);
    if (name === 'match') {
      // Let the deal and intro finish.
      await page.waitForFunction(() => { const s = window.__app.screen; return s && s.seats && s.queue && s.queue.length === 0 && !s.processing; }, null, { timeout: 120000 }).catch(() => {});
    }
    await page.waitForTimeout(2500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
    const stats = await page.evaluate(async (secs) => {
      const app = window.__app;
      const r = app.gfx.renderer;
      // Time the main-thread work of each frame (update + render submission).
      const proto = Object.getPrototypeOf(app);
      const orig = proto.frame;
      let cpu = 0;
      let n = 0;
      app.frame = function (now) {
        const t0 = performance.now();
        orig.call(this, now);
        cpu += performance.now() - t0;
        n++;
      };
      r.info.autoReset = false;
      r.info.reset();
      const t0 = performance.now();
      await new Promise((res) => setTimeout(res, secs * 1000));
      const el = (performance.now() - t0) / 1000;
      const info = { calls: r.info.render.calls / n, tris: r.info.render.triangles / n };
      r.info.autoReset = true;
      delete app.frame;
      let lights = 0, shadowLights = 0, pointLights = 0, meshes = 0, visibleMeshes = 0, transparent = 0, shadowCasters = 0, texts = 0;
      const mats = new Map();
      app.gfx.scene.traverse((o) => {
        if (o.isLight) {
          let vis = true;
          for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
          if (vis && !o.isAmbientLight && !o.isHemisphereLight) { lights++; if (o.isPointLight) pointLights++; if (o.castShadow) shadowLights++; }
        }
        if (o.isMesh) {
          meshes++;
          let vis = true;
          for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
          if (vis) {
            visibleMeshes++;
            if (o.castShadow) shadowCasters++;
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of ms) { mats.set(m.type, (mats.get(m.type) || 0) + 1); if (m.transparent) transparent++; }
          }
        }
        if (o.text !== undefined && o.sync) texts++;
      });
      return {
        fps: +(n / el).toFixed(1),
        cpuMs: +(cpu / n).toFixed(2),
        calls: Math.round(info.calls),
        tris: Math.round(info.tris),
        programs: r.info.programs.length,
        textures: r.info.memory.textures,
        geometries: r.info.memory.geometries,
        lights, pointLights, shadowLights, shadowCasters, meshes, visibleMeshes, transparent, texts,
        materials: Object.fromEntries(mats),
        px: `${r.domElement.width}x${r.domElement.height}`,
        quality: app.gfx.quality,
      };
    }, SECS);
    const { profile } = await cdp.send('Profiler.stop');
    // Self time by function.
    const self = new Map();
    const byId = new Map(profile.nodes.map((nd) => [nd.id, nd]));
    const dts = profile.timeDeltas;
    profile.samples.forEach((id, i) => {
      const nd = byId.get(id);
      const f = nd.callFrame;
      const key = `${f.functionName || '(anon)'} ${(f.url || '').split('/').pop().split('?')[0]}:${f.lineNumber + 1}`;
      self.set(key, (self.get(key) || 0) + (dts[i] || 0) / 1000);
    });
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    const top = [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14);
    const gc = [...self.entries()].filter(([k]) => k.startsWith('(garbage collector)')).reduce((a, [, v]) => a + v, 0);
    const idle = [...self.entries()].filter(([k]) => k.startsWith('(idle)')).reduce((a, [, v]) => a + v, 0);
    console.log(JSON.stringify({ scene: name, ...stats, gcMs: Math.round(gc), idleMs: Math.round(idle), profMs: Math.round(total) }));
    if (process.env.TOP) for (const [k, v] of top) console.log(`   ${v.toFixed(0).padStart(6)} ms  ${k}`);
    await page.close();
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
