import { App } from './app';
import { tweens } from './core/tween';

const app = new App(document.getElementById('app')!, document.getElementById('ui')!);
(window as any).__app = app;

(async () => {
  const params = new URLSearchParams(location.search);
  await app.init((k, label) => console.log('[load]', Math.round(k * 100), label));
  const st = params.get('station') as 'menu' | 'play' | 'table' | 'intro' | null;
  app.rig.snap(app.tavern.stations[st ?? 'menu']);
  await tweens.to(0.6, (k) => (app.gfx.grade.u('uFade').value = 1 - k));
  document.body.dataset.ready = '1';
})();
