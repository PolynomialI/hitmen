import type { Screen } from '../app';
import { audio } from '../audio/audio';
import { tweens } from '../core/tween';
import { impactIconSVG, charmIconSVG, seatIconSVG, sleeveCanvas, svgCanvas, bannerSVG, swatchURL, svgURL } from '../cosmetics/art';
import { applyCosmetics, mutOf, updateDisplay, bannerTexture } from '../cosmetics/apply';
import { CATEGORY, dailyWares, featured, ITEMS, item, MUTATIONS, RARITY, rollMutation, rubyWares, type Category, type Item, type Mutation } from '../cosmetics/catalog';
import { h } from '../ui/dom';
import { toast } from '../ui/hud';
import { profile, saveProfile } from '../ui/profile';
import { claimChallenge, dayKey, defOf, fmtCountdown, levelProgress, msUntilTomorrow, refreshChallenges, weekKey } from '../ui/progression';
import type { Nav } from './menus';

// ====================================================================== thumbnails

const thumbCache = new Map<string, Promise<string>>();

/** Bounds of the visible pixels of a canvas (alpha above a faint glow), or null if it is empty. */
function visibleBounds(c: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h } = c;
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Crop a canvas to what is drawn on it (plus a hair of margin), so the art fills the tile it sits in. */
function trimmedURL(c: HTMLCanvasElement): string {
  const b = visibleBounds(c);
  if (!b) return c.toDataURL('image/webp', 0.9);
  const m = Math.round(Math.max(b.w, b.h) * 0.02);
  const x = Math.max(0, b.x - m);
  const y = Math.max(0, b.y - m);
  const w = Math.min(c.width - x, b.w + 2 * m);
  const hh = Math.min(c.height - y, b.h + 2 * m);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = hh;
  out.getContext('2d')!.drawImage(c, x, y, w, hh, 0, 0, w, hh);
  return out.toDataURL('image/webp', 0.9);
}

/** An icon SVG (160×160 viewBox) with its viewBox cropped to the drawing: still vector, but without the empty border. */
async function trimmedSVG(svg: string): Promise<string> {
  const b = visibleBounds(await svgCanvas(svg, 160, 160));
  if (!b) return svgURL(svg);
  const m = Math.max(b.w, b.h) * 0.03;
  const vb = `${b.x - m} ${b.y - m} ${b.w + 2 * m} ${b.h + 2 * m}`;
  return svgURL(svg.replace('viewBox="0 0 160 160"', `viewBox="${vb}" width="${Math.round((b.w + 2 * m) * 2)}" height="${Math.round((b.h + 2 * m) * 2)}"`));
}

export function thumb(it: Item, mut: Mutation = 'basic'): Promise<string> {
  const key = it.id + ':' + mut;
  let p = thumbCache.get(key);
  if (!p) {
    p = (async () => {
      switch (it.cat) {
        case 'sleeve':
          return trimmedURL(await sleeveCanvas(it.style, mut, 240));
        case 'playmat':
          return swatchURL(it.style, mut);
        case 'impact':
          return trimmedSVG(impactIconSVG(it.style, mut));
        case 'charm':
          return trimmedSVG(charmIconSVG(it.style.model));
        case 'seat':
          return trimmedSVG(seatIconSVG(it.style.model));
        case 'banner':
          return trimmedURL(await svgCanvas(bannerSVG(it.style, mut), 160, 320));
      }
    })();
    thumbCache.set(key, p);
  }
  return p;
}

function img(it: Item, mut: Mutation = 'basic', cls = ''): HTMLImageElement {
  const el = h('img', { class: 'thumb ' + cls, alt: it.name, draggable: 'false' }) as HTMLImageElement;
  void thumb(it, mut).then((u) => (el.src = u));
  return el;
}

function owns(id: string): boolean {
  return !!profile.owned[id]?.length;
}

function priceTag(it: Item): HTMLElement {
  if (it.rubies) return h('span', { class: 'price ruby' }, h('i', { class: 'ruby-ico' }), String(it.rubies));
  return h('span', { class: 'price' }, h('i', { class: 'coin-ico' }), it.price.toLocaleString());
}

function wallet(): HTMLElement {
  const lv = levelProgress();
  return h(
    'div',
    { class: 'wallet' },
    h('span', {}, h('i', { class: 'crown-ico' }), `Lv ${lv.level}`),
    h('span', {}, h('i', { class: 'coin-ico' }), profile.coins.toLocaleString()),
    h('span', {}, h('i', { class: 'ruby-ico' }), String(profile.rubies)),
    h('span', {}, h('i', { class: 'token-ico' }), String(profile.tokens))
  );
}

function backBtn(fn: () => void): HTMLElement {
  const b = h('button', { class: 'back-btn' }, 'Back');
  b.addEventListener('click', () => {
    audio.play('click');
    fn();
  });
  return b;
}

// ====================================================================== shop

export class ShopScreen implements Screen {
  private ui: HTMLElement;
  private body: HTMLElement;
  private tab: 'wares' | 'rubies' | 'fortune' = 'wares';
  private timerEl: HTMLElement | null = null;
  private walletEl: HTMLElement;
  private modal: HTMLElement | null = null;

  constructor(private nav: Nav) {
    const { app } = nav;
    void app.rig.glide(app.tavern.stations.shop, 1.9, 0.2);
    // The panel shows your purse itself; the corner chip would only overlap it.
    nav.hud.showProfile(false);
    this.walletEl = wallet();
    this.body = h('div', { class: 'shop-body' });
    const tabs = h('div', { class: 'tabs' });
    const mk = (id: typeof this.tab, label: string) => {
      const b = h('button', { class: 'tab' + (id === this.tab ? ' sel' : '') }, label);
      b.addEventListener('click', () => {
        audio.play('click');
        this.tab = id;
        tabs.querySelectorAll('.tab').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        this.render();
      });
      return b;
    };
    tabs.append(mk('wares', 'Wares'), mk('rubies', 'Ruby Wares'), mk('fortune', "Fate's Wheel"));
    this.ui = h(
      'div',
      { class: 'layer' },
      backBtn(() => nav.toMenu('play')),
      h('div', { class: 'panel shop' }, h('div', { class: 'shop-head' }, h('div', {}, h('h2', {}, "The Peddler's Cart")), this.walletEl), tabs, this.body)
    );
    nav.layer.append(this.ui);
    this.render();
  }

  private refreshWallet(): void {
    const w = wallet();
    this.walletEl.replaceWith(w);
    this.walletEl = w;
  }

  private card(it: Item): HTMLElement {
    const owned = owns(it.id);
    const el = h(
      'button',
      { class: `ware r-${it.rarity}${owned ? ' owned' : ''}` },
      h('div', { class: 'art' }, img(it)),
      h('b', {}, it.name),
      owned ? h('span', { class: 'price owned' }, 'Owned') : priceTag(it)
    );
    el.addEventListener('pointerenter', () => audio.play('hover', { vol: 0.5 }));
    el.addEventListener('click', () => {
      audio.play('click');
      this.detail(it);
    });
    return el;
  }

  private render(): void {
    this.body.replaceChildren();
    this.timerEl = null;
    if (this.tab === 'wares') {
      const f = featured(weekKey());
      const fItems = f.items.map((id) => item(id)!).filter(Boolean);
      const allOwned = fItems.every((i) => owns(i.id));
      const full = fItems.reduce((s, i) => s + i.price, 0);
      const buy = h('button', { class: 'buy' + (allOwned ? ' done' : '') }, allOwned ? 'Owned' : 'Buy the set');
      buy.addEventListener('click', () => {
        if (allOwned) return;
        if (profile.coins < f.price) return this.poor();
        profile.coins -= f.price;
        for (const i of fItems) if (!owns(i.id)) profile.owned[i.id] = ['basic'];
        saveProfile();
        audio.play('coins');
        toast(this.nav.layer, `${f.name} is yours`, 'Equip it in your chest.');
        this.refreshWallet();
        this.render();
      });
      this.body.append(
        h('h3', { class: 'sect' }, 'Featured this week'),
        h(
          'div',
          { class: 'featured' },
          h('div', { class: 'f-art' }, ...fItems.map((i) => img(i, 'basic', 'f'))),
          h('div', { class: 'f-info' }, h('b', {}, f.name), h('p', {}, fItems.map((i) => i.name).join(' · ')), h('div', { class: 'f-price' }, h('s', {}, full.toLocaleString()), h('span', { class: 'price' }, h('i', { class: 'coin-ico' }), f.price.toLocaleString())), buy)
        )
      );
      this.timerEl = h('span', { class: 'timer' });
      this.body.append(h('h3', { class: 'sect' }, 'Daily wares ', this.timerEl));
      const grid = h('div', { class: 'wares' });
      for (const it of dailyWares(dayKey())) grid.append(this.card(it));
      this.body.append(grid);
    } else if (this.tab === 'rubies') {
      this.body.append(h('h3', { class: 'sect' }, 'Ruby wares — always in stock'));
      const grid = h('div', { class: 'wares' });
      for (const it of rubyWares()) grid.append(this.card(it));
      this.body.append(grid);
    } else this.fortune();
  }

  private poor(): void {
    audio.play('lose', { vol: 0.5 });
    toast(this.nav.layer, 'Not enough coin', 'Win a few hands at the table first.');
  }

  private detail(it: Item): void {
    this.modal?.remove();
    const owned = owns(it.id);
    const buy = h('button', { class: 'buy' + (owned ? ' done' : '') }, owned ? 'Owned' : it.rubies ? `Buy for ${it.rubies} rubies` : `Buy for ${it.price.toLocaleString()} coins`);
    buy.addEventListener('click', () => {
      if (owns(it.id)) return;
      if (it.rubies ? profile.rubies < it.rubies : profile.coins < it.price) return this.poor();
      if (it.rubies) profile.rubies -= it.rubies;
      else profile.coins -= it.price;
      profile.owned[it.id] = ['basic'];
      saveProfile();
      audio.play('coins');
      audio.play('chime', { at: 0.2 });
      buy.textContent = 'Owned';
      buy.className = 'buy done';
      equip.style.display = '';
      this.refreshWallet();
      this.render();
    });
    const equip = h('button', { class: 'buy', style: owned ? '' : 'display:none' }, profile.equipped[catKey(it.cat)] === it.id ? 'Equipped' : 'Equip');
    equip.addEventListener('click', () => {
      profile.equipped[catKey(it.cat)] = it.id;
      saveProfile();
      void applyCosmetics(this.nav.app);
      audio.play('click');
      equip.textContent = 'Equipped';
    });
    const close = h('button', { class: 'btn-text' }, 'Close');
    close.addEventListener('click', () => this.modal?.remove());
    this.modal = h(
      'div',
      { class: 'scrim' },
      h(
        'div',
        { class: `panel detail r-${it.rarity}` },
        h('div', { class: 'd-art' }, img(it, 'basic', 'big')),
        h(
          'div',
          { class: 'd-info' },
          h('span', { class: 'rarity', style: `color:${RARITY[it.rarity].color}` }, `${RARITY[it.rarity].name} ${CATEGORY[it.cat].name}`),
          h('h2', {}, it.name),
          h('p', { class: 'lede' }, it.blurb),
          h('div', { class: 'muts' }, ...(Object.keys(MUTATIONS) as Mutation[]).map((m) => h('span', { style: `color:${MUTATIONS[m].color}` }, `${MUTATIONS[m].name} ${Math.round(MUTATIONS[m].odds * 100)}%`))),
          h('div', { class: 'row' }, close, h('div', {}, equip, buy))
        )
      )
    );
    this.modal.addEventListener('click', (e) => e.target === this.modal && this.modal?.remove());
    this.nav.layer.append(this.modal);
  }

  private fortune(): void {
    const reel = h('div', { class: 'reel' });
    const strip = h('div', { class: 'strip' });
    reel.append(strip, h('div', { class: 'marker' }));
    const result = h('div', { class: 'fortune-result' });
    const spinT = h('button', { class: 'buy' }, `Spin · 1 token (${profile.tokens})`);
    const spinR = h('button', { class: 'buy ruby' }, 'Spin · 15 rubies');
    let spinning = false;
    const pool = ITEMS.filter((i) => !i.hidden);
    const weight: Record<string, number> = { common: 30, uncommon: 26, rare: 20, epic: 12, legendary: 5, contraband: 2 };
    const roll = (): Item => {
      const total = pool.reduce((s, i) => s + weight[i.rarity], 0);
      let r = Math.random() * total;
      for (const i of pool) if ((r -= weight[i.rarity]) <= 0) return i;
      return pool[0];
    };
    const spin = async (cost: 'token' | 'ruby') => {
      if (spinning) return;
      if (cost === 'token' && profile.tokens < 1) return toast(this.nav.layer, 'No tokens', 'Tokens come from levels and weekly challenges.');
      if (cost === 'ruby' && profile.rubies < 15) return toast(this.nav.layer, 'Not enough rubies');
      spinning = true;
      if (cost === 'token') profile.tokens--;
      else profile.rubies -= 15;
      const win = roll();
      const mut = rollMutation();
      strip.replaceChildren();
      const N = 44;
      const items: Item[] = [];
      for (let i = 0; i < N; i++) items.push(i === N - 6 ? win : roll());
      for (const it of items) strip.append(h('div', { class: `cell r-${it.rarity}` }, img(it)));
      result.replaceChildren();
      const cellW = 116;
      const target = (N - 6) * cellW - reel.clientWidth / 2 + cellW / 2 + (Math.random() - 0.5) * 50;
      strip.style.transition = 'none';
      strip.style.transform = 'translateX(0)';
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      strip.style.transition = 'transform 5.2s cubic-bezier(0.12, 0.8, 0.12, 1)';
      strip.style.transform = `translateX(${-target}px)`;
      const ticks = setInterval(() => audio.play('tick', { vol: 0.6 }), 90);
      setTimeout(() => clearInterval(ticks), 3800);
      await tweens.wait(5.3);
      const had = profile.owned[win.id] ?? [];
      let msg: string;
      if (had.includes(mut)) {
        const refund = Math.round((win.rubies ? win.rubies * 60 : win.price) * 0.4);
        profile.coins += refund;
        msg = `Already yours. The peddler pays you ${refund} coins for it.`;
      } else {
        profile.owned[win.id] = [...had, mut];
        msg = had.length ? `A new ${MUTATIONS[mut].name} finish for your collection!` : 'Added to your chest.';
      }
      saveProfile();
      audio.play(mut === 'basic' ? 'coins' : 'angel', { vol: mut === 'basic' ? 1 : 0.6 });
      result.append(
        h(
          'div',
          { class: `won r-${win.rarity} m-${mut}` },
          img(win, mut, 'big'),
          h('div', {}, h('b', {}, win.name), h('em', { style: `color:${MUTATIONS[mut].color}` }, MUTATIONS[mut].name), h('p', {}, msg))
        )
      );
      spinT.textContent = `Spin · 1 token (${profile.tokens})`;
      this.refreshWallet();
      spinning = false;
    };
    spinT.addEventListener('click', () => void spin('token'));
    spinR.addEventListener('click', () => void spin('ruby'));
    for (let i = 0; i < 12; i++) {
      const it = pool[(i * 7) % pool.length];
      strip.append(h('div', { class: `cell r-${it.rarity}` }, img(it)));
    }
    this.body.append(
      h('h3', { class: 'sect' }, "Fate's Wheel"),
      reel,
      h('div', { class: 'row center' }, spinT, spinR),
      result
    );
  }

  update(): void {
    if (this.timerEl) this.timerEl.textContent = `· refreshes in ${fmtCountdown(msUntilTomorrow())}`;
  }

  dispose(): void {
    this.modal?.remove();
    this.ui.remove();
  }
}

function catKey(c: Category): keyof typeof profile.equipped {
  return c === 'playmat' ? 'playmat' : c;
}

// ====================================================================== inventory

export class InventoryScreen implements Screen {
  private ui: HTMLElement;
  private body: HTMLElement;
  private cat: Category | null = null;
  private previewTimer: number | null = null;

  constructor(private nav: Nav) {
    const { app } = nav;
    void app.rig.glide(app.tavern.stations.inventory, 1.9, 0.2);
    // The panel shows your purse itself; the corner chip would only overlap it.
    nav.hud.showProfile(false);
    this.body = h('div', { class: 'inv-body' });
    this.ui = h('div', { class: 'layer' }, backBtn(() => (this.cat ? this.open(null) : nav.toMenu('play'))), h('div', { class: 'panel inventory' }, this.body));
    nav.layer.append(this.ui);
    this.open(null);
  }

  private open(cat: Category | null): void {
    this.cat = cat;
    this.body.replaceChildren();
    if (!cat) {
      this.body.append(h('div', { class: 'inv-head' }, h('h2', {}, 'Your Chest'), wallet()));
      const board = h('div', { class: 'cork' });
      const cats: Category[] = ['sleeve', 'charm', 'seat', 'impact', 'banner', 'playmat'];
      cats.forEach((c, i) => {
        const it = item(profile.equipped[catKey(c)])!;
        const tile = h('button', { class: 'pin', style: `--r:${((i * 37) % 9) - 4}deg` }, h('span', { class: 'tack' }), img(it, mutOf(it.id)), h('b', {}, CATEGORY[c].plural));
        tile.addEventListener('pointerenter', () => audio.play('hover', { vol: 0.5 }));
        tile.addEventListener('click', () => {
          audio.play('paper');
          this.open(c);
        });
        board.append(tile);
      });
      this.body.append(board);
      return;
    }
    this.body.append(h('div', { class: 'inv-head' }, h('h2', {}, CATEGORY[cat].plural), wallet()));
    const grid = h('div', { class: 'wares inv' });
    const all = ITEMS.filter((x) => x.cat === cat);
    for (const it of all) {
      const owned = profile.owned[it.id] ?? [];
      if (!owned.length) {
        grid.append(h('div', { class: `ware locked r-${it.rarity}` }, h('div', { class: 'art' }, img(it)), h('b', {}, it.name), priceTag(it)));
        continue;
      }
      for (const mut of owned as Mutation[]) {
        const equipped = profile.equipped[catKey(cat)] === it.id && mutOf(it.id) === mut;
        const el = h(
          'button',
          { class: `ware r-${it.rarity} m-${mut}${equipped ? ' equipped' : ''}` },
          h('div', { class: 'art' }, img(it, mut)),
          h('b', {}, it.name),
          h('span', { class: 'price owned' }, equipped ? 'Equipped' : 'Equip')
        );
        el.addEventListener('pointerenter', () => {
          audio.play('hover', { vol: 0.4 });
          this.preview(it, mut);
        });
        el.addEventListener('pointerleave', () => this.preview(null));
        el.addEventListener('click', () => {
          audio.play('click');
          profile.equipped[catKey(cat)] = it.id;
          profile.equippedMut[it.id] = mut;
          saveProfile();
          void applyCosmetics(this.nav.app);
          this.open(cat);
        });
        grid.append(el);
      }
    }
    const reforge = h('button', { class: 'buy' }, `Reforge equipped finish · 1 token (${profile.tokens})`);
    reforge.addEventListener('click', () => {
      const id = profile.equipped[catKey(cat)];
      const it = item(id);
      if (!it || it.hidden) return toast(this.nav.layer, 'The default cannot be reforged');
      if (profile.tokens < 1) return toast(this.nav.layer, 'No tokens', 'Tokens come from levels and weekly challenges.');
      profile.tokens--;
      const m = rollMutation();
      const had = profile.owned[id] ?? [];
      if (!had.includes(m)) profile.owned[id] = [...had, m];
      profile.equippedMut[id] = m;
      saveProfile();
      audio.play(m === 'basic' ? 'coins' : 'angel', { vol: 0.6 });
      toast(this.nav.layer, `${MUTATIONS[m].name}!`, `${it.name} gleams anew.`);
      void applyCosmetics(this.nav.app);
      this.open(cat);
    });
    this.body.append(grid, h('div', { class: 'row' }, h('span'), reforge));
  }

  /** Temporarily dress the display table in an item while hovering it. */
  private preview(it: Item | null, mut: Mutation = 'basic'): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(async () => {
      const app = this.nav.app;
      const saved = { ...profile.equipped };
      const savedMut = { ...profile.equippedMut };
      if (it) {
        profile.equipped[catKey(it.cat)] = it.id;
        profile.equippedMut[it.id] = mut;
      }
      if (!it || it.cat === 'sleeve' || it.cat === 'banner') await applyCosmetics(app);
      else updateDisplay(app);
      if (it?.cat === 'banner') updateDisplay(app, await bannerTexture(it.id));
      Object.assign(profile.equipped, saved);
      profile.equippedMut = savedMut;
    }, 120);
  }

  dispose(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    void applyCosmetics(this.nav.app);
    this.ui.remove();
  }
}

// ====================================================================== challenges board

export function openChallenges(nav: Nav): void {
  refreshChallenges();
  const lv = levelProgress();
  const scrim = h('div', { class: 'scrim' });
  const panel = h('div', { class: 'panel challenges-board' });
  const timer = h('span', { class: 'timer' });
  const render = () => {
    panel.replaceChildren();
    panel.append(
      h('div', { class: 'inv-head' }, h('h2', {}, 'Wanted: Brave Souls'), wallet()),
      h('div', { class: 'xpbar' }, h('span', {}, `Level ${lv.level}`), h('div', { class: 'bar' }, h('i', { style: `width:${(lv.into / lv.need) * 100}%` })), h('em', {}, `${lv.into}/${lv.need} XP`))
    );
    const list = (title: string, items: typeof profile.daily.items, extra?: HTMLElement) => {
      panel.append(h('h4', {}, title, extra ?? ''));
      for (const c of items) {
        const d = defOf(c.id);
        if (!d) continue;
        const pct = Math.min(1, c.progress / d.goal);
        const claim = h('button', { class: 'claim' + (c.claimed ? ' done' : pct >= 1 ? ' ready' : '') }, c.claimed ? 'Claimed' : pct >= 1 ? 'Claim' : `${c.progress}/${d.goal}`);
        claim.addEventListener('click', () => {
          if (claimChallenge(c.id)) {
            audio.play('coins');
            toast(nav.layer, `+${d.reward.coins} coins`, d.reward.rubies ? `and ${d.reward.rubies} rubies` : undefined);
            render();
          }
        });
        panel.append(
          h(
            'div',
            { class: 'chal' },
            h('div', { class: 'ct' }, h('span', {}, d.text), h('small', {}, `${d.reward.coins} coins${d.reward.rubies ? ` · ${d.reward.rubies} ruby` : ''}${d.reward.tokens ? ` · ${d.reward.tokens} token` : ''}`)),
            h('div', { class: 'cbar' }, h('i', { style: `width:${pct * 100}%` })),
            claim
          )
        );
      }
    };
    list('Daily ', profile.daily.items, timer);
    list('Weekly', profile.weekly.items);
    const close = h('button', { class: 'btn-text' }, 'Close');
    close.addEventListener('click', () => {
      audio.play('click');
      scrim.remove();
    });
    panel.append(h('div', { class: 'row' }, h('span'), close));
  };
  render();
  const iv = setInterval(() => {
    if (!scrim.isConnected) return clearInterval(iv);
    timer.textContent = `· resets in ${fmtCountdown(msUntilTomorrow())}`;
  }, 500);
  scrim.append(panel);
  scrim.addEventListener('click', (e) => e.target === scrim && scrim.remove());
  nav.layer.append(scrim);
  audio.play('paper');
}
