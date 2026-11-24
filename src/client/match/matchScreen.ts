import * as THREE from 'three';
import { CARD_DEFS, type Card } from '../../shared/cards';
import type { GameEvent, GameMode, PlayerId, PlayerStats, SeatInfo, SyncInfo } from '../../shared/types';
import type { App, Screen } from '../app';
import { audio } from '../audio/audio';
import type { Pickable } from '../core/picker';
import { clamp, damp, ease, tweens } from '../core/tween';
import { LocalTransport, type Transport } from '../net/transport';
import type { Nav } from '../screens/menus';
import { h } from '../ui/dom';
import { profile, saveProfile } from '../ui/profile';
import type { Station } from '../world/tavern';
import { CardMesh } from './cardMesh';
import { Fx } from './fx';
import { HandView } from './handView';
import { Q_FACE_PLAYER, Q_FACE_RIVAL, Q_FLAT_DOWN, TableView } from './tableView';

type XForm = { p: THREE.Vector3; q: THREE.Quaternion; s: number };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class MatchScreen implements Screen {
  private app: App;
  private t!: Transport;
  private table: TableView;
  private hand: HandView;
  private fx: Fx;
  private me: PlayerId = '';
  private seats: SeatInfo[] = [];
  private rivalId: PlayerId = '';
  private queue: GameEvent[] = [];
  private processing = false;
  private sync: SyncInfo | null = null;
  private current: PlayerId | null = null;
  private turnsLeft = 1;
  private phase: 'intro' | 'turn' | 'reaction' | 'scry' | 'rescue' | 'hide' | 'over' = 'intro';
  private pending: { player: PlayerId; card: Card; target?: PlayerId; cancelled: boolean } | null = null;
  private pendingMesh: CardMesh | null = null;
  private doomMesh: CardMesh | null = null;
  private doomed: PlayerId | null = null;
  private hasAngel = false;
  private scryMeshes: CardMesh[] = [];
  private aiming: Card | null = null;
  private windowEnd = 0;
  private windowLen = 1;
  private turnEnd = 0;
  private turnLen = 0;
  private rescueEnd = 0;
  private hideEnd = 0;
  private picks = new Map<CardMesh, () => void>();
  private staticPicks: Array<() => void> = [];
  private result: { winner: PlayerId | null; stats: Record<PlayerId, PlayerStats> } | null = null;
  private disposed = false;
  private tableStation: Station;
  private aimStation: Station;
  // UI
  private ui: HTMLElement;
  private hintEl: HTMLElement;
  private previewEl: HTMLElement;
  private previewImg: HTMLImageElement;
  private previewTitle: HTMLElement;
  private previewText: HTMLElement;
  private actionEl: HTMLElement;
  private countdownEl: HTMLElement;
  private badgeEl: HTMLElement;
  private hideUi: HTMLElement | null = null;
  private previewLock = 0;
  private hintTimer: number | null = null;
  // Tutorial
  private tut: boolean;
  private tutStep = 0;
  private hoveredOnce = false;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(private nav: Nav, private mode: GameMode) {
    this.app = nav.app;
    this.tut = mode === 'tutorial';
    const app = this.app;
    const tv = app.tavern;
    this.tableStation = tv.stations.table;
    this.aimStation = { pos: V(3.4, 2.05, 0.6), target: V(5.25, 0.82, 0.6), look: [0.06, 0.04], fov: 52 };
    app.rig.snap(this.tableStation);
    app.rig.lookScale = 1;
    app.gfx.scene.add(app.gfx.camera);
    nav.hud.showProfile(false);
    nav.hud.showLeave(true);
    nav.hud.onLeave = () => this.leave();

    this.table = new TableView(app);
    this.hand = new HandView(app.gfx.camera, app.cards);
    this.fx = new Fx(tv.glowTex);
    app.gfx.scene.add(this.fx.group);

    // ---- UI
    this.hintEl = h('div', { class: 'hint out' });
    this.previewTitle = h('h3');
    this.previewImg = h('img', { alt: '', draggable: 'false' }) as HTMLImageElement;
    this.previewText = h('p');
    this.previewEl = h('div', { class: 'preview out' }, this.previewTitle, this.previewImg, this.previewText);
    this.actionEl = h('div', { style: 'position:absolute;left:50%;bottom:6vh;transform:translateX(-50%);' });
    this.countdownEl = h('div', {
      style:
        'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:var(--f-title);font-weight:900;font-size:clamp(90px,14vw,190px);color:#ff3b26;text-shadow:0 0 40px rgba(255,40,20,.7),0 6px 0 #2a0402;pointer-events:none;opacity:0;transition:opacity .2s',
    });
    this.badgeEl = h('div', {
      style:
        'position:absolute;left:4vw;bottom:5vh;font-family:var(--f-title);font-weight:800;font-size:clamp(20px,2.2vw,30px);color:#ffd9a0;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .4s;pointer-events:none',
    });
    this.ui = h('div', { class: 'layer' }, this.hintEl, this.previewEl, this.actionEl, this.countdownEl, this.badgeEl);
    nav.layer.append(this.ui);

    // ---- static pickables
    this.staticPicks.push(
      nav.picker.add({
        object: this.table.deckHit,
        priority: 2,
        onHover: (on) => {
          if (on && this.canDraw()) audio.play('hover', { vol: 0.6 });
        },
        onClick: () => this.tryDraw(),
        enabled: () => !this.aiming,
      }),
      nav.picker.add({
        object: this.table.marker,
        priority: 0,
        enabled: () => !!this.aiming,
        onHover: (on) => (this.table.markerHover = on ? 1 : 0),
        onClick: () => this.confirmTarget(),
      })
    );

    this.keyHandler = (e) => {
      if (e.key === 'Escape' && this.aiming) this.cancelAim();
      if ((e.key === 'd' || e.key === ' ') && !this.aiming) this.tryDraw();
    };
    addEventListener('keydown', this.keyHandler);
    app.gfx.renderer.domElement.addEventListener('contextmenu', this.onContext);

    // ---- transport
    this.t = new LocalTransport({ mode, playerName: profile.name });
    this.me = this.t.me;
    this.t.onEvent((ev) => {
      this.queue.push(ev);
      void this.pump();
    });

    // Fade in, then start.
    void (async () => {
      tv.setLightLevel(1);
      await tweens.to(0.9, (k) => (app.gfx.grade.u('uFade').value = 1 - k), { ease: ease.outCubic });
      audio.startMusic();
      this.t.start();
    })();
  }

  private onContext = (e: Event) => {
    e.preventDefault();
    if (this.aiming) this.cancelAim();
  };

  // ==================================================================== event pump

  private async pump(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length && !this.disposed) {
      const ev = this.queue.shift()!;
      tweens.scale = this.queue.length > 6 ? 2.4 : this.queue.length > 2 ? 1.5 : 1;
      try {
        await this.handle(ev);
      } catch (e) {
        console.error('event failed', ev.e, e);
      }
      this.applySync(ev.sync);
    }
    tweens.scale = 1;
    this.processing = false;
    this.refreshAffordances();
  }

  private applySync(s: SyncInfo): void {
    this.sync = s;
    if (!this.doomMesh || this.phase !== 'rescue') this.table.setDeckCount(s.deck);
    this.table.setPlaques(s.deck > 0 ? s.handsInDeck / s.deck : 0, s.handsInDeck, s.alive.length);
    audio.tension = clamp(s.deck > 0 ? (s.handsInDeck / s.deck) * 2 : 0, 0, 1);
  }

  private isMe(id: PlayerId | null | undefined): boolean {
    return id === this.me;
  }

  private nameOf(id: PlayerId): string {
    return this.seats.find((s) => s.id === id)?.name ?? 'Someone';
  }

  // ==================================================================== geometry helpers

  /** World transform of a point in front of the camera (camera-space x,y,-z). */
  private camX(x: number, y: number, z: number, s = 1, faceAway = false): XForm {
    const cam = this.app.gfx.camera;
    cam.updateMatrixWorld();
    const p = V(x, y, -z).applyMatrix4(cam.matrixWorld);
    const q = cam.quaternion.clone();
    if (faceAway) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
    return { p, q, s };
  }

  private fly(obj: THREE.Object3D, to: () => XForm, dur: number, o: { arc?: number; ease?: (k: number) => number; spin?: number } = {}): Promise<void> {
    const p0 = obj.position.clone();
    const q0 = obj.quaternion.clone();
    const s0 = obj.scale.x;
    const spinAxis = V(0, 0, 1);
    return tweens.to(
      dur,
      (k) => {
        const t = to();
        obj.position.lerpVectors(p0, t.p, k);
        obj.position.y += Math.sin(k * Math.PI) * (o.arc ?? 0);
        obj.quaternion.slerpQuaternions(q0, t.q, k);
        if (o.spin) obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(spinAxis, Math.sin(k * Math.PI) * o.spin));
        obj.scale.setScalar(s0 + (t.s - s0) * k);
      },
      { ease: o.ease ?? ease.inOutCubic }
    );
  }

  private newCard(card: Card | null, at: XForm, variant: 'table' | 'hand' = 'table'): CardMesh {
    const cm = new CardMesh(this.app.cards, card, variant);
    cm.root.position.copy(at.p);
    cm.root.quaternion.copy(at.q);
    cm.root.scale.setScalar(at.s);
    this.app.gfx.scene.add(cm.root);
    return cm;
  }

  private deckX(): XForm {
    return { p: this.table.deckTopWorld(), q: Q_FLAT_DOWN.clone(), s: 1 };
  }

  private registerHandCard(cm: CardMesh): void {
    const p: Pickable = {
      object: cm.face,
      priority: -1,
      enabled: () => !this.aiming && this.hand.cards.includes(cm),
      onHover: (on) => {
        if (on) {
          this.hand.hovered = cm;
          if (cm.card) this.showPreview(cm.card);
          audio.play('hover', { vol: 0.5 });
          if (!this.hoveredOnce) {
            this.hoveredOnce = true;
            this.tutorial('hovered');
          }
        } else if (this.hand.hovered === cm) {
          this.hand.hovered = null;
          this.hidePreview();
        }
      },
      onClick: () => cm.card && this.onCardClick(cm.card),
    };
    this.picks.set(cm, this.nav.picker.add(p));
  }

  private unregister(cm: CardMesh): void {
    this.picks.get(cm)?.();
    this.picks.delete(cm);
    if (this.hand.hovered === cm) {
      this.hand.hovered = null;
      this.hidePreview();
    }
  }

  private addToHand(cm: CardMesh): void {
    this.hand.add(cm);
    this.registerHandCard(cm);
  }

  private takeFromHand(id: number): CardMesh | null {
    const cm = this.hand.find(id);
    if (!cm) return null;
    this.unregister(cm);
    return this.hand.take(id, this.app.gfx.scene);
  }

  // ==================================================================== UI helpers

  private showPreview(card: Card, lockMs = 0): void {
    const d = CARD_DEFS[card.type];
    this.previewTitle.textContent = d.name;
    this.previewImg.src = this.app.cards.urls[card.type];
    this.previewText.textContent = d.text;
    this.previewEl.classList.remove('out');
    if (lockMs) this.previewLock = performance.now() + lockMs;
  }

  private hidePreview(): void {
    if (performance.now() < this.previewLock) {
      setTimeout(() => !this.hand.hovered && this.hidePreview(), this.previewLock - performance.now() + 20);
      return;
    }
    this.previewEl.classList.add('out');
  }

  private hint(html: string | null, ms = 0): void {
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = null;
    if (!html) {
      this.hintEl.classList.add('out');
      return;
    }
    const show = () => {
      this.hintEl.innerHTML = html;
      this.hintEl.classList.remove('out');
    };
    if (!this.hintEl.classList.contains('out')) {
      this.hintEl.classList.add('out');
      setTimeout(show, 250);
    } else show();
    if (ms) this.hintTimer = window.setTimeout(() => this.hintEl.classList.add('out'), ms);
  }

  private banner(text: string, color?: string): void {
    const el = h('div', { class: 'banner-title', style: color ? `color:${color};text-shadow:0 0 30px ${color}99,0 4px 0 #1a0a04` : '' }, text);
    this.ui.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  private action(label: string | null, fn?: () => void): void {
    this.actionEl.replaceChildren();
    if (!label) return;
    const b = h('button', { class: 'action-btn' }, label);
    b.addEventListener('click', () => {
      audio.play('click');
      fn?.();
    });
    this.actionEl.append(b);
  }

  private setBadge(turns: number): void {
    if (turns > 1) {
      this.badgeEl.textContent = `Bounty on your head — take ${turns} turns`;
      this.badgeEl.style.opacity = '1';
    } else this.badgeEl.style.opacity = '0';
  }

  // ==================================================================== affordances & input

  private idle(): boolean {
    return !this.processing && this.queue.length === 0 && !this.disposed;
  }

  private canDraw(): boolean {
    return this.idle() && this.phase === 'turn' && this.isMe(this.current) && !this.aiming;
  }

  private canParry(): boolean {
    return this.phase === 'reaction' && !!this.pending && !!this.hand.ofType('parry');
  }

  private refreshAffordances(): void {
    this.table.deckGlowTarget = this.canDraw() ? 1 : 0;
    this.hand.highlight.clear();
    if (this.phase === 'rescue' && this.isMe(this.doomed)) {
      const a = this.hand.ofType('angel');
      if (a?.card) this.hand.highlight.add(a.card.id);
    }
    if (this.canParry() && this.pending && (this.pending.player !== this.me || this.pending.cancelled)) {
      const p = this.hand.ofType('parry');
      if (p?.card) this.hand.highlight.add(p.card.id);
    }
  }

  private async tryDraw(): Promise<void> {
    if (!this.canDraw()) return;
    this.table.deckGlowTarget = 0;
    audio.play('click', { vol: 0.5 });
    const r = await this.t.send({ t: 'draw' });
    if (!r.ok) this.refreshAffordances();
  }

  private async onCardClick(card: Card): Promise<void> {
    const d = CARD_DEFS[card.type];
    // Rescue.
    if (card.type === 'angel') {
      if (this.phase === 'rescue' && this.isMe(this.doomed)) {
        await this.t.send({ t: 'rescue', cardId: card.id });
      } else this.nudge(card, 'The Angel only answers when the Hooded Hand comes for you.');
      return;
    }
    // Parry (any time a card is in the air).
    if (card.type === 'parry') {
      if (this.canParry()) await this.t.send({ t: 'react', cardId: card.id });
      else this.nudge(card, 'Parry a card the moment it is played.');
      return;
    }
    if (!this.idle() || this.phase !== 'turn' || !this.isMe(this.current)) {
      this.nudge(card, this.isMe(this.current) ? 'Wait a moment…' : 'It is not your turn.');
      return;
    }
    if (!d.playable) return;
    if (d.targeted) {
      this.enterAim(card);
      return;
    }
    audio.play('click', { vol: 0.5 });
    const r = await this.t.send({ t: 'play', cardId: card.id });
    if (!r.ok) this.nudge(card, 'Not now.');
  }

  private nudge(card: Card, msg: string): void {
    const cm = this.hand.find(card.id);
    if (cm) {
      const x0 = cm.root.position.x;
      void tweens.to(0.35, (k) => (cm.root.position.x = x0 + Math.sin(k * Math.PI * 5) * 0.004 * (1 - k)), { ease: ease.linear });
    }
    if (!this.tut) this.hint(msg, 1800);
  }

  private enterAim(card: Card): void {
    this.aiming = card;
    audio.play('whoosh', { vol: 0.6 });
    this.hand.lowered = 1;
    this.hand.hovered = null;
    this.hidePreview();
    this.table.markerOn = true;
    this.app.rig.sway = 0.3;
    void this.app.rig.glide(this.aimStation, 0.8, 0.05);
    this.hint('Choose your mark.');
    this.tutorial('aim');
    this.aimPick = this.nav.picker.add({
      object: this.table.rival!.root,
      priority: 0,
      enabled: () => !!this.aiming,
      onHover: (on) => (this.table.markerHover = on ? 1 : 0),
      onClick: () => this.confirmTarget(),
    });
  }
  private aimPick: (() => void) | null = null;

  private exitAim(): void {
    this.aiming = null;
    this.aimPick?.();
    this.aimPick = null;
    this.table.markerOn = false;
    this.table.markerHover = 0;
    this.hand.lowered = 0;
    this.app.rig.sway = 1;
    void this.app.rig.glide(this.tableStation, 0.7, 0.05);
  }

  private cancelAim(): void {
    this.exitAim();
    this.hint(null);
  }

  private async confirmTarget(): Promise<void> {
    const card = this.aiming;
    if (!card) return;
    this.exitAim();
    this.hint(null);
    audio.play('click');
    const r = await this.t.send({ t: 'play', cardId: card.id, targetId: this.rivalId });
    if (!r.ok) this.hint('Not now.', 1500);
  }

  // ==================================================================== event handlers

  private async handle(ev: GameEvent): Promise<void> {
    switch (ev.e) {
      case 'start':
        return this.onStart(ev.seats);
      case 'deal':
        return this.onDeal(ev.to, ev.card);
      case 'intro':
        return this.onIntro();
      case 'turn':
        return this.onTurn(ev.player, ev.turnsLeft, ev.ms);
      case 'play':
        return this.onPlay(ev.player, ev.card, ev.target);
      case 'window':
        return this.onWindow(ev.ms);
      case 'parry':
        return this.onParry(ev.player, ev.card, ev.cancelled);
      case 'resolve':
        return this.onResolve(ev.player, ev.card, ev.cancelled);
      case 'scry':
        return this.onScry(ev.player, ev.cards, ev.ms);
      case 'scryEnd':
        return this.onScryEnd();
      case 'shuffle':
        return this.onShuffle();
      case 'steal':
        return this.onSteal(ev.from, ev.to, ev.card);
      case 'owed':
        return this.onOwed(ev.player, ev.turnsLeft);
      case 'draw':
        return this.onDraw(ev.player, ev.card, ev.bottom);
      case 'doom':
        return this.onDoom(ev.player, ev.card, ev.ms, ev.hasAngel);
      case 'rescue':
        return this.onRescue(ev.player, ev.card);
      case 'hidePrompt':
        return this.onHidePrompt(ev.player, ev.ms);
      case 'hidden':
        return this.onHidden(ev.player, ev.position);
      case 'slain':
        return this.onSlain(ev.player);
      case 'over':
        return this.onOver(ev.winner, ev.stats);
    }
  }

  private async onStart(seats: SeatInfo[]): Promise<void> {
    this.seats = seats;
    this.me = this.t.me;
    const rival = seats.find((s) => s.id !== this.me)!;
    this.rivalId = rival.id;
    this.table.setRival(rival);
    await tweens.wait(0.3);
  }

  private async onDeal(to: PlayerId, card?: Card): Promise<void> {
    const from = this.deckX();
    if (this.isMe(to) && card) {
      const cm = this.newCard(card, from, 'hand');
      audio.play('deal');
      await this.fly(cm.root, () => this.camX(0, 0.0, 0.5, 1.05), 0.32, { arc: 0.15, ease: ease.outCubic });
      await tweens.wait(0.1);
      this.addToHand(cm);
    } else {
      const cm = this.newCard(null, from);
      audio.play('deal', { vol: 0.6 });
      const n = this.table.rivalHand.length + 1;
      await this.fly(cm.root, () => this.table.rivalSlot(n - 1, n), 0.42, { arc: 0.12 });
      this.table.rivalHand.push(cm);
      void this.table.layoutRival(0.2);
    }
  }

  private async onIntro(): Promise<void> {
    this.phase = 'intro';
    audio.play('stinger', { vol: 0.45 });
    this.banner("Don't draw the Hooded Hand");
    this.app.rig.fovKick = 0;
    await tweens.to(1.2, (k) => (this.app.rig.fovKick = -Math.sin(k * Math.PI) * 2.5));
    if (this.tut) this.hint('Every card you hold is real. Hover over one to read it.');
    await tweens.wait(1.3);
  }

  private async onTurn(player: PlayerId, turnsLeft: number, ms: number | null): Promise<void> {
    const mine = this.isMe(player);
    const changed = this.current !== player;
    this.current = player;
    this.turnsLeft = turnsLeft;
    this.phase = 'turn';
    this.pending = null;
    this.turnLen = ms ?? 0;
    this.turnEnd = ms ? performance.now() + ms + 900 : 0;
    this.table.setSign(mine);
    this.table.flipHourglass();
    this.setBadge(mine ? turnsLeft : 0);
    this.table.showRivalBadge(!mine ? turnsLeft : 0);
    if (mine) {
      if (changed) {
        audio.play('ignite');
        audio.play('chime', { at: 0.25 });
      }
    } else {
      this.table.rival && (this.table.rival.lookPitch = 0.25);
    }
    this.tutorial('turn');
    await tweens.wait(0.85);
    if (this.table.rival) this.table.rival.lookPitch = 0;
  }

  private async onPlay(player: PlayerId, card: Card, target?: PlayerId): Promise<void> {
    this.phase = 'reaction';
    this.pending = { player, card, target, cancelled: false };
    const slot = this.table.pileSlot();
    let cm: CardMesh | null;
    if (this.isMe(player)) {
      cm = this.takeFromHand(card.id);
      if (!cm) cm = this.newCard(card, this.camX(0, -0.2, 0.55, 1));
      audio.play('swish');
      await this.fly(cm.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.5, { arc: 0.16, spin: 0.6 });
      audio.play('place');
    } else {
      cm = this.table.rivalHand.pop() ?? this.newCard(null, this.table.rivalSlot(0, 1));
      cm.setCard(card);
      cm.setVariant('hand');
      void this.table.layoutRival(0.25);
      this.table.rival?.setReach(0.9, 'R');
      audio.play('swish');
      await this.fly(cm.root, () => this.camX(0.0, 0.05, 0.62, 0.95), 0.36, { arc: 0.1, ease: ease.outCubic });
      this.showPreview(card, 900);
      await tweens.wait(0.22);
      this.table.rival?.setReach(0.55, 'R');
      cm.setVariant('table');
      await this.fly(cm.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.32, { arc: 0.08 });
      audio.play('place');
      setTimeout(() => !this.hand.hovered && this.hidePreview(), 400);
    }
    this.table.pushPile(cm);
    this.pendingMesh = cm;
    this.fx.burst({ at: slot.p.clone().add(V(0, 0.01, 0)), count: 8, color: '#ffd9a0', intensity: 1.2, speed: 0.25, up: 0.6, life: 0.5, size: 0.02, gravity: -0.2 });
    this.tutorial('play', { player, card, target });
  }

  private onWindow(ms: number): void {
    this.phase = 'reaction';
    this.windowLen = ms;
    this.windowEnd = performance.now() + ms;
    this.refreshAffordances();
    this.tutorial('window');
    const p = this.pending;
    if (!this.tut && p && this.hand.ofType('parry') && p.player !== this.me && !p.cancelled && p.target === this.me) {
      this.hint('Parry it?', Math.min(ms, 2200));
    }
  }

  private async onParry(player: PlayerId, card: Card, cancelled: boolean): Promise<void> {
    if (this.pending) this.pending.cancelled = cancelled;
    const slot = this.table.pileSlot();
    let cm: CardMesh | null;
    if (this.isMe(player)) {
      cm = this.takeFromHand(card.id) ?? this.newCard(card, this.camX(0, -0.2, 0.55, 1));
    } else {
      cm = this.table.rivalHand.pop() ?? this.newCard(null, this.table.rivalSlot(0, 1));
      cm.setCard(card);
      void this.table.layoutRival(0.25);
    }
    audio.play('swish', { vol: 1.2 });
    await this.fly(cm.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.42, { arc: 0.22, spin: -1.2, ease: ease.inQuad });
    audio.play('parry');
    this.app.rig.shake(0.025);
    this.fx.burst({ at: slot.p.clone().add(V(0, 0.03, 0)), count: 26, color: '#bfe0ff', intensity: 4, speed: 1.4, up: 0.8, life: 0.45, size: 0.025, gravity: -2.5 });
    const fl = this.fx.flash(slot.p.clone().add(V(0, 0.05, 0)), new THREE.Color(2.5, 3, 4), 0.6);
    void tweens.to(0.4, (k) => ((fl.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI))).then(() => this.fx.group.remove(fl));
    this.table.pushPile(cm);
    // Dim the card whose effect is now cancelled (or restore it if the Parry itself was parried).
    this.pendingMesh?.tint(cancelled ? 0.45 : 1, cancelled ? 0.45 : 1, cancelled ? 0.5 : 1);
    if (!this.isMe(player)) this.showPreview(card, 900);
    this.tutorial('parry', { player, cancelled });
    await tweens.wait(0.3);
  }

  private async onResolve(player: PlayerId, card: Card, cancelled: boolean): Promise<void> {
    this.table.setRing(0, 0);
    this.windowEnd = 0;
    this.phase = 'turn';
    if (cancelled) {
      audio.play('snuff', { vol: 0.8 });
      if (!this.tut) this.hint(`${CARD_DEFS[card.type].name} was parried.`, 1600);
    } else if (card.type === 'slip') {
      audio.play('whoosh');
      if (!this.isMe(player) && !this.tut) this.hint(`${this.nameOf(player)} slips away without drawing.`, 1800);
    }
    this.tutorial('resolve', { player, card, cancelled });
    this.pending = null;
    await tweens.wait(0.3);
  }

  private async onScry(player: PlayerId, cards: Card[] | undefined, ms: number): Promise<void> {
    this.phase = 'scry';
    audio.play('scry');
    const n = 3;
    const from = this.deckX();
    this.scryMeshes = [];
    for (let i = 0; i < n; i++) {
      const cm = this.newCard(this.isMe(player) && cards ? (cards[i] ?? null) : null, from, this.isMe(player) ? 'hand' : 'table');
      this.scryMeshes.push(cm);
    }
    if (this.isMe(player) && cards) {
      const jobs = this.scryMeshes.map((cm, i) =>
        this.fly(cm.root, () => this.camX((i - 1) * 0.165, 0.05 - Math.abs(i - 1) * 0.012, 0.62 + Math.abs(i - 1) * 0.02, 1.05), 0.55, { arc: 0.12, ease: ease.outCubic })
      );
      for (let i = 0; i < n; i++) {
        const fl = this.fx.flash(this.table.deckTopWorld(), new THREE.Color(1.8, 0.8, 3), 0.5);
        void tweens.to(0.6, (k) => ((fl.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI) * 0.8)).then(() => this.fx.group.remove(fl));
      }
      await Promise.all(jobs);
      this.hand.lowered = 0.6;
      // Hover them to read.
      this.scryMeshes.forEach((cm) => {
        if (!cm.card) return;
        const card = cm.card;
        this.staticPicks.push(
          this.nav.picker.add({ object: cm.face, priority: -2, onHover: (on) => (on ? this.showPreview(card) : this.hidePreview()) })
        );
      });
      this.hint(this.tut ? 'Only you can see the future. The Hooded Hand lurks just beneath the top card.' : 'Only you can see the future. Top of the deck is on the left.');
      this.action('Done', () => {
        this.action(null);
        void this.t.send({ t: 'scryDone' });
      });
    } else {
      const jobs = this.scryMeshes.map((cm, i) => {
        const p = this.table.deckPos.clone().add(V(0.05, 0.22, (i - 1) * 0.12));
        return this.fly(cm.root, () => ({ p, q: Q_FACE_RIVAL.clone(), s: 0.9 }), 0.55, { arc: 0.05 });
      });
      if (!this.tut) this.hint(`${this.nameOf(player)} peers into the Scrying Orb…`, Math.min(ms, 3000));
      await Promise.all(jobs);
    }
  }

  private async onScryEnd(): Promise<void> {
    this.action(null);
    this.hand.lowered = 0;
    if (!this.tut) this.hint(null);
    const to = this.deckX();
    await Promise.all(this.scryMeshes.map((cm, i) => this.fly(cm.root, () => to, 0.45, { arc: 0.08, ease: ease.inOutCubic }).then(() => i === 0 && audio.play('place', { vol: 0.5 }))));
    for (const cm of this.scryMeshes) cm.dispose();
    this.scryMeshes = [];
    this.hidePreview();
    this.phase = 'turn';
    this.tutorial('scryEnd');
  }

  private async onShuffle(): Promise<void> {
    audio.play('shuffle');
    const center = this.table.deckTopWorld();
    const ghosts: CardMesh[] = [];
    for (let i = 0; i < 7; i++) ghosts.push(this.newCard(null, this.deckX()));
    await tweens.to(1.15, (k) => {
      ghosts.forEach((g, i) => {
        const a = k * Math.PI * 4 + (i / ghosts.length) * Math.PI * 2;
        const r = Math.sin(k * Math.PI) * 0.18;
        g.root.position.set(center.x + Math.cos(a) * r, center.y + Math.sin(k * Math.PI) * (0.05 + i * 0.01), center.z + Math.sin(a) * r);
        g.root.quaternion.copy(Q_FLAT_DOWN).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a));
      });
    }, { ease: ease.inOutSine });
    ghosts.forEach((g) => g.dispose());
    if (!this.tut) this.hint('The deck is shuffled. Nobody knows anything now.', 1800);
  }

  private async onSteal(from: PlayerId, to: PlayerId, card?: Card): Promise<void> {
    if (this.isMe(to)) {
      const cm = this.table.rivalHand.pop();
      void this.table.layoutRival(0.25);
      if (!cm) return;
      audio.play('swish');
      cm.setVariant('hand');
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.55, 1, true), 0.45, { arc: 0.1 });
      if (card) cm.setCard(card);
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.55, 1.05), 0.3, { ease: ease.outCubic });
      audio.play('coins', { vol: 0.6 });
      await tweens.wait(0.25);
      this.addToHand(cm);
    } else if (this.isMe(from)) {
      const cm = card ? this.takeFromHand(card.id) : null;
      if (!cm) return;
      audio.play('swish');
      this.hint(`${this.nameOf(to)} picked your pocket!`, 1800);
      const n = this.table.rivalHand.length + 1;
      await this.fly(cm.root, () => this.table.rivalSlot(n - 1, n), 0.65, { arc: 0.2 });
      cm.setCard(null);
      this.table.rivalHand.push(cm);
      void this.table.layoutRival(0.3);
    }
    await tweens.wait(0.2);
  }

  private async onOwed(player: PlayerId, turns: number): Promise<void> {
    audio.play('bounty');
    this.app.rig.shake(0.035);
    if (this.isMe(player)) {
      this.banner(`Bounty! ${turns} turns`, '#ff8a3a');
      this.setBadge(turns);
    } else {
      this.table.showRivalBadge(turns);
      if (!this.tut) this.hint(`${this.nameOf(player)} must take ${turns} turns.`, 1800);
    }
    this.tutorial('owed', { player });
    await tweens.wait(0.9);
  }

  private async onDraw(player: PlayerId, card: Card | undefined, bottom: boolean): Promise<void> {
    const from = bottom ? { p: this.table.deckPos.clone().add(V(0, 0.002, 0)), q: Q_FLAT_DOWN.clone(), s: 1 } : this.deckX();
    const isHand = card?.type === 'hand';
    if (this.isMe(player)) {
      const cm = this.newCard(card ?? null, from, 'hand');
      audio.play('draw');
      if (isHand) {
        // Keep it face-down in front of us; the doom event reveals it.
        await this.fly(cm.root, () => this.camX(0.0, 0.03, 0.5, 1.15, true), 0.6, { arc: 0.12, ease: ease.outCubic });
        this.doomMesh = cm;
        return;
      }
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.5, 1.05), 0.5, { arc: 0.12, ease: ease.outCubic });
      await tweens.wait(0.25);
      this.addToHand(cm);
      this.tutorial('drew');
    } else {
      const cm = this.newCard(null, from);
      audio.play('draw', { vol: 0.7 });
      this.table.rival?.setReach(0.85, 'L');
      if (isHand) {
        const p = this.table.pilePos.clone().add(V(0.02, 0.2, 0));
        await this.fly(cm.root, () => ({ p, q: Q_FACE_RIVAL.clone(), s: 1.25 }), 0.65, { arc: 0.1 });
        cm.setCard(card!);
        this.doomMesh = cm;
        this.table.rival?.setReach(0.55, 'L');
        return;
      }
      const n = this.table.rivalHand.length + 1;
      await this.fly(cm.root, () => this.table.rivalSlot(n - 1, n), 0.6, { arc: 0.1 });
      this.table.rivalHand.push(cm);
      void this.table.layoutRival(0.2);
      this.table.rival?.setReach(0.55, 'L');
    }
  }

  private async onDoom(player: PlayerId, card: Card, ms: number, hasAngel?: boolean): Promise<void> {
    this.phase = 'rescue';
    this.doomed = player;
    this.hasAngel = !!hasAngel;
    const app = this.app;
    const tv = app.tavern;
    audio.cutMusic();
    audio.play('stinger');
    this.hint(null);
    this.hidePreview();
    const cm = this.doomMesh ?? this.newCard(card, this.deckX());
    this.doomMesh = cm;
    cm.setCard(card);
    // Flood the room with red.
    void tweens.to(0.7, (k) => {
      app.gfx.grade.u('uDanger').value = k;
      tv.setLightLevel(1 - k * 0.45);
      app.gfx.chroma.offset.set(0.0012 * k, 0.0008 * k);
    });
    tv.flames.uniforms.uTint.value.setRGB(1.4, 0.55, 0.45);
    if (this.isMe(player)) {
      // Flip it toward us.
      const q0 = cm.root.quaternion.clone();
      await tweens.to(0.45, (k) => {
        const t = this.camX(0.0, 0.03, 0.5, 1.15);
        cm.root.position.copy(t.p);
        cm.root.quaternion.slerpQuaternions(q0, t.q, k);
      }, { ease: ease.outBack });
      app.rig.shake(0.03);
      this.fx.burst({ at: cm.root.position.clone(), count: 20, color: '#ff3a1a', intensity: 3, speed: 0.6, life: 0.7, size: 0.03, gravity: 0 });
      this.hand.lowered = 0.35;
    } else {
      const q0 = cm.root.quaternion.clone();
      await tweens.to(0.45, (k) => cm.root.quaternion.slerpQuaternions(q0, Q_FACE_PLAYER, k), { ease: ease.outBack });
      app.rig.shake(0.02);
      if (this.table.rival) this.table.rival.breathe = 6;
    }
    // Dread count.
    for (const n of [3, 2, 1]) {
      this.countdownEl.textContent = String(n);
      this.countdownEl.style.opacity = '1';
      this.placeCountdown(0);
      audio.play('heartbeat');
      await tweens.to(0.85, (k) => (this.countdownEl.style.transform = `translate(-50%,-50%) scale(${1.25 - k * 0.25})`), { ease: ease.outCubic });
    }
    this.countdownEl.style.opacity = '0';
    this.rescueEnd = performance.now() + ms;
    if (this.isMe(player)) {
      // Hold the card off to the side so the hand is visible.
      void this.fly(cm.root, () => this.camX(0.12, 0.05, 0.6, 1.05), 0.4, { ease: ease.outCubic });
      this.hand.lowered = 0;
      if (hasAngel) this.hint(this.tut ? 'Quick! Click your Guardian Angel!' : 'Play your Guardian Angel!');
      else this.hint('No angel watches over you…');
    } else {
      if (!this.tut) this.hint(`${this.nameOf(player)} drew the Hooded Hand!`);
    }
    this.refreshAffordances();
    this.tutorial('doom', { player });
  }

  private async onRescue(player: PlayerId, card: Card): Promise<void> {
    this.rescueEnd = 0;
    this.hint(null);
    const app = this.app;
    const tv = app.tavern;
    const doom = this.doomMesh!;
    let angel: CardMesh | null;
    if (this.isMe(player)) {
      angel = this.takeFromHand(card.id) ?? this.newCard(card, this.camX(0, -0.2, 0.55, 1));
      angel.setVariant('hand');
      await this.fly(angel.root, () => this.camX(-0.1, 0.06, 0.52, 1.15), 0.45, { arc: 0.06, ease: ease.outCubic });
    } else {
      angel = this.table.rivalHand.pop() ?? this.newCard(null, this.table.rivalSlot(0, 1));
      angel.setCard(card);
      void this.table.layoutRival(0.25);
      const p = doom.root.position.clone().add(V(-0.08, 0.06, -0.1));
      await this.fly(angel.root, () => ({ p, q: Q_FACE_PLAYER.clone(), s: 1.25 }), 0.45, { arc: 0.1 });
    }
    // The saving light.
    audio.play('angel');
    const at = angel.root.position.clone();
    const fl = this.fx.flash(at, new THREE.Color(3, 2.7, 2), 1.4);
    const ringQ = app.gfx.camera.quaternion.clone();
    const ring = this.fx.ring(at, new THREE.Color(3, 2.5, 1.4), ringQ);
    this.fx.burst({ at, count: 26, color: '#ffffff', speed: 0.5, up: 0.4, life: 2.0, size: 0.035, gravity: -0.12, drag: 1.2, kind: 'feather', spread: V(0.1, 0.1, 0.1) });
    this.fx.burst({ at, count: 40, color: '#ffe8b0', intensity: 3, speed: 0.9, life: 1.2, size: 0.02, gravity: 0.1 });
    tv.flames.uniforms.uTint.value.setRGB(1, 1, 1);
    await tweens.to(1.2, (k) => {
      const flash = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      app.gfx.grade.u('uHoly').value = flash * 0.65;
      app.gfx.grade.u('uDanger').value = 1 - k * 0.7;
      (fl.material as THREE.SpriteMaterial).opacity = flash;
      fl.scale.setScalar(1.4 + k * 1.2);
      ring.scale.setScalar(0.05 + k * 0.6);
      (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      tv.setLightLevel(0.55 + k * 0.35);
    }, { ease: ease.outCubic });
    this.fx.group.remove(fl, ring);
    if (this.table.rival) this.table.rival.breathe = 1;
    const slot = this.table.pileSlot();
    angel.setVariant('table');
    await this.fly(angel.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.45, { arc: 0.1 });
    audio.play('place');
    this.table.pushPile(angel);
    this.tutorial('rescued', { player });
  }

  private onHidePrompt(player: PlayerId, ms: number): void {
    this.phase = 'hide';
    this.hideEnd = performance.now() + ms;
    const doom = this.doomMesh!;
    if (this.isMe(player)) {
      void this.fly(doom.root, () => this.camX(0.13, 0.04, 0.62, 1.0), 0.35);
      this.openHideUi();
    } else {
      const p = this.table.deckPos.clone().add(V(0.02, 0.24, 0));
      void this.fly(doom.root, () => ({ p, q: Q_FACE_RIVAL.clone(), s: 1.1 }), 0.4, { arc: 0.05 });
      if (!this.tut) this.hint(`${this.nameOf(player)} is hiding the Hooded Hand…`);
    }
    this.tutorial('hidePrompt', { player });
  }

  private openHideUi(): void {
    const deck = this.sync?.deck ?? 0;
    let pos = 0;
    const track = h('div', { class: 'track' });
    const knob = h('div', { class: 'knob' }, h('span', { class: 'num' }, '1'), h('span', { class: 'tri' }));
    track.append(knob);
    const setPos = (p: number) => {
      pos = clamp(Math.round(p), 0, deck);
      const frac = deck > 0 ? pos / deck : 0;
      knob.style.top = `${frac * 100}%`;
      (knob.querySelector('.num') as HTMLElement).textContent = String(pos + 1);
    };
    const fromEvent = (e: PointerEvent) => {
      const r = track.getBoundingClientRect();
      setPos(((e.clientY - r.top) / r.height) * deck);
    };
    let drag = false;
    track.addEventListener('pointerdown', (e) => {
      drag = true;
      track.setPointerCapture(e.pointerId);
      fromEvent(e);
      audio.play('tick');
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const before = pos;
      fromEvent(e);
      if (pos !== before) audio.play('tick');
    });
    track.addEventListener('pointerup', () => (drag = false));
    track.addEventListener('wheel', (e) => {
      setPos(pos + Math.sign(e.deltaY));
      audio.play('tick');
    });
    const confirm = h('button', { class: 'action-btn confirm' }, 'Confirm');
    confirm.addEventListener('click', () => {
      audio.play('click');
      this.closeHideUi();
      void this.t.send({ t: 'hide', position: pos });
    });
    const labels = h('div', { class: 'labels' }, h('span', {}, 'Top of deck'), h('span', {}, deck > 2 ? 'Middle' : ''), h('span', {}, 'Bottom'));
    this.hideUi = h('div', { class: 'hide-ui' }, h('h3', {}, 'Hide the Hooded Hand!'), labels, track, confirm);
    this.ui.append(this.hideUi);
    setPos(0);
    this.hint(this.tut ? 'No one will know where you hide the Hooded Hand. Put it on top.' : 'No one will know where you hide it.');
    this.hintEl.style.left = '50%';
    this.hintEl.style.top = '7%';
    this.hintEl.style.transform = 'translateX(-50%)';
    this.hintEl.style.textAlign = 'center';
    this.hidePreview();
  }

  private closeHideUi(): void {
    this.hideUi?.remove();
    this.hideUi = null;
    this.hintEl.style.left = '';
    this.hintEl.style.top = '';
    this.hintEl.style.transform = '';
    this.hintEl.style.textAlign = '';
  }

  private async onHidden(player: PlayerId, position?: number): Promise<void> {
    this.closeHideUi();
    this.hint(null);
    const app = this.app;
    const tv = app.tavern;
    const doom = this.doomMesh;
    this.doomMesh = null;
    this.doomed = null;
    this.hideEnd = 0;
    if (doom) {
      const deck = this.sync?.deck ?? 1;
      const depth = position != null ? position : Math.floor(deck / 2);
      // Turn face down, then slide into the deck at the chosen depth.
      const q = Q_FLAT_DOWN.clone();
      const top = this.table.deckTopWorld();
      const into = this.table.deckPos.clone().add(V(-0.06, Math.max(0.002, (deck - depth) * 0.0011), 0));
      doom.setVariant('table');
      await this.fly(doom.root, () => ({ p: top.clone().add(V(-0.18, 0.06, 0)), q, s: 1 }), 0.5, { arc: 0.12 });
      audio.play('swish');
      await this.fly(doom.root, () => ({ p: into, q, s: 1 }), 0.35, { ease: ease.inQuad });
      audio.play('place');
      doom.dispose();
    }
    void tweens.to(0.8, (k) => {
      app.gfx.grade.u('uDanger').value = Math.min(app.gfx.grade.u('uDanger').value, 0.3 * (1 - k));
      app.gfx.chroma.offset.set(0, 0);
      tv.setLightLevel(0.9 + k * 0.1);
    });
    tv.flames.uniforms.uTint.value.setRGB(1, 1, 1);
    audio.startMusic();
    this.phase = 'turn';
    this.tutorial('hidden', { player });
    await tweens.wait(0.4);
  }

  private async onSlain(player: PlayerId): Promise<void> {
    this.phase = 'over';
    this.rescueEnd = 0;
    this.hint(null);
    this.hand.highlight.clear();
    const app = this.app;
    const tv = app.tavern;
    const mine = this.isMe(player);
    const seat = this.seats.find((s) => s.id === player)!;
    // 1. The candles die one by one.
    const all = [...tv.tableCandleFlames, ...tv.chandelierFlames, ...tv.sign.flames];
    all.forEach((f, i) => setTimeout(() => tv.flames.setLit(f, 0), (i / all.length) * 900));
    for (let i = 0; i < 4; i++) audio.play('snuff', { at: i * 0.25, vol: 0.6 });
    await tweens.to(1.1, (k) => tv.setLightLevel(0.55 * (1 - k) + 0.05 * k));
    await tweens.wait(0.45);
    // 2. Steel in the dark.
    audio.play('slash');
    app.gfx.grade.u('uHoly').value = 0.5;
    void tweens.to(0.25, (k) => (app.gfx.grade.u('uHoly').value = 0.5 * (1 - k)));
    app.rig.shake(mine ? 0.12 : 0.05);
    const rival = this.table.rival;
    if (mine) {
      // Our own view topples to the floor.
      void tweens.to(1.0, (k) => {
        app.rig.offset.set(-0.4 * k, -1.05 * ease.inQuad(k), 0.25 * k);
        app.rig.targetOffset.set(0, -1.6 * k, 1.2 * k);
      }, { ease: ease.inCubic });
      audio.play('thud', { at: 0.85 });
      void tweens.to(1.6, (k) => (app.gfx.grade.u('uFade').value = k * 0.9), { delay: 0.5 });
      this.hand.lowered = 3;
      await tweens.wait(1.3);
    } else if (rival) {
      const r0 = rival.root.position.clone();
      const chair = this.table.rivalChair();
      const c0 = chair?.rotation.clone();
      const cp0 = chair?.position.clone();
      // The rival's cards scatter onto the table.
      this.table.rivalHand.splice(0).forEach((c, i) => {
        const p = this.table.pilePos.clone().add(V(0.35 + Math.random() * 0.25, 0.002 + i * 0.001, (Math.random() - 0.5) * 0.7));
        const q = Q_FLAT_DOWN.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.random() * 6));
        void this.fly(c.root, () => ({ p, q, s: 1 }), 0.5 + Math.random() * 0.3, { arc: 0.15 });
      });
      await tweens.to(0.75, (k) => {
        rival.root.position.set(r0.x + 1.25 * k, r0.y + Math.sin(k * Math.PI) * 0.45 - 0.5 * ease.inQuad(k), r0.z + 0.25 * k);
        rival.root.rotation.z = -1.65 * ease.outCubic(k);
        rival.eyesOn = 1 - k;
        if (chair && c0 && cp0) {
          chair.rotation.z = c0.z - 1.4 * ease.inQuad(k);
          chair.position.x = cp0.x + 0.35 * k;
        }
      }, { ease: ease.outQuad });
      audio.play('thud');
      app.rig.shake(0.06);
      rival.root.visible = false;
    }
    // 3. Light returns.
    all.forEach((f, i) => setTimeout(() => tv.flames.setLit(f, tv.sign.flames.includes(f) ? 0 : 1), 300 + (i / all.length) * 900));
    audio.play('ignite', { at: 0.3 });
    if (!mine) void tweens.to(1.2, (k) => tv.setLightLevel(0.05 + k * 0.75));
    await tweens.wait(0.6);
    // 4. The poster.
    const poster = h(
      'div',
      { class: 'poster' },
      h('h2', {}, 'Missing!'),
      h('div', {
        class: 'photo',
        html: `<svg viewBox="0 0 100 110"><path d="M54 8C38 14 26 34 26 54c0 14 6 22 12 26h24c6-4 12-12 12-26 0-20-10-36-20-46z" fill="#6a4a2a" opacity=".85"/><path d="M14 110c4-18 16-28 30-30h12c14 2 26 12 30 30z" fill="#6a4a2a" opacity=".85"/><ellipse cx="50" cy="55" rx="14" ry="17" fill="#2a1a0e"/></svg>`,
      }),
      h('div', { class: 'name' }, seat.name),
      h('div', { class: 'epithet' }, seat.epithet),
      h('div', { class: 'seen' }, 'Last seen near the Hooded Hand tavern'),
      h('div', { class: 'stamp' }, mine ? 'You' : 'Slain')
    );
    this.ui.append(poster);
    audio.play('paper');
    audio.play('thud', { vol: 0.4, at: 0.05 });
    await tweens.wait(3.0);
    poster.style.transition = 'opacity .5s';
    poster.style.opacity = '0';
    setTimeout(() => poster.remove(), 600);
    tv.flames.uniforms.uTint.value.setRGB(1, 1, 1);
    void tweens.to(0.6, (k) => {
      app.gfx.grade.u('uDanger').value *= 1 - k;
      app.gfx.chroma.offset.set(0, 0);
    });
    await tweens.wait(0.5);
  }

  private onOver(winner: PlayerId | null, stats: Record<PlayerId, PlayerStats>): void {
    this.phase = 'over';
    this.result = { winner, stats };
    void this.showResults();
  }

  private async showResults(): Promise<void> {
    const r = this.result!;
    const won = r.winner === this.me;
    const st = r.stats[this.me];
    const lines: Array<[string, number]> = [['Sat at the table', 10]];
    if (st.played) lines.push([`Played cards ×${st.played}`, st.played * 5]);
    if (st.parries) lines.push([`Parries ×${st.parries}`, st.parries * 5]);
    if (st.rescues) lines.push([`Survived the Hand ×${st.rescues}`, st.rescues * 15]);
    if (won) lines.push([this.tut ? 'Finished the lesson' : 'Outlasted your rival', this.tut ? 40 : 60]);
    const total = lines.reduce((s, [, v]) => s + v, 0);
    const before = profile.coins;
    saveProfile({
      coins: before + total,
      wins: profile.wins + (won && !this.tut ? 1 : 0),
      losses: profile.losses + (!won && !this.tut ? 1 : 0),
      tutorialDone: profile.tutorialDone || (this.tut && won),
    });
    this.nav.hud.showProfile(true);
    this.nav.hud.bumpCoins(before, before + total);
    audio.play(won ? 'win' : 'lose');
    if (!won) {
      // Bring the camera back up off the floor behind the panel.
      void tweens.to(1.2, (k) => {
        this.app.rig.offset.multiplyScalar(1 - k);
        this.app.rig.targetOffset.multiplyScalar(1 - k);
        this.app.gfx.grade.u('uFade').value = 0.9 * (1 - k) + 0.35 * k;
      });
    }
    const ledger = h(
      'div',
      { class: 'ledger' },
      ...lines.map(([l, v], i) => h('div', { style: `animation-delay:${0.3 + i * 0.18}s` }, h('span', {}, l), h('b', {}, h('i', { class: 'coin-ico' }), '+' + v))),
      h('div', { class: 'total', style: `animation-delay:${0.3 + lines.length * 0.18}s` }, h('span', {}, 'Total'), h('b', {}, h('i', { class: 'coin-ico' }), '+' + total))
    );
    const again = h('button', { class: 'btn-text' }, this.tut ? 'Play for real' : 'Another round');
    again.addEventListener('click', () => {
      audio.play('click');
      this.nav.startMatch(this.tut ? 'original' : this.mode);
    });
    const leave = h('button', { class: 'btn-text' }, 'Leave the table');
    leave.addEventListener('click', () => {
      audio.play('click');
      this.leave();
    });
    const panel = h(
      'div',
      { class: 'scrim' },
      h(
        'div',
        { class: 'panel results' },
        h('h2', {}, won ? (this.tut ? 'Lesson learned' : 'You survived') : 'You were slain'),
        h('p', { class: 'lede' }, won ? (this.tut ? 'You know the ways of the Hand now. Go and win some coin.' : 'Your rival will not be playing again tonight.') : 'The Hooded Hand always collects. Try again?'),
        ledger,
        h('div', { class: 'row' }, leave, again)
      )
    );
    for (let i = 0; i < lines.length + 1; i++) audio.play('coins', { at: 0.35 + i * 0.18, vol: 0.4 });
    this.ui.append(panel);
  }

  private leave(): void {
    if (this.disposed) return;
    void (async () => {
      this.nav.picker.enabled = false;
      await tweens.to(0.6, (k) => (this.app.gfx.grade.u('uFade').value = Math.max(this.app.gfx.grade.u('uFade').value, k)));
      this.nav.app.setScreen(null);
      this.nav.picker.enabled = true;
      this.app.rig.offset.set(0, 0, 0);
      this.app.rig.targetOffset.set(0, 0, 0);
      this.app.rig.snap(this.app.tavern.stations.play);
      this.nav.toPlay();
      audio.startMusic();
      void tweens.to(0.9, (k) => (this.app.gfx.grade.u('uFade').value = 1 - k));
    })();
  }

  // ==================================================================== tutorial

  private tutorial(step: string, d: { player?: PlayerId; card?: Card; target?: PlayerId; cancelled?: boolean } = {}): void {
    if (!this.tut) return;
    const me = this.me;
    const s = this.tutStep;
    const H = (html: string) => this.hint(html);
    switch (step) {
      case 'turn':
        if (this.isMe(this.current) && s === 0) {
          this.tutStep = 1;
          if (this.hoveredOnce) H('During your turn you may play cards. Click the <b>Scrying Orb</b>.');
        } else if (this.isMe(this.current) && s >= 4 && s < 7) {
          this.tutStep = 7;
          H('Cards with the <span class="ico"></span> badge let you choose a mark. Play your <b>Bounty</b> on your rival.');
        } else if (!this.isMe(this.current)) this.hint(null);
        break;
      case 'hovered':
        if (s <= 1 && this.isMe(this.current)) H('During your turn you may play cards. Click the <b>Scrying Orb</b>.');
        break;
      case 'scryEnd':
        if (s <= 2) {
          this.tutStep = 3;
          H('Draw from the deck to end your turn. Click the deck.');
        }
        break;
      case 'drew':
        if (s === 3) {
          this.tutStep = 4;
          H('Safe. It is your rival\'s turn now…');
        }
        break;
      case 'play':
        if (d.player !== me && d.card?.type === 'pickpocket') H('Your rival is picking your pocket! <b>Parry</b> can be played at any time. Click it now!');
        else if (d.player !== me && d.card?.type === 'slip') H('Your rival slips away without drawing. The Hooded Hand is still waiting on top…');
        break;
      case 'parry':
        if (d.player === me && d.cancelled) H('Parried! Their trick comes to nothing.');
        if (d.player !== me && d.cancelled) H('Your rival parried your Bounty! Now you must draw to end your turn.');
        break;
      case 'aim':
        H('Choose your mark: click your rival.');
        break;
      case 'resolve':
        if (d.player === me && d.card?.type === 'bounty' && d.cancelled) {
          this.tutStep = 8;
          H('You can draw without playing any cards. Draw… and trust your angel.');
        }
        break;
      case 'doom':
        break;
      case 'rescued':
        if (d.player === me) this.tutStep = 9;
        break;
      case 'hidden':
        if (d.player === me) H('Now pray your rival draws it…');
        break;
    }
  }

  // ==================================================================== frame

  update(t: number, dt: number): void {
    this.table.update(t, dt);
    this.hand.update(dt);
    this.fx.update(dt);
    const now = performance.now();
    // Reaction ring.
    if (this.windowEnd > now) {
      const frac = (this.windowEnd - now) / this.windowLen;
      this.table.setRing(frac, 1);
    }
    // Hourglass.
    if (this.turnEnd && this.turnLen) this.table.hgFrac = clamp((this.turnEnd - now) / this.turnLen, 0, 1);
    else this.table.hgFrac = damp(this.table.hgFrac, 1, 2, dt);
    // Rescue countdown.
    if (this.rescueEnd > now && this.phase === 'rescue') {
      const left = Math.ceil((this.rescueEnd - now) / 1000);
      if (this.countdownEl.textContent !== String(left)) {
        this.countdownEl.textContent = String(left);
        if (left <= 10) audio.play('tick', { vol: 1.5 });
      }
      this.countdownEl.style.opacity = left <= 30 ? '0.9' : '0';
      this.countdownEl.style.transform = `translate(-50%,-50%) scale(${0.55 + 0.04 * Math.sin(t * 8)})`;
      this.placeCountdown(-0.17);
    } else if (this.phase !== 'rescue' && this.countdownEl.style.opacity !== '0' && !this.processing) {
      this.countdownEl.style.opacity = '0';
    }
    // Keep a held doom card following the camera while we look around.
    this.refreshAffordancesLight();
  }

  /** Put the countdown numeral next to (dx world units left of) the doom card on screen. */
  private placeCountdown(dx: number): void {
    const d = this.doomMesh;
    if (!d) {
      this.countdownEl.style.left = '50%';
      this.countdownEl.style.top = '45%';
      return;
    }
    const cam = this.app.gfx.camera;
    const v = d.root.getWorldPosition(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    v.addScaledVector(right, dx).project(cam);
    this.countdownEl.style.left = `${((v.x + 1) / 2) * 100}%`;
    this.countdownEl.style.top = `${((1 - v.y) / 2) * 100}%`;
  }

  private lastAff = 0;
  private refreshAffordancesLight(): void {
    const now = performance.now();
    if (now - this.lastAff < 200) return;
    this.lastAff = now;
    this.table.deckGlowTarget = this.canDraw() ? 1 : 0;
  }

  dispose(): void {
    this.disposed = true;
    this.t.dispose();
    for (const u of this.picks.values()) u();
    for (const u of this.staticPicks) u();
    this.aimPick?.();
    removeEventListener('keydown', this.keyHandler);
    this.app.gfx.renderer.domElement.removeEventListener('contextmenu', this.onContext);
    this.hand.dispose();
    this.table.dispose();
    this.fx.group.parent?.remove(this.fx.group);
    // Remove stray cards left in the scene.
    const strays: THREE.Object3D[] = [];
    this.app.gfx.scene.children.forEach((c) => {
      if (c.children.length === 2 && (c.children[0] as THREE.Mesh).geometry?.type === 'PlaneGeometry' && c !== this.table.group) strays.push(c);
    });
    for (const s of strays) this.app.gfx.scene.remove(s);
    this.doomMesh?.dispose();
    this.scryMeshes.forEach((c) => c.dispose());
    this.ui.remove();
    const g = this.app.gfx.grade;
    g.u('uDanger').value = 0;
    g.u('uHoly').value = 0;
    this.app.gfx.chroma.offset.set(0, 0);
    this.app.tavern.flames.uniforms.uTint.value.setRGB(1, 1, 1);
    this.app.tavern.setLightLevel(1);
    [...this.app.tavern.tableCandleFlames, ...this.app.tavern.chandelierFlames].forEach((f) => this.app.tavern.flames.setLit(f, 1));
    this.app.rig.fovKick = 0;
    this.app.rig.sway = 1;
    this.nav.hud.showLeave(false);
    this.nav.hud.onLeave = undefined;
    tweens.scale = 1;
  }
}
