import './ui/styles.css';
import { App } from './app';
import { audio } from './audio/audio';
import { Picker } from './core/picker';
import { ease, tweens } from './core/tween';
import { MatchScreen, type MatchOptions } from './match/matchScreen';
import { MainMenu, PlayMenu, TitleScreen, type Nav } from './screens/menus';
import { InventoryScreen, openChallenges, ShopScreen } from './screens/shop';
import { applyCosmetics } from './cosmetics/apply';
import { refreshChallenges } from './ui/progression';
import { h } from './ui/dom';
import { Hud } from './ui/hud';
import { profile } from './ui/profile';
import type { GameMode } from '../shared/types';

const uiRoot = document.getElementById('ui')!;
const app = new App(document.getElementById('app')!, uiRoot);
(window as unknown as { __app: App }).__app = app;

const crest = `<svg class="crest" viewBox="0 0 64 64"><path d="M34 6C23 11 14 26 14 39c0 8 4 14 9 16h18c5-2 9-8 9-16 0-13-7-24-16-33z" fill="#e6c56a"/><ellipse cx="32" cy="37" rx="9" ry="11" fill="#1a0507"/><path d="M26.5 36c1.5-1.4 3.6-1.2 4.4.6-1.6.6-3.2.4-4.4-.6zm11 0c-1.5-1.4-3.6-1.2-4.4.6 1.6.6 3.2.4 4.4-.6z" fill="#ffcf5a"/></svg>`;
const bar = h('i');
const label = h('div', { class: 'label' }, 'Opening the tavern door');
const loading = h(
  'div',
  { class: 'loading' },
  h('div', { class: 'inner', html: crest }, h('h1', {}, 'The Hooded Hand'), h('div', { class: 'sub' }, 'A tavern card game'), h('div', { class: 'bar' }, bar), label)
);
document.body.append(loading);

(async () => {
  try {
    await app.init((k, l) => {
      bar.style.width = Math.round(k * 100) + '%';
      label.textContent = l;
    });
  } catch (e) {
    label.textContent = 'Your browser could not light the candles (WebGL failed). Try Chrome with hardware acceleration on.';
    console.error(e);
    return;
  }
  refreshChallenges();
  await applyCosmetics(app);
  const layer = h('div', { class: 'layer' });
  uiRoot.append(layer);
  const hud = new Hud(uiRoot);
  hud.onToggleSound = (m) => audio.setMuted(m);
  const picker = new Picker(app.gfx.camera, app.gfx.renderer.domElement);
  app.onUpdate(() => picker.update());

  const nav: Nav = {
    app,
    hud,
    picker,
    layer,
    toMenu(from = 'title') {
      app.setScreen(new MainMenu(nav, from));
    },
    toPlay() {
      app.setScreen(new PlayMenu(nav));
    },
    toShop() {
      app.setScreen(new ShopScreen(nav));
    },
    toInventory() {
      app.setScreen(new InventoryScreen(nav));
    },
    openChallenges() {
      openChallenges(nav);
    },
    startMatch(mode: GameMode | MatchOptions) {
      void (async () => {
        picker.enabled = false;
        audio.play('whoosh');
        await tweens.to(0.7, (k) => (app.gfx.grade.u('uFade').value = k), { ease: ease.inCubic });
        app.setScreen(null);
        app.setScreen(new MatchScreen(nav, mode));
        picker.enabled = true;
      })();
    },
  };

  const params = new URLSearchParams(location.search);
  const quick = params.get('start') as GameMode | null;
  const rivals = Number(params.get('rivals')) || 1;
  loading.classList.add('gone');
  setTimeout(() => loading.remove(), 1400);
  if (quick) {
    app.gfx.grade.u('uFade').value = 1;
    app.setScreen(new MatchScreen(nav, { mode: quick, rivals }));
  } else {
    app.setScreen(new TitleScreen(nav));
    await tweens.to(1.6, (k) => (app.gfx.grade.u('uFade').value = 1 - k), { ease: ease.outCubic });
  }
  const st = params.get('station');
  if (st === 'play') nav.toPlay();
  if (st === 'shop') nav.toShop();
  if (st === 'inventory') nav.toInventory();
  document.body.dataset.ready = '1';
  void profile;
})();
