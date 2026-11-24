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
import { FONT3D } from '../world/fonts3d';
import { makeText } from '../world/tavern';

export interface Nav {
  app: App;
  hud: Hud;
  picker: Picker;
  layer: HTMLElement;
  toMenu(from?: 'title' | 'play'): void;
  toPlay(): void;
  startMatch(mode: GameMode): void;
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
    if (it.key === 'play') {
      this.nav.toPlay();
      return;
    }
    const sub = it.key === 'shop' ? 'The merchant is still unpacking his wares.' : it.key === 'inventory' ? 'Your chest will open in a later update.' : 'The notice board is being rewritten.';
    toast(this.nav.layer, it.label + ' — coming soon', sub);
    void tweens.to(0.5, (k) => it.text.position.setX(it.base.x + Math.sin(k * Math.PI * 6) * 0.01 * (1 - k)), { ease: ease.linear });
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
  mode?: GameMode;
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
    const defs: Array<[string, string, string, string, boolean, GameMode | undefined, number, number, number]> = [
      ['Original', 'Duel a stranger at the table', '1v1', '#9b2a20', false, 'original', -0.62, 0.42, -0.05],
      ['Tutorial', 'Learn the ways of the Hand', '1v1', '#9a6a10', false, 'tutorial', 0.64, 0.4, 0.04],
      ['Online Tables', 'Play with real patrons', '2-6', '#3a5a9a', true, undefined, -0.6, -0.36, 0.06],
      ['Ranked', 'Earn your reputation', '1v1', '#5e1622', true, undefined, 0.62, -0.38, -0.03],
    ];
    for (const [title, sub, seats, color, locked, mode, x, y, rz] of defs) {
      const mat = new THREE.MeshStandardMaterial({ map: ticketTexture(title, sub, seats, color, locked), roughness: 0.85, transparent: true, alphaTest: 0.5 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.525), mat);
      mesh.position.set(x, y, 0.07);
      mesh.rotation.z = rz;
      mesh.castShadow = true;
      // Pin.
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshStandardMaterial({ color: '#8a1c12', roughness: 0.4, metalness: 0.3 }));
      pin.position.set(0, 0.21, 0.02);
      mesh.add(pin);
      this.group.add(mesh);
      const t: Ticket = { mesh, base: mesh.position.clone(), rot: rz, hover: 0, target: 0, locked, mode };
      this.tickets.push(t);
      this.unpick.push(
        nav.picker.add({
          object: mesh,
          onHover: (on) => {
            t.target = on ? 1 : 0;
            if (on) audio.play('hover');
          },
          onClick: () => {
            if (t.locked) {
              audio.play('click');
              toast(nav.layer, 'Not yet open', 'Online play arrives in a later update.');
              return;
            }
            audio.play('paper');
            void tweens.to(0.25, (k) => (t.mesh.position.z = t.base.z + 0.12 + k * 0.1)).then(() => nav.startMatch(t.mode!));
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
        pb('Leaderboard', 'crown', '#d8a83a', () => toast(nav.layer, 'Leaderboard — coming soon', 'The innkeeper is still counting.'), true)
      )
    );
    nav.layer.append(this.ui);
  }

  private closePanel(): void {
    this.panel?.remove();
    this.panel = null;
  }

  private openModes(): void {
    this.closePanel();
    let sel: GameMode = 'original';
    const modes: Array<[string, string, string, GameMode | null]> = [
      ['Original', 'One rival. One deck. One Hooded Hand. Last soul standing wins.', 'c-red', 'original'],
      ['Teams', 'Two against two. Protect your partner, doom your rivals.', 'c-blue', null],
      ['Scrimmage', 'A relaxed table for practice, no stakes.', 'c-wine', null],
      ['Winter Feast', 'A seasonal table with festive cards.', 'c-green', null],
      ['Tutorial', 'Learn to play, step by step.', 'c-gold', 'tutorial'],
    ];
    const els: HTMLElement[] = [];
    const list = h('div', { class: 'modes' });
    for (const [name, desc, cls, mode] of modes) {
      const b = h('button', { class: `mode ${cls}${mode ? '' : ' locked'}${mode === sel ? ' sel' : ''}` }, h('b', {}, name), h('span', {}, desc));
      b.addEventListener('pointerenter', () => audio.play('hover'));
      b.addEventListener('click', () => {
        if (!mode) {
          audio.play('click');
          return;
        }
        audio.play('click');
        sel = mode;
        els.forEach((e) => e.classList.remove('sel'));
        b.classList.add('sel');
      });
      b.addEventListener('dblclick', () => mode && this.nav.startMatch(mode));
      els.push(b);
      list.append(b);
    }
    const close = h('button', { class: 'btn-text' }, 'Close');
    close.addEventListener('click', () => {
      audio.play('click');
      this.closePanel();
    });
    const choose = h('button', { class: 'btn-text' }, 'Choose');
    choose.addEventListener('click', () => {
      audio.play('paper');
      this.closePanel();
      this.nav.startMatch(sel);
    });
    this.panel = h('div', { class: 'scrim' }, h('div', { class: 'panel' }, h('h2', {}, 'Create a Table'), h('p', { class: 'lede' }, 'Choose how the night will go.'), list, h('div', { class: 'row' }, close, choose)));
    this.panel.addEventListener('click', (e) => e.target === this.panel && this.closePanel());
    this.nav.layer.append(this.panel);
  }

  private openCodex(): void {
    this.closePanel();
    const urls = this.nav.app.cards.urls;
    const grid = h('div', { class: 'codex-grid' });
    for (const t of CARD_ORDER) {
      const d = CARD_DEFS[t];
      grid.append(
        h(
          'div',
          { class: 'codex-card' },
          h('img', { src: urls[t], alt: d.name, draggable: 'false' }),
          h('b', {}, d.name),
          h('p', {}, d.text),
          h('em', {}, d.instant ? 'Spark: play at any time.' : d.targeted ? 'Target: choose a mark.' : d.flavour)
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
