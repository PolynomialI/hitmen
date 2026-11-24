import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import { CARD_DEFS, CARD_ORDER } from '../../shared/cards';
import type { GameMode } from '../../shared/types';
import type { App, Screen } from '../app';
import { audio } from '../audio/audio';
import { Picker } from '../core/picker';
import { damp, ease, tweens } from '../core/tween';
import { paint } from '../gfx/textures';
import { h, icon } from '../ui/dom';
import { toast, type Hud } from '../ui/hud';
import { profile, saveProfile } from '../ui/profile';
import { rankOf } from '../ui/progression';
import { RIVALS } from '../../shared/match';
import { FONT3D } from '../world/fonts3d';
import { makeText } from '../world/tavern';

export interface Nav {
  app: App;
  hud: Hud;
  picker: Picker;
  layer: HTMLElement;
  toMenu(from?: 'title' | 'play'): void;
  toPlay(): void;
  toShop(): void;
  toInventory(): void;
  openChallenges(): void;
  startMatch(mode: GameMode | import('../match/matchScreen').MatchOptions): void;
}

// ====================================================================== title

export class TitleScreen implements Screen {
  private el: HTMLElement;
  constructor(private nav: Nav) {
    const { app } = nav;
    app.rig.snap(app.tavern.stations.intro);
    app.rig.lookScale = 0.4;
    this.el = h(
      'div',
      { class: 'title-card' },
      h('div', { class: 'kicker' }, 'A tavern card game'),
      h('h1', {}, 'The Hooded Hand'),
      h('div', { class: 'tag' }, 'Draw a card. Pray it is not him.'),
      h('div', { class: 'enter' }, 'Click to enter')
    );
    this.el.addEventListener('click', () => this.enter(), { once: true });
    nav.layer.append(this.el);
  }

  private enter(): void {
    audio.unlock();
    audio.setMuted(profile.muted);
    audio.play('click');
    audio.play('whoosh', { at: 0.1 });
    audio.startMusic();
    this.el.classList.add('gone');
    setTimeout(() => this.el.remove(), 1200);
    this.nav.toMenu('title');
  }

  dispose(): void {
    this.el.remove();
  }
}

// ====================================================================== main menu

interface MenuItem {
  key: 'play' | 'shop' | 'inventory' | 'challenges';
  label: string;
  text: Text;
  base: THREE.Vector3;
  glow: THREE.Mesh;
  hover: number;
  target: number;
  color: THREE.Color;
}

export class MainMenu implements Screen {
  private items: MenuItem[] = [];
  private group = new THREE.Group();
  private unpick: Array<() => void> = [];
  private alive = true;

  constructor(private nav: Nav, from: 'title' | 'play' = 'title') {
    const { app } = nav;
    const tv = app.tavern;
    app.rig.lookScale = 1;
    const st = tv.stations.menu;
    void app.rig.glide(st, from === 'title' ? 3.2 : 1.8, from === 'title' ? 0.4 : 0.25);
    nav.hud.showProfile(true);
    nav.hud.showLeave(false);
    const defs: Array<[MenuItem['key'], string, THREE.Vector3, THREE.Object3D, number]> = [
      ['shop', 'Shop', new THREE.Vector3(-3.44, 1.47, -3.28), tv.menuProps.shop, 0.15],
      ['play', 'Play', new THREE.Vector3(-2.6, 1.42, -3.22), tv.menuProps.play, 0.19],
      ['inventory', 'Inventory', new THREE.Vector3(-1.84, 1.66, -3.36), tv.menuProps.inventory, 0.13],
      ['challenges', 'Challenges', new THREE.Vector3(-3.84, 2.22, -5.5), tv.menuProps.challenges, 0.14],
    ];
    for (const [key, label, pos, prop, size] of defs) {
      const text = makeText(label, { size, color: '#f3e6c4', glow: 1.05, font: FONT3D.gothicBlack, letterSpacing: 0.02, outline: 0.006, outlineColor: '#1a0a04' });
      text.position.copy(pos);
      text.renderOrder = 20;
      (text.material as THREE.MeshBasicMaterial).depthTest = false;
      this.group.add(text);
      // Hover glow behind the prop.
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.6),
        new THREE.MeshBasicMaterial({ map: tv.glowTex, color: new THREE.Color(1.4, 0.35, 0.18), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      const pp = new THREE.Vector3();
      prop.getWorldPosition(pp);
      glow.position.copy(pp).add(new THREE.Vector3(0, 0.1, -0.15));
      this.group.add(glow);
      // Pick proxy around prop + label.
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(size * 4.6, size * 3.2, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.copy(pos).add(new THREE.Vector3(0, -size * 0.9, 0));
      this.group.add(proxy);
      const item: MenuItem = { key, label, text, base: pos.clone(), glow, hover: 0, target: 0, color: new THREE.Color() };
      this.items.push(item);
      this.unpick.push(
        nav.picker.add({
          object: proxy,
          onHover: (on) => {
            item.target = on ? 1 : 0;
            if (on) audio.play('hover');
          },
          onClick: () => this.choose(item),
        })
      );
      text.fillOpacity = 0;
    }
    app.gfx.scene.add(this.group);
    // Fade the words in, one after another.
    this.items.forEach((it, i) => void tweens.to(0.9, (k) => (it.text.fillOpacity = k), { delay: (from === 'title' ? 2.0 : 0.9) + i * 0.12, ease: ease.outCubic }));
  }

  private choose(it: MenuItem): void {
    audio.play('click');
    if (it.key === 'play') return this.nav.toPlay();
    if (it.key === 'shop') return this.nav.toShop();
    if (it.key === 'inventory') return this.nav.toInventory();
    this.nav.openChallenges();
  }

  update(t: number, dt: number): void {
    if (!this.alive) return;
    const cam = this.nav.app.gfx.camera;
    for (const it of this.items) {
      it.hover = damp(it.hover, it.target, 10, dt);
      const s = 1 + it.hover * 0.12;
      it.text.scale.setScalar(s);
      it.text.position.y = it.base.y + Math.sin(t * 1.4 + it.base.x * 3) * 0.006 + it.hover * 0.015;
      it.text.quaternion.copy(cam.quaternion);
      it.color.setRGB(0.95 + it.hover * 1.4, 0.9 - it.hover * 0.72, 0.77 - it.hover * 0.66);
      it.text.color = it.color;
      (it.glow.material as THREE.MeshBasicMaterial).opacity = it.hover * 0.85;
      it.glow.quaternion.copy(cam.quaternion);
    }
  }

  dispose(): void {
    this.alive = false;
    for (const u of this.unpick) u();
    const g = this.group;
    void tweens.to(0.4, (k) => this.items.forEach((it) => (it.text.fillOpacity = 1 - k))).then(() => {
      this.nav.app.gfx.scene.remove(g);
      this.items.forEach((it) => it.text.dispose());
    });
  }
}

// ====================================================================== play menu

interface Ticket {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  rot: number;
  hover: number;
  target: number;
  locked: boolean;
  mode?: import('../match/matchScreen').MatchOptions;
}

function ticketTexture(title: string, sub: string, seats: string, color: string, locked: boolean): THREE.Texture {
  return paint(640, 300, (ctx, w, hh) => {
    // Parchment ticket with notched edges.
    ctx.fillStyle = '#e8d5a8';
    ctx.beginPath();
    const r = 18;
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.arc(w, 0, r, Math.PI, Math.PI / 2, true);
    ctx.lineTo(w, hh - r);
    ctx.arc(w, hh, r, -Math.PI / 2, Math.PI, true);
    ctx.lineTo(r, hh);
    ctx.arc(0, hh, r, 0, -Math.PI / 2, true);
    ctx.lineTo(0, r);
    ctx.arc(0, 0, r, Math.PI / 2, 0, true);
    ctx.fill();
    ctx.save();
    ctx.clip();
    const g = ctx.createRadialGradient(w / 2, hh / 2, 40, w / 2, hh / 2, w * 0.7);
    g.addColorStop(0, 'rgba(255,250,230,0.5)');
    g.addColorStop(1, 'rgba(110,60,15,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hh);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(90,50,15,${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * w, Math.random() * hh, 2, 2);
    }
    // Colour band and perforation.
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 18, hh);
    ctx.fillRect(w - 18, 0, 18, hh);
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(60,30,10,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(110, 20);
    ctx.lineTo(110, hh - 20);
    ctx.moveTo(w - 110, 20);
    ctx.lineTo(w - 110, hh - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(60,30,10,0.6)';
    ctx.strokeRect(28, 16, w - 56, hh - 32);
    ctx.restore();
    // Seats, vertical.
    ctx.fillStyle = 'rgba(60,30,10,0.75)';
    ctx.font = '600 34px "Grenze Gotisch"';
    ctx.textAlign = 'center';
    for (const x of [68, w - 68]) {
      ctx.save();
      ctx.translate(x, hh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(seats, 0, 12);
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.font = '800 76px "Grenze Gotisch"';
    ctx.fillText(title, w / 2, 140);
    ctx.fillStyle = 'rgba(50,25,8,0.85)';
    ctx.font = 'italic 30px "Alegreya"';
    ctx.fillText(sub, w / 2, 196);
    ctx.font = '22px "IM Fell English SC"';
    ctx.fillStyle = 'rgba(50,25,8,0.6)';
    ctx.fillText(locked ? 'not yet open' : 'click to sit down', locked ? w / 2 - 60 : w / 2, 246);
    if (locked) {
      ctx.save();
      ctx.translate(w - 170, hh - 70);
      ctx.rotate(-0.16);
      ctx.strokeStyle = 'rgba(140,20,12,0.85)';
      ctx.lineWidth = 5;
      ctx.strokeRect(-70, -30, 140, 54);
      ctx.fillStyle = 'rgba(140,20,12,0.85)';
      ctx.font = '800 40px "Grenze Gotisch"';
      ctx.fillText('SOON', 0, 10);
      ctx.restore();
    }
  });
}

export class PlayMenu implements Screen {
  private tickets: Ticket[] = [];
  private group = new THREE.Group();
  private unpick: Array<() => void> = [];
  private ui: HTMLElement;
  private panel: HTMLElement | null = null;

  constructor(private nav: Nav) {
    const { app } = nav;
    const tv = app.tavern;
    void app.rig.glide(tv.stations.play, 1.9, 0.15);
    nav.hud.showProfile(true);
    const board = tv.board;
    type Opt = import('../match/matchScreen').MatchOptions;
    const defs: Array<[string, string, string, string, boolean, Opt | undefined, number, number, number]> = [
      ['Original', 'Four souls, one Hooded Hand', '4', '#9b2a20', false, { mode: 'original', rivals: 3 }, -0.86, 0.47, -0.05],
      ['Duel', 'You and one stranger', '1v1', '#7a2a6a', false, { mode: 'original', rivals: 1 }, 0.0, 0.5, 0.03],
      ['Teams', 'Two against two', '2v2', '#2f5f9e', false, { mode: 'teams', rivals: 3 }, 0.86, 0.46, -0.02],
      ['Winter Feast', 'Festive cards, cold hearts', '4', '#2f8a3a', false, { mode: 'winter', rivals: 3 }, -0.86, -0.36, 0.04],
      ['Ranked', 'Duel for renown', '1v1', '#5e1622', false, { mode: 'ranked' }, 0.0, -0.4, -0.04],
      ['Tutorial', 'Learn the ways of the Hand', '1v1', '#9a6a10', false, { mode: 'tutorial' }, 0.86, -0.38, 0.05],
    ];
    for (const [title, sub, seats, color, locked, mode, x, y, rz] of defs) {
      const mat = new THREE.MeshStandardMaterial({ map: ticketTexture(title, sub, seats, color, locked), roughness: 0.85, transparent: true, alphaTest: 0.5 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.395), mat);
      mesh.position.set(x, y, 0.07);
      mesh.rotation.z = rz;
      mesh.castShadow = true;
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshStandardMaterial({ color: '#8a1c12', roughness: 0.4, metalness: 0.3 }));
      pin.position.set(0, 0.16, 0.02);
      mesh.add(pin);
      this.group.add(mesh);
      const t: Ticket = { mesh, base: mesh.position.clone(), rot: rz, hover: 0, target: 0, locked, mode: mode as never };
      this.tickets.push(t);
      this.unpick.push(
        nav.picker.add({
          object: mesh,
          onHover: (on) => {
            t.target = on ? 1 : 0;
            if (on) audio.play('hover');
          },
          onClick: () => {
            audio.play('paper');
            void tweens.to(0.25, (k) => (t.mesh.position.z = t.base.z + 0.12 + k * 0.1)).then(() => nav.startMatch(mode!));
          },
        })
      );
      mesh.scale.setScalar(0.001);
    }
    board.add(this.group);
    this.tickets.forEach((t, i) =>
      void tweens.to(0.6, (k) => t.mesh.scale.setScalar(Math.max(0.001, k)), { delay: 1.0 + i * 0.12, ease: ease.outBack }).then(() => i === 0 && audio.play('paper'))
    );

    // ---- HTML: bottom bar, back, name plate.
    const pb = (label: string, ico: keyof typeof import('../ui/dom').ICONS, color: string, fn: () => void, locked = false) => {
      const b = h('button', { class: 'pb' + (locked ? ' locked' : '') }, h('span', { class: 'disc', style: `background: radial-gradient(circle at 35% 30%, ${color}, #000 140%)` }, icon(ico)), label);
      b.addEventListener('click', () => {
        audio.play('click');
        fn();
      });
      b.addEventListener('pointerenter', () => audio.play('hover'));
      return b;
    };
    const nameInput = h('input', { value: profile.name, maxlength: '16', 'aria-label': 'Your name' }) as HTMLInputElement;
    nameInput.addEventListener('change', () => saveProfile({ name: nameInput.value.trim().slice(0, 16) || 'Stranger' }));
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    const back = h('button', { class: 'back-btn' }, 'Back');
    back.addEventListener('click', () => {
      audio.play('click');
      nav.toMenu('play');
    });
    this.ui = h(
      'div',
      { class: 'layer' },
      back,
      h('div', { class: 'name-plate' }, 'Your name', nameInput),
      h(
        'div',
        { class: 'play-bar' },
        pb('Create Table', 'plus', '#d84a3a', () => this.openModes()),
        pb('Private Table', 'key', '#5a5ad8', () => toast(nav.layer, 'Private tables — coming soon', 'Room codes arrive with online play.'), true),
        pb('Card Codex', 'book', '#3aa86a', () => this.openCodex()),
        pb('Watch a Table', 'eye', '#8a5ad8', () => nav.startMatch({ mode: 'original', rivals: 4, spectate: true })),
        pb('Leaderboard', 'crown', '#d8a83a', () => this.openLeaderboard())
      ),
      this.renownBadge()
    );
    nav.layer.append(this.ui);
  }

  private closePanel(): void {
    this.panel?.remove();
    this.panel = null;
  }

  private renownBadge(): HTMLElement {
    const rk = rankOf(profile.ranked.rating);
    const b = h(
      'button',
      { class: 'renown' },
      h('div', { class: 'medal', html: rankMedal(rk.index) }),
      h('b', {}, `${profile.ranked.rating} Renown`),
      h('span', {}, rk.name),
      h('em', {}, 'Go to Ranked')
    );
    b.addEventListener('click', () => {
      audio.play('paper');
      this.nav.startMatch({ mode: 'ranked' });
    });
    b.addEventListener('pointerenter', () => audio.play('hover'));
    return b;
  }

  private openModes(): void {
    this.closePanel();
    type Opt = import('../match/matchScreen').MatchOptions;
    let sel: GameMode = 'original';
    let seats = 4;
    const modes: Array<[string, string, string, GameMode]> = [
      ['Original', 'Everyone for themselves. Last soul standing wins the pot.', 'c-red', 'original'],
      ['Teams', 'Crimson against Azure. Teammates see each other\'s hands and share visions. Aegis and Warband join the deck.', 'c-blue', 'teams'],
      ['Scrimmage', 'A relaxed table: long turns, gentle rivals, half rewards.', 'c-wine', 'scrimmage'],
      ['Winter Feast', 'A festive table with Mistletoe and Yule Logs in the deck.', 'c-green', 'winter'],
      ['Ranked', 'A 1v1 duel against the ladder for Renown. Privateer and Sands of Time join the deck.', 'c-ink', 'ranked'],
      ['Tutorial', 'Learn to play, step by step.', 'c-gold', 'tutorial'],
    ];
    const els: HTMLElement[] = [];
    const list = h('div', { class: 'modes' });
    const sizeRow = h('div', { class: 'size-row' });
    const sizeBtns: HTMLButtonElement[] = [];
    const renderSizes = () => {
      sizeRow.replaceChildren();
      sizeBtns.length = 0;
      const opts = sel === 'teams' ? [4, 6] : sel === 'ranked' || sel === 'tutorial' ? [2] : [2, 3, 4, 5, 6];
      if (!opts.includes(seats)) seats = opts.includes(4) ? 4 : opts[0];
      sizeRow.append(h('span', {}, 'Seats at the table'));
      for (const n of opts) {
        const b = h('button', { class: 'size' + (n === seats ? ' sel' : '') }, sel === 'teams' ? `${n / 2}v${n / 2}` : String(n)) as HTMLButtonElement;
        b.addEventListener('click', () => {
          audio.play('tick');
          seats = n;
          sizeBtns.forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
        });
        sizeBtns.push(b);
        sizeRow.append(b);
      }
    };
    for (const [name, desc, cls, mode] of modes) {
      const b = h('button', { class: `mode ${cls}${mode === sel ? ' sel' : ''}` }, h('b', {}, name), h('span', {}, desc));
      b.addEventListener('pointerenter', () => audio.play('hover'));
      b.addEventListener('click', () => {
        audio.play('click');
        sel = mode;
        els.forEach((e) => e.classList.remove('sel'));
        b.classList.add('sel');
        renderSizes();
      });
      b.addEventListener('dblclick', () => this.nav.startMatch({ mode, rivals: seats - 1 } as Opt));
      els.push(b);
      list.append(b);
    }
    renderSizes();
    const close = h('button', { class: 'btn-text' }, 'Close');
    close.addEventListener('click', () => {
      audio.play('click');
      this.closePanel();
    });
    const choose = h('button', { class: 'btn-text' }, 'Sit down');
    choose.addEventListener('click', () => {
      audio.play('paper');
      this.closePanel();
      this.nav.startMatch({ mode: sel, rivals: seats - 1 });
    });
    this.panel = h('div', { class: 'scrim' }, h('div', { class: 'panel' }, h('h2', {}, 'Create a Table'), h('p', { class: 'lede' }, 'Choose how the night will go.'), list, sizeRow, h('div', { class: 'row' }, close, choose)));
    this.panel.addEventListener('click', (e) => e.target === this.panel && this.closePanel());
    this.nav.layer.append(this.panel);
  }

  private openLeaderboard(): void {
    this.closePanel();
    const rows = RIVALS.map((r) => ({ name: r.name, rating: profile.ranked.ladder[r.name] ?? 1000 + (hashName(r.name) % 600), me: false }));
    rows.push({ name: profile.name + ' (you)', rating: profile.ranked.rating, me: true });
    rows.sort((a, b) => b.rating - a.rating);
    const table = h('div', { class: 'ladder' });
    rows.forEach((r, i) => {
      const rk = rankOf(r.rating);
      table.append(h('div', { class: 'lrow' + (r.me ? ' me' : '') }, h('span', { class: 'pos' }, String(i + 1)), h('span', { class: 'medal small', html: rankMedal(rk.index) }), h('span', { class: 'nm' }, r.name), h('span', { class: 'rk' }, rk.name), h('b', {}, String(r.rating))));
    });
    const close = h('button', { class: 'btn-text' }, 'Close');
    close.addEventListener('click', () => {
      audio.play('click');
      this.closePanel();
    });
    const stats = profile.stats;
    this.panel = h(
      'div',
      { class: 'scrim' },
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'The Ladder'),
        h('p', { class: 'lede' }, `Ranked renown among the regulars. Your record: ${stats.wins} wins in ${stats.matches} matches, ${stats.rescues} narrow escapes.`),
        table,
        h('div', { class: 'row' }, h('span'), close)
      )
    );
    this.panel.addEventListener('click', (e) => e.target === this.panel && this.closePanel());
    this.nav.layer.append(this.panel);
  }

  private openCodex(): void {
    this.closePanel();
    const urls = this.nav.app.cards.urls;
    const grid = h('div', { class: 'codex-grid' });
    const setNames: Record<string, string> = { core: 'The Deck', teams: 'Teams only', ranked: 'Ranked only', winter: 'Winter Feast' };
    let lastSet = '';
    for (const t of CARD_ORDER) {
      const d = CARD_DEFS[t];
      if (d.set !== lastSet) {
        lastSet = d.set;
        grid.append(h('div', { class: 'codex-head' }, setNames[d.set]));
      }
      grid.append(
        h(
          'div',
          { class: 'codex-card' },
          h('img', { src: urls[t], alt: d.name, draggable: 'false' }),
          h('b', {}, d.name),
          h('p', {}, d.text),
          h('em', {}, (d.instant ? 'Spark: play at any time. ' : '') + (d.targeted ? 'Target: choose a mark. ' : '') + d.flavour)
        )
      );
    }
    const close = h('button', { class: 'btn-text' }, 'Close');
    close.addEventListener('click', () => {
      audio.play('click');
      this.closePanel();
    });
    this.panel = h(
      'div',
      { class: 'scrim' },
      h('div', { class: 'panel codex' }, h('h2', {}, 'The Codex'), h('p', { class: 'lede' }, 'Every card the dealer might put in your hand.'), grid, h('div', { class: 'row' }, h('span'), close))
    );
    this.panel.addEventListener('click', (e) => e.target === this.panel && this.closePanel());
    this.nav.layer.append(this.panel);
  }

  update(_t: number, dt: number): void {
    for (const t of this.tickets) {
      t.hover = damp(t.hover, t.target, 12, dt);
      if (t.mesh.scale.x > 0.99) t.mesh.scale.setScalar(1 + t.hover * 0.06);
      t.mesh.position.z = t.base.z + t.hover * 0.08;
      t.mesh.rotation.z = t.rot * (1 - t.hover * 0.8);
      (t.mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(t.hover * 0.12, t.hover * 0.07, t.hover * 0.02);
    }
  }

  dispose(): void {
    for (const u of this.unpick) u();
    this.closePanel();
    this.ui.remove();
    const g = this.group;
    void tweens.to(0.35, (k) => this.tickets.forEach((t) => t.mesh.scale.setScalar(Math.max(0.001, 1 - k)))).then(() => {
      g.parent?.remove(g);
    });
  }
}

function hashName(s: string): number {
  let h2 = 2166136261;
  for (let i = 0; i < s.length; i++) h2 = Math.imul(h2 ^ s.charCodeAt(i), 16777619);
  return h2 >>> 0;
}

/** Heraldic medal for a ranked tier (0..6). */
export function rankMedal(i: number): string {
  const cols = ['#8a6a4a', '#9aa0a8', '#c0c8d0', '#d8b25a', '#e0c070', '#f0d890', '#c4473a'];
  const c = cols[Math.min(i, cols.length - 1)];
  const n = 5 + Math.min(i, 4);
  const pts = Array.from({ length: n }, (_v, k: number) => {
    const ang = (k / n) * Math.PI * 2 - Math.PI / 2;
    return `${(32 + Math.cos(ang) * 26).toFixed(1)},${(32 + Math.sin(ang) * 26).toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 64 64"><polygon points="${pts}" fill="${c}" stroke="#1b110b" stroke-width="3"/><circle cx="32" cy="32" r="14" fill="#1a0e08" stroke="#1b110b" stroke-width="2"/><path d="M33 22c-5 2-9 8-9 14 0 4 2 6 4 7h8c2-1 4-3 4-7 0-6-3-11-7-14z" fill="${c}"/><circle cx="30" cy="35" r="1.4" fill="#ffcf5a"/><circle cx="34" cy="35" r="1.4" fill="#ffcf5a"/></svg>`;
}
