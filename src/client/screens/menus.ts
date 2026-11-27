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
import { seatOptions, type OnlineMode, type QueueMode } from '../../shared/online';
import { cleanName } from '../../shared/text';
import { lookFromProfile } from '../cosmetics/apply';
import { leaderboard, OnlineSession, serverAvailable } from '../net/online';
import { joinModal, lobbyModal, queueModal, watchModal, type Modal } from './lobby';
import { FONT3D } from '../world/fonts3d';
import { makeText } from '../world/tavern';

export interface Nav {
  app: App;
  hud: Hud;
  picker: Picker;
  layer: HTMLElement;
  toMenu(from?: 'title' | 'play'): void;
  /** The notice board; `lobby` reopens an online table's waiting room. */
  toPlay(opts?: { lobby?: OnlineSession }): void;
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
      ['inventory', 'Inventory', new THREE.Vector3(-1.84, 1.66, -3.36), tv.menuProps.inventory, 0.15],
      // Twice as far away (on the dartboard), so larger to read the same size as Shop and Inventory.
      ['challenges', 'Challenges', new THREE.Vector3(-3.95, 2.27, -5.3), tv.menuProps.challenges, 0.25],
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
    // The labels stay on their props while the camera turns away, then fade.
    void tweens.to(0.4, (k) => this.items.forEach((it) => (it.text.fillOpacity = 1 - k)), { delay: 1.5 }).then(() => {
      this.nav.app.gfx.scene.remove(g);
      this.items.forEach((it) => it.text.dispose());
    });
  }
}

// ====================================================================== play menu

interface Ticket {
  title: string;
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  rot: number;
  hover: number;
  target: number;
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
    // Colour band down the stub edge, one perforation, and a wax seal with the seat count on the stub.
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 18, hh);
    ctx.fillRect(w - 10, 0, 10, hh);
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(60,30,10,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(130, 18);
    ctx.lineTo(130, hh - 18);
    ctx.stroke();
    ctx.setLineDash([]);
    const sx = 72;
    const sy = hh / 2;
    const seal = ctx.createRadialGradient(sx - 12, sy - 14, 6, sx, sy, 54);
    seal.addColorStop(0, '#d8553e');
    seal.addColorStop(0.7, '#8a1f14');
    seal.addColorStop(1, '#5a0e08');
    ctx.fillStyle = seal;
    ctx.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const rr = 52 + (i % 2 ? 0 : 3) + Math.sin(i * 7.3) * 1.5;
      ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,180,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe9c8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${seats.length > 2 ? 40 : 54}px "Grenze Gotisch"`;
    ctx.fillText(seats, sx, sy + 2);
    // Title and one line of description, large enough to read from across the room.
    const cx = (130 + w) / 2;
    ctx.fillStyle = color;
    ctx.font = '800 96px "Grenze Gotisch"';
    ctx.textBaseline = 'alphabetic';
    let size = 96;
    while (ctx.measureText(title).width > w - 170 && size > 60) ctx.font = `800 ${(size -= 4)}px "Grenze Gotisch"`;
    ctx.fillText(title, cx, 150);
    ctx.fillStyle = 'rgba(50,25,8,0.88)';
    ctx.font = 'italic 36px "Alegreya"';
    ctx.fillText(sub, cx, 212);
    if (locked) {
      ctx.save();
      ctx.translate(w - 150, hh - 64);
      ctx.rotate(-0.16);
      ctx.strokeStyle = 'rgba(140,20,12,0.85)';
      ctx.lineWidth = 5;
      ctx.strokeRect(-70, -30, 140, 54);
      ctx.fillStyle = 'rgba(140,20,12,0.85)';
      ctx.font = '800 40px "Grenze Gotisch"';
      ctx.textAlign = 'center';
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
  private modal: Modal | null = null;
  /** A game server is behind this page: online tables are available. */
  private online = false;
  private roomTimer: number | null = null;

  constructor(private nav: Nav, opts: { lobby?: OnlineSession } = {}) {
    const { app } = nav;
    const tv = app.tavern;
    void app.rig.glide(tv.stations.play, 1.9, 0.15);
    nav.hud.showProfile(true);
    const board = tv.board;
    // Real players only: two matchmaking queues and the online tables.
    const defs: Array<[string, string, string, string, () => void, number, number, number]> = [
      ['Duel', 'You and one other soul', '1v1', '#7a2a6a', () => this.queue('duel'), -0.86, 0.47, -0.05],
      ['Teams', 'Two against two', '2v2', '#2f5f9e', () => this.queue('teams'), 0.0, 0.5, 0.03],
      ['Join Table', 'Sit at an open table', '', '#2f7a4a', () => this.openJoin(), 0.86, 0.46, -0.02],
      ['Create Table', 'Your own table', '', '#9b2a20', () => this.openModes(), -0.86, -0.36, 0.04],
      ['Watch Table', 'A match being played', '', '#5e3a1a', () => this.openWatch(), 0.0, -0.4, -0.04],
      ['Leaderboard', 'The best in the tavern', '', '#9a6a10', () => this.openLeaderboard(), 0.86, -0.38, 0.05],
    ];
    for (const [title, sub, seats, color, act, x, y, rz] of defs) {
      const mat = new THREE.MeshStandardMaterial({ map: ticketTexture(title, sub, seats, color, false), roughness: 0.85, transparent: true, alphaTest: 0.5 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.395), mat);
      mesh.position.set(x, y, 0.07);
      mesh.rotation.z = rz;
      mesh.castShadow = true;
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshStandardMaterial({ color: '#8a1c12', roughness: 0.4, metalness: 0.3 }));
      pin.position.set(0, 0.16, 0.02);
      mesh.add(pin);
      this.group.add(mesh);
      const t: Ticket = { title, mesh, base: mesh.position.clone(), rot: rz, hover: 0, target: 0 };
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
            void tweens.to(0.18, (k) => (t.mesh.position.z = t.base.z + 0.1 * Math.sin(k * Math.PI)));
            act();
          },
        })
      );
      mesh.scale.setScalar(0.001);
    }
    board.add(this.group);
    this.tickets.forEach((t, i) =>
      void tweens.to(0.6, (k) => t.mesh.scale.setScalar(Math.max(0.001, k)), { delay: 1.0 + i * 0.12, ease: ease.outBack }).then(() => i === 0 && audio.play('paper'))
    );

    // ---- HTML: back and the name plate.
    const nameInput = h('input', { value: profile.name, maxlength: '16', 'aria-label': 'Your name', placeholder: 'Your name' }) as HTMLInputElement;
    nameInput.addEventListener('change', () => {
      const name = cleanName(nameInput.value);
      nameInput.value = name;
      saveProfile({ name });
    });
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    const back = h('button', { class: 'back-btn' }, 'Back');
    back.addEventListener('click', () => {
      audio.play('click');
      nav.toMenu('play');
    });
    this.ui = h('div', { class: 'layer' }, back, h('label', { class: 'name-plate', title: 'Your name' }, icon('quill'), nameInput));
    nav.layer.append(this.ui);
    if (opts.lobby) {
      this.online = true;
      this.openLobby(opts.lobby);
    }
    void serverAvailable().then((ok) => (this.online = ok));
  }

  private closePanel(): void {
    this.panel?.remove();
    this.panel = null;
    this.modal?.dispose();
    this.modal = null;
  }

  private showModal(m: Modal): void {
    this.closePanel();
    this.modal = m;
    this.nav.layer.append(m.el);
  }

  private openLobby(session: OnlineSession): void {
    this.showModal(lobbyModal(this.nav, session, () => (this.modal = null)));
  }

  private openJoin(): void {
    if (!this.needServer()) return;
    this.showModal(joinModal(this.nav, (s) => this.openLobby(s), () => (this.modal = null)));
  }

  /** Every online action needs the game server; a bare static host has none. */
  private needServer(): boolean {
    if (this.online) return true;
    toast(this.nav.layer, 'The tavern is closed', 'Play needs the game server: open the game from its server address.');
    return false;
  }

  /** Duel or Teams: wait for real players, then the match deals itself. */
  private queue(mode: QueueMode): void {
    if (!this.needServer()) return;
    this.showModal(queueModal(this.nav, mode, () => (this.modal = null)));
  }

  private openWatch(): void {
    if (!this.needServer()) return;
    this.showModal(watchModal(this.nav, () => (this.modal = null)));
  }

  private openModes(): void {
    if (!this.needServer()) return;
    this.closePanel();
    let sel: OnlineMode = 'original';
    let seats = 4;
    let open = true;
    const modes: Array<[string, string, string, OnlineMode]> = [
      ['Original', 'Everyone for themselves. Last soul standing wins the pot.', 'c-red', 'original'],
      ['Teams', "Crimson against Azure. Teammates see each other's hands and share visions. Aegis and Warband join the deck.", 'c-blue', 'teams'],
      ['Scrimmage', 'A relaxed table: long turns, half rewards.', 'c-wine', 'scrimmage'],
      ['Winter Feast', 'A snowy table with Mistletoe and Yule Logs in the deck.', 'c-green', 'winter'],
    ];
    const els: HTMLElement[] = [];
    const list = h('div', { class: 'modes' });
    const sizeRow = h('div', { class: 'size-row' });
    const whoRow = h('div', { class: 'size-row who-row' });
    const renderWho = () => {
      whoRow.replaceChildren(h('span', {}, 'Who may sit'));
      for (const [o, label] of [[true, 'Open table'], [false, 'Private table']] as Array<[boolean, string]>) {
        const b = h('button', { class: 'size who' + (o === open ? ' sel' : '') }, label);
        b.addEventListener('click', () => {
          audio.play('tick');
          open = o;
          renderWho();
        });
        whoRow.append(b);
      }
    };
    const renderSizes = () => {
      sizeRow.replaceChildren(h('span', {}, 'Seats at the table'));
      const opts = seatOptions(sel);
      if (!opts.includes(seats)) seats = opts.includes(4) ? 4 : opts[0];
      for (const n of opts) {
        const b = h('button', { class: 'size' + (n === seats ? ' sel' : '') }, sel === 'teams' ? `${n / 2}v${n / 2}` : String(n));
        b.addEventListener('click', () => {
          audio.play('tick');
          seats = n;
          renderSizes();
        });
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
      els.push(b);
      list.append(b);
    }
    renderSizes();
    renderWho();
    const close = h('button', { class: 'btn-text' }, 'Close');
    close.addEventListener('click', () => {
      audio.play('click');
      this.closePanel();
    });
    const choose = h('button', { class: 'btn-text' }, 'Sit down');
    choose.addEventListener('click', () => {
      audio.play('paper');
      this.closePanel();
      this.openLobby(OnlineSession.create({ name: profile.name, look: lookFromProfile(), mode: sel, size: seats, public: open }));
    });
    this.panel = h('div', { class: 'scrim' }, h('div', { class: 'panel' }, h('h2', {}, 'Create a Table'), list, sizeRow, whoRow, h('div', { class: 'row' }, close, choose)));
    this.panel.addEventListener('click', (e) => e.target === this.panel && this.closePanel());
    this.nav.layer.append(this.panel);
  }

  /** Server-wide standings: wins and games of everyone who has played here (since the server last started). */
  private openLeaderboard(): void {
    if (!this.needServer()) return;
    this.closePanel();
    const table = h('div', { class: 'ladder' }, h('p', { class: 'empty' }, 'Reading the ledger…'));
    const close = h('button', { class: 'btn-text' }, 'Close');
    close.addEventListener('click', () => {
      audio.play('click');
      this.closePanel();
    });
    this.panel = h('div', { class: 'scrim' }, h('div', { class: 'panel leaderboard' }, h('h2', {}, 'Leaderboard'), table, h('div', { class: 'row' }, h('span'), close)));
    this.panel.addEventListener('click', (e) => e.target === this.panel && this.closePanel());
    this.nav.layer.append(this.panel);
    void leaderboard().then((rows) => {
      table.replaceChildren();
      if (!rows.length) table.append(h('p', { class: 'empty' }, 'No matches finished yet tonight.'));
      rows.forEach((r, i) =>
        table.append(
          h(
            'div',
            { class: 'lrow' + (r.name === profile.name ? ' me' : '') },
            h('span', { class: 'pos' }, String(i + 1)),
            h('span', { class: 'nm' }, r.name),
            h('span', { class: 'rk' }, `${r.games} played`),
            h('b', {}, `${r.wins} ${r.wins === 1 ? 'win' : 'wins'}`)
          )
        )
      );
    });
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
    if (this.roomTimer) clearInterval(this.roomTimer);
    this.closePanel();
    this.ui.remove();
    // The papers stay pinned to the board while the camera turns away from it.
    const g = this.group;
    setTimeout(() => g.parent?.remove(g), 2000);
  }
}
