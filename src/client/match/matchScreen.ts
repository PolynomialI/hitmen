import * as THREE from 'three';
import { CARD_DEFS, type Card, type CardType } from '../../shared/cards';
import { EMOTE_COOLDOWN_MS, EMOTES, emoteText, type EmoteId } from '../../shared/emotes';
import type { GameEvent, GameMode, PendingInfo, PlayerId, PlayerStats, SeatInfo, SyncInfo } from '../../shared/types';
import type { App, Screen } from '../app';
import { audio } from '../audio/audio';
import type { Pickable } from '../core/picker';
import { clamp, damp, ease, tweens } from '../core/tween';
import type { OnlineSession } from '../net/online';
import { LocalTransport, WsTransport, type Transport } from '../net/transport';
import type { Nav } from '../screens/menus';
import { h, icon } from '../ui/dom';
import { toast } from '../ui/hud';
import { profile } from '../ui/profile';
import { lookFromProfile } from '../cosmetics/apply';
import type { Station } from '../world/tavern';
import { CardMesh } from './cardMesh';
import { Fx } from './fx';
import { HandView } from './handView';
import { showResults } from './results';
import { Q_FACE_PLAYER, Q_FLAT_DOWN, Q_FLAT_UP, TableView, TEAM_COLORS } from './tableView';

type XForm = { p: THREE.Vector3; q: THREE.Quaternion; s: number };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface MatchOptions {
  mode: GameMode;
  rivals?: number;
  rivalIndex?: number;
  /** Watch a table of bots instead of playing. */
  spectate?: boolean;
  /** An online table (the server runs the match). */
  online?: OnlineSession;
}

type AimKind = { kind: 'play'; card: Card; effect: CardType } | { kind: 'misdirect'; card: Card };

const HOSTILE: CardType[] = ['bounty', 'warband', 'pickpocket', 'mistletoe'];

export class MatchScreen implements Screen {
  readonly app: App;
  private t!: Transport;
  readonly table: TableView;
  readonly hand: HandView;
  readonly fx: Fx;
  me: PlayerId = '';
  seats: SeatInfo[] = [];
  private queue: GameEvent[] = [];
  processing = false;
  sync: SyncInfo | null = null;
  current: PlayerId | null = null;
  private turnsLeft = 1;
  phase: 'intro' | 'turn' | 'reaction' | 'scry' | 'rescue' | 'hide' | 'give' | 'over' = 'intro';
  pending: PendingInfo | null = null;
  private pendingMesh: CardMesh | null = null;
  private claims: Array<{ player: PlayerId; mesh: CardMesh }> = [];
  doomMesh: CardMesh | null = null;
  doomed: PlayerId | null = null;
  give: { from: PlayerId; to: PlayerId } | null = null;
  private scryMeshes: CardMesh[] = [];
  aiming: AimKind | null = null;
  private windowEnd = 0;
  private windowLen = 1;
  private turnEnd = 0;
  private turnLen = 0;
  private rescueEnd = 0;
  private giveEnd = 0;
  private picks = new Map<CardMesh, () => void>();
  private staticPicks: Array<() => void> = [];
  private aimPicks: Array<() => void> = [];
  result: { winner: PlayerId | null; winners: PlayerId[]; stats: Record<PlayerId, PlayerStats> } | null = null;
  private disposed = false;
  private leaving = false;
  /** Online: events still to replay instantly (rebuilding the match after a reload). */
  private replayLeft = 0;
  private started = false;
  private restarting = false;
  private offSession: (() => void) | null = null;
  private emoteReady = 0;
  private emoteList: HTMLElement | null = null;
  /** What the scene held before this match (anything else is ours to remove on dispose). */
  private sceneBefore: Set<THREE.Object3D>;
  private tableStation: Station;
  private aimStation: Station;
  readonly opts: MatchOptions;
  /** Rivals slain while the player was still alive. */
  outlasted = 0;
  myScried = 0;
  myMarked = 0;
  private iAmDead = false;
  // UI
  readonly ui: HTMLElement;
  private hintEl: HTMLElement;
  private previewEl: HTMLElement;
  private previewImg: HTMLImageElement;
  private previewTitle: HTMLElement;
  private previewText: HTMLElement;
  private actionEl: HTMLElement;
  private countdownEl: HTMLElement;
  private badgeEl: HTMLElement;
  private statusEl: HTMLElement;
  private hideUi: HTMLElement | null = null;
  private previewLock = 0;
  private hintTimer: number | null = null;
  // Tutorial
  private tut: boolean;
  private tutStep = 0;
  private hoveredOnce = false;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(readonly nav: Nav, opts: MatchOptions | GameMode) {
    this.opts = typeof opts === 'string' ? { mode: opts } : opts;
    const mode = this.opts.mode;
    this.app = nav.app;
    this.tut = mode === 'tutorial';
    const app = this.app;
    const tv = app.tavern;
    const k = this.opts.spectate ? Math.max(2, Math.min(5, this.opts.rivals ?? 4)) : mode === 'tutorial' || mode === 'ranked' ? 1 : mode === 'teams' ? ((this.opts.rivals ?? 3) >= 5 ? 5 : 3) : Math.max(1, Math.min(5, this.opts.rivals ?? 1));
    this.tableStation =
      k === 1
        ? tv.stations.table
        : k === 2
          ? { pos: V(2.05, 1.7, 0.6), target: V(6.2, 0.85, 0.6), look: [0.45, 0.16, 0.035], fov: 60 }
          : { pos: V(2.0, 1.85, 0.6), target: V(6.2, 0.75, 0.6), look: [0.5, 0.16, 0.035], fov: 62 };
    this.aimStation = k === 1 ? { pos: V(3.4, 2.05, 0.6), target: V(5.25, 0.82, 0.6), look: [0.06, 0.04], fov: 52 } : { pos: V(3.05, 2.65, 0.6), target: V(4.75, 0.5, 0.6), look: [0.06, 0.04], fov: 60 };
    // Opening shot: high above the table, then settle into the seat.
    app.rig.snap({ pos: V(3.4, 3.2, 2.6), target: V(4.6, 0.8, 0.4), look: [0.05, 0.03], fov: 55 });
    app.rig.lookScale = 1;
    this.sceneBefore = new Set(app.gfx.scene.children);
    app.gfx.scene.add(app.gfx.camera);
    nav.hud.showProfile(false);
    nav.hud.showLeave(true);
    nav.hud.onLeave = () => this.leave();

    this.table = new TableView(app);
    tv.setFestive(mode === 'winter');
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
    this.countdownEl = h('div', { class: 'countdown' });
    this.badgeEl = h('div', { class: 'my-badge' });
    this.statusEl = h('div', { class: 'status-strip' });
    this.ui = h('div', { class: 'layer' }, this.statusEl, this.hintEl, this.previewEl, this.actionEl, this.countdownEl, this.badgeEl);
    nav.layer.append(this.ui);

    this.staticPicks.push(
      nav.picker.add({
        object: this.table.deckHit,
        priority: 2,
        onHover: (on) => on && this.canDraw() && audio.play('hover', { vol: 0.6 }),
        onClick: () => this.tryDraw(),
        enabled: () => !this.aiming,
      }),
      nav.picker.add({
        object: this.table.selfMarker,
        priority: 0,
        enabled: () => !!this.aiming && this.table.selfMarkerOn,
        onHover: (on) => (this.table.selfMarkerHover = on ? 1 : 0),
        onClick: () => this.confirmTarget(this.me),
      })
    );

    this.keyHandler = (e) => {
      if (e.key === 'Escape' && this.aiming) this.cancelAim();
      if ((e.key === 'd' || e.key === ' ') && !this.aiming) this.tryDraw();
      if (this.emoteList && e.key >= '1' && e.key <= String(EMOTES.length)) this.sendEmote(EMOTES[Number(e.key) - 1].id);
      if (e.key === 'Escape') this.emoteList?.classList.add('out');
    };
    addEventListener('keydown', this.keyHandler);
    app.gfx.renderer.domElement.addEventListener('contextmenu', this.onContext);

    const online = this.opts.online;
    this.t = online
      ? new WsTransport(online)
      : new LocalTransport({ mode, playerName: profile.name, rivals: k, rivalIndex: this.opts.rivalIndex, look: lookFromProfile(), spectate: this.opts.spectate });
    this.me = this.t.me;
    this.t.onEvent((ev, replay) => {
      if (ev.e === 'start' && this.started) {
        // A new round began at this online table while the results were showing: sit down afresh.
        if (!this.restarting) {
          this.restarting = true;
          this.nav.startMatch({ ...this.opts });
        }
        return false;
      }
      if (ev.e === 'start') this.started = true;
      if (replay) this.replayLeft++;
      this.queue.push(ev);
      void this.pump();
      return true;
    });
    if (online) this.watchSession(online);
    this.t.onEmote((from, id) => this.showEmote(from, id));
    if (!this.opts.spectate) this.buildEmotes();

    void (async () => {
      tv.setLightLevel(1);
      await tweens.to(0.9, (q) => (app.gfx.grade.u('uFade').value = 1 - q), { ease: ease.outCubic });
      audio.startMusic();
      this.t.start();
    })();
  }

  // ==================================================================== emotes

  /** The speech button beside Sound/Leave: a short list of phrases to call across the table (keys 1-6). */
  private buildEmotes(): void {
    const list = h('div', { class: 'emote-list out' });
    EMOTES.forEach((e, i) => {
      const b = h('button', { class: 'emote-opt' }, h('i', {}, String(i + 1)), e.text);
      b.addEventListener('pointerenter', () => audio.play('hover', { vol: 0.4 }));
      b.addEventListener('click', () => {
        this.sendEmote(e.id);
        list.classList.add('out');
      });
      list.append(b);
    });
    const btn = h('button', { class: 'icon-btn emote-btn', title: 'Call across the table (1-6)', 'aria-label': 'Call across the table' }, icon('speech'));
    btn.addEventListener('click', () => {
      audio.play('click');
      list.classList.toggle('out');
    });
    this.emoteList = list;
    this.ui.append(h('div', { class: 'emote-wrap' }, btn, list));
  }

  private sendEmote(id: EmoteId): void {
    const now = performance.now();
    if (now < this.emoteReady) return;
    this.emoteReady = now + EMOTE_COOLDOWN_MS;
    this.t.emote(id);
    this.showEmote(this.me, id);
  }

  /** A speech scroll over the speaker's head (yours rises above your hand). */
  showEmote(from: PlayerId, id: EmoteId): void {
    if (tweens.instant || this.disposed) return;
    let el: HTMLElement;
    if (this.isMe(from)) el = h('div', { class: 'emote-bubble mine' }, emoteText(id));
    else {
      const v = this.seatHead(from).add(V(0, 0.32, 0)).project(this.app.gfx.camera);
      if (v.z > 1) return;
      const x = Math.min(88, Math.max(12, ((v.x + 1) / 2) * 100));
      const y = Math.max(14, ((1 - v.y) / 2) * 100);
      el = h('div', { class: 'emote-bubble', style: `left:${x}%;top:${y}%` }, h('b', {}, this.nameOf(from)), emoteText(id));
    }
    this.ui.append(el);
    audio.play('paper', { vol: 0.45 });
    setTimeout(() => el.classList.add('out'), 2700);
    setTimeout(() => el.remove(), 3200);
  }

  /** Online: connection state, other players dropping out and coming back, the table closing. */
  private watchSession(s: OnlineSession): void {
    const chip = h('div', { class: 'net-chip out' }, 'The connection wavers… reconnecting');
    this.ui.append(chip);
    this.offSession = s.on({
      state: (st) => chip.classList.toggle('out', st !== 'reconnecting'),
      presence: (id, connected) => {
        if (id === this.me || this.phase === 'over') return;
        const n = this.nameOf(id);
        toast(this.nav.layer, connected ? `${n} is back` : `${n} lost their connection`, connected ? undefined : 'Their seat is kept for a while.');
      },
      error: (m) => toast(this.nav.layer, m),
      closed: (m) => {
        if (this.disposed || this.restarting) return;
        if (m) toast(this.nav.layer, 'You left the table', m);
        this.leave();
      },
    });
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
      // Rebuilding after a reload: show the match so far at once, silently.
      const instant = this.replayLeft > 0;
      if (instant) this.replayLeft--;
      tweens.instant = instant;
      audio.suppressed = instant;
      tweens.scale = this.queue.length > 8 ? 2.6 : this.queue.length > 3 ? 1.6 : 1;
      try {
        await this.handle(ev);
      } catch (e) {
        console.error('event failed', ev.e, e);
      }
      this.applySync(ev.sync);
    }
    tweens.scale = 1;
    tweens.instant = false;
    audio.suppressed = false;
    this.processing = false;
    this.refreshAffordances();
  }

  private applySync(s: SyncInfo): void {
    this.sync = s;
    if (!this.doomMesh || this.phase !== 'rescue') this.table.setDeckCount(s.deck);
    this.table.setPlaques(s.deck > 0 ? s.handsInDeck / s.deck : 0, s.handsInDeck, s.alive.length);
    audio.tension = clamp(s.deck > 0 ? (s.handsInDeck / s.deck) * 2 : 0, 0, 1);
    for (const sv of this.table.seats.values()) sv.wardOn = s.wards.includes(sv.info.id) && sv.alive;
    this.hand.setLocked(s.lock?.type ?? null);
    this.updateStatus();
  }

  private updateStatus(): void {
    const s = this.sync;
    if (!s) return;
    const bits: string[] = [];
    if (s.lock) bits.push(`<span class="pill lock">⛓ ${CARD_DEFS[s.lock.type].name} shackled · ${s.lock.turns}</span>`);
    if (s.wards.includes(this.me)) bits.push('<span class="pill ward">🛡 You are warded</span>');
    if (this.seats.length > 2) bits.push(`<span class="pill dir">${s.dir === 1 ? '↻' : '↺'} Order of play</span>`);
    const myTeam = this.seats.find((x) => x.id === this.me)?.team;
    if (this.opts.spectate) bits.push('<span class="pill">👁 Spectating</span>');
    if (myTeam != null) bits.push(`<span class="pill team" style="border-color:${TEAM_COLORS[myTeam]}">Team ${myTeam === 0 ? 'Crimson' : 'Azure'}</span>`);
    this.statusEl.innerHTML = bits.join('');
  }

  isMe(id: PlayerId | null | undefined): boolean {
    return id === this.me;
  }

  nameOf(id: PlayerId | undefined): string {
    if (id === this.me) return 'You';
    return this.seats.find((s) => s.id === id)?.name ?? 'Someone';
  }

  private teamOf(id: PlayerId): number | undefined {
    return this.seats.find((s) => s.id === id)?.team;
  }

  private isFriend(id: PlayerId): boolean {
    if (id === this.me) return true;
    const t = this.teamOf(this.me);
    return t != null && t === this.teamOf(id);
  }

  // ==================================================================== geometry helpers

  camX(x: number, y: number, z: number, s = 1, faceAway = false): XForm {
    const cam = this.app.gfx.camera;
    cam.updateMatrixWorld();
    const p = V(x, y, -z).applyMatrix4(cam.matrixWorld);
    const q = cam.quaternion.clone();
    if (faceAway) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
    return { p, q, s };
  }

  fly(obj: THREE.Object3D, to: () => XForm, dur: number, o: { arc?: number; ease?: (k: number) => number; spin?: number } = {}): Promise<void> {
    const p0 = obj.position.clone();
    const q0 = obj.quaternion.clone();
    const s0 = obj.scale.x;
    return tweens.to(
      dur,
      (k) => {
        const t = to();
        obj.position.lerpVectors(p0, t.p, k);
        obj.position.y += Math.sin(k * Math.PI) * (o.arc ?? 0);
        obj.quaternion.slerpQuaternions(q0, t.q, k);
        if (o.spin) obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.sin(k * Math.PI) * o.spin));
        obj.scale.setScalar(s0 + (t.s - s0) * k);
      },
      { ease: o.ease ?? ease.inOutCubic }
    );
  }

  newCard(card: Card | null, at: XForm, variant: 'table' | 'hand' = 'table'): CardMesh {
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

  private seatHead(id: PlayerId): THREE.Vector3 {
    const sv = this.table.seat(id);
    if (!sv) return this.camX(0, 0, 0.5).p;
    return sv.figure.root.position.clone().add(V(0, 0.75, 0));
  }

  /** Body language: every other rival turns to look at a point (or back to the table). */
  private allLook(at: THREE.Vector3 | null, except?: PlayerId, lean = 0): void {
    for (const sv of this.table.seats.values()) {
      if (!sv.alive || sv.info.id === except) continue;
      sv.figure.lookToward(at);
      sv.figure.lean = lean;
    }
  }

  /** Pull a card out of a rival's hand (or make one at their hand) into the scene. */
  private takeFromSeat(id: PlayerId, card: Card | null): CardMesh {
    const sv = this.table.seat(id)!;
    let cm = card ? sv.hand.find((c) => c.card?.id === card.id) : undefined;
    if (cm) sv.hand.splice(sv.hand.indexOf(cm), 1);
    else cm = sv.hand.pop();
    if (!cm) cm = this.newCard(null, this.table.handSlot(id, 0, 1));
    if (card) cm.setCard(card);
    void this.table.layoutSeat(id, 0.25);
    return cm;
  }

  private async giveToSeat(id: PlayerId, cm: CardMesh, dur = 0.55, faceUp = false): Promise<void> {
    const sv = this.table.seat(id)!;
    const n = sv.hand.length + 1;
    if (!faceUp && !sv.mate) {
      // Rivals hold cards with backs toward us; the face no longer matters to us.
    }
    await this.fly(cm.root, () => this.table.handSlot(id, n - 1, n), dur, { arc: 0.12 });
    if (!sv.mate) cm.setCard(null);
    sv.hand.push(cm);
    void this.table.layoutSeat(id, 0.2);
  }

  private registerHandCard(cm: CardMesh): void {
    const p: Pickable = {
      object: cm.face,
      priority: -1,
      enabled: () => !this.aiming && !this.hideUi && this.hand.cards.includes(cm),
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

  addToHand(cm: CardMesh): void {
    this.hand.add(cm);
    this.registerHandCard(cm);
  }

  takeFromHand(id: number): CardMesh | null {
    const cm = this.hand.find(id);
    if (!cm) return null;
    this.unregister(cm);
    return this.hand.take(id, this.app.gfx.scene);
  }

  /** Where a card leaves from / goes to for a given player. */
  private takeFrom(player: PlayerId, card: Card | null): CardMesh {
    if (this.isMe(player)) {
      const cm = card ? this.takeFromHand(card.id) : null;
      if (cm) return cm;
      return this.newCard(card, this.camX(0, -0.2, 0.55, 1));
    }
    return this.takeFromSeat(player, card);
  }

  // ==================================================================== UI helpers

  showPreview(card: Card | CardType, lockMs = 0, extra?: string): void {
    const type = typeof card === 'string' ? card : card.type;
    const d = CARD_DEFS[type];
    this.previewTitle.textContent = d.name;
    this.previewImg.src = this.app.cards.urls[type];
    let text = d.text;
    if (type === 'glass' && this.sync?.last) text = `Copies the last card played: ${CARD_DEFS[this.sync.last].name}.` + (this.sync.last === 'angel' ? ' It can save you from the Hooded Hand!' : '');
    if (this.sync?.lock?.type === type) text = `Shackled for ${this.sync.lock.turns} more turn${this.sync.lock.turns === 1 ? '' : 's'}. ` + text;
    this.previewText.textContent = extra ?? text;
    this.previewEl.classList.remove('out');
    if (lockMs) this.previewLock = performance.now() + lockMs;
  }

  hidePreview(): void {
    if (performance.now() < this.previewLock) {
      setTimeout(() => !this.hand.hovered && this.hidePreview(), this.previewLock - performance.now() + 20);
      return;
    }
    this.previewEl.classList.add('out');
  }

  hint(html: string | null, ms = 0): void {
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
      setTimeout(show, 220);
    } else show();
    if (ms) this.hintTimer = window.setTimeout(() => this.hintEl.classList.add('out'), ms);
  }

  banner(text: string, color?: string): void {
    if (tweens.instant) return;
    const el = h('div', { class: 'banner-title', style: color ? `color:${color};text-shadow:0 0 30px ${color}99,0 4px 0 #1a0a04` : '' }, text);
    this.ui.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  /** Small floating caption over a 3D point (who did what). */
  caption(at: THREE.Vector3, text: string, color = '#f6ead0'): void {
    if (tweens.instant) return;
    const v = at.clone().project(this.app.gfx.camera);
    if (v.z > 1) return;
    const el = h('div', { class: 'caption', style: `left:${((v.x + 1) / 2) * 100}%;top:${((1 - v.y) / 2) * 100}%;color:${color}` }, text);
    this.ui.append(el);
    setTimeout(() => el.remove(), 2200);
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
      this.badgeEl.textContent = `Bounty on your head: take ${turns} turns`;
      this.badgeEl.style.opacity = '1';
    } else this.badgeEl.style.opacity = '0';
  }

  // ==================================================================== affordances & input

  idle(): boolean {
    return !this.processing && this.queue.length === 0 && !this.disposed;
  }

  canDraw(): boolean {
    return this.idle() && this.phase === 'turn' && this.isMe(this.current) && !this.aiming;
  }

  private locked(t: CardType): boolean {
    return this.sync?.lock?.type === t;
  }

  private canReact(): boolean {
    return this.phase === 'reaction' && !!this.pending;
  }

  private refreshAffordances(): void {
    this.table.deckGlowTarget = this.canDraw() ? 1 : 0;
    this.hand.highlight.clear();
    const mark = (t: CardType) => this.hand.cards.forEach((c) => c.card?.type === t && !this.locked(t) && this.hand.highlight.add(c.card.id));
    if (this.phase === 'rescue' && this.isMe(this.doomed)) {
      mark('angel');
      if (this.sync?.last === 'angel') mark('glass');
    }
    if (this.phase === 'give' && this.give?.from === this.me) this.hand.cards.forEach((c) => c.card && this.hand.highlight.add(c.card.id));
    const p = this.pending;
    if (this.canReact() && p) {
      const againstUs = p.target != null && this.isFriend(p.target) && !this.isFriend(p.player) && HOSTILE.includes(p.effect) && !p.cancelled;
      const ourCancelled = p.cancelled && this.isFriend(p.player);
      if (againstUs || ourCancelled) {
        mark('parry');
        mark('breath');
      }
      if (againstUs) mark('misdirect');
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
    if (this.locked(card.type)) return this.nudge(card, `${d.name} is shackled for now.`);
    // Hand a card over (Pickpocket).
    if (this.phase === 'give' && this.give?.from === this.me) {
      audio.play('click');
      await this.t.send({ t: 'give', cardId: card.id });
      return;
    }
    // Rescue (Angel, or a Looking Glass copying one).
    if (this.phase === 'rescue' && this.isMe(this.doomed)) {
      if (card.type === 'angel' || (card.type === 'glass' && this.sync?.last === 'angel')) {
        await this.t.send({ t: 'rescue', cardId: card.id });
        return;
      }
      return this.nudge(card, 'Only an Angel can save you now.');
    }
    if (card.type === 'angel') return this.nudge(card, 'The Angel only answers when the Hooded Hand comes for you.');
    // Reactions.
    if (d.timing === 'reaction') {
      if (!this.canReact() || !this.pending) return this.nudge(card, 'Play this the moment someone else plays a card.');
      if (card.type === 'misdirect') {
        const p = this.pending;
        if (!HOSTILE.includes(p.effect) || p.cancelled) return this.nudge(card, 'Nothing to misdirect.');
        const options = this.seats.filter((s) => s.id !== p.target && s.id !== this.me && this.sync?.alive.includes(s.id)).map((s) => s.id);
        if (!options.length) return this.nudge(card, 'Nobody else to blame.');
        if (options.length === 1) {
          await this.t.send({ t: 'react', cardId: card.id, targetId: options[0] });
          return;
        }
        void this.t.send({ t: 'hold' });
        this.enterAim({ kind: 'misdirect', card }, options, false);
        return;
      }
      if (card.type === 'privateer' && this.pending.player === this.me) return this.nudge(card, 'You cannot rob yourself.');
      await this.t.send({ t: 'react', cardId: card.id });
      return;
    }
    if (!this.idle() || this.phase !== 'turn') return this.nudge(card, 'Wait a moment…');
    if (d.timing === 'turn' && !this.isMe(this.current)) return this.nudge(card, 'It is not your turn.');
    if (!d.playable) return;
    let effect: CardType = card.type;
    if (card.type === 'glass') {
      const last = this.sync?.last;
      if (!last || ['hand', 'angel', 'glass', 'parry', 'breath', 'misdirect', 'privateer'].includes(last)) return this.nudge(card, 'Nothing worth copying yet.');
      effect = last;
    }
    if (CARD_DEFS[effect].targeted) {
      const alive = this.sync?.alive ?? [];
      let options: PlayerId[];
      let self = false;
      if (effect === 'aegis') {
        options = alive.filter((id) => id !== this.me && this.isFriend(id));
        self = true;
      } else options = alive.filter((id) => !this.isFriend(id));
      if (!options.length && !self) return this.nudge(card, 'Nobody to mark.');
      if (options.length === 1 && !self && this.seats.length > 2) {
        // Single choice: still let the player confirm by aiming (feels deliberate).
      }
      this.enterAim({ kind: 'play', card, effect }, options, self);
      return;
    }
    audio.play('click', { vol: 0.5 });
    const r = await this.t.send({ t: 'play', cardId: card.id });
    if (!r.ok) this.nudge(card, r.err === 'nothing to copy' ? 'Nothing worth copying yet.' : 'Not now.');
  }

  private nudge(card: Card, msg: string): void {
    const cm = this.hand.find(card.id);
    if (cm) {
      const x0 = cm.root.position.x;
      void tweens.to(0.35, (k) => (cm.root.position.x = x0 + Math.sin(k * Math.PI * 5) * 0.004 * (1 - k)), { ease: ease.linear });
    }
    if (!this.tut) this.hint(msg, 1800);
  }

  private enterAim(kind: AimKind, options: PlayerId[], self: boolean): void {
    this.aiming = kind;
    audio.play('whoosh', { vol: 0.6 });
    this.hand.lowered = 1;
    this.hand.hovered = null;
    this.hidePreview();
    this.table.setMarkers(options, self);
    this.app.rig.sway = 0.3;
    if (kind.kind === 'play') void this.app.rig.glide(this.aimStation, 0.75, 0.05);
    const what = kind.kind === 'misdirect' ? 'Choose who takes the blame.' : kind.effect === 'aegis' ? 'Choose who to ward.' : 'Choose your mark.';
    this.hint(what);
    this.tutorial('aim');
    for (const id of options) {
      const sv = this.table.seat(id)!;
      const onHover = (on: boolean) => (sv.markerHover = on ? 1 : 0);
      this.aimPicks.push(
        this.nav.picker.add({ object: sv.marker, priority: 0, enabled: () => !!this.aiming, onHover, onClick: () => this.confirmTarget(id) }),
        this.nav.picker.add({ object: sv.figure.root, priority: 0, enabled: () => !!this.aiming, onHover, onClick: () => this.confirmTarget(id) })
      );
    }
  }

  private exitAim(): void {
    const wasPlay = this.aiming?.kind === 'play';
    this.aiming = null;
    this.aimPicks.forEach((u) => u());
    this.aimPicks = [];
    this.table.setMarkers([], false);
    for (const sv of this.table.seats.values()) sv.markerHover = 0;
    this.table.selfMarkerHover = 0;
    this.hand.lowered = 0;
    this.app.rig.sway = 1;
    if (wasPlay) void this.app.rig.glide(this.tableStation, 0.7, 0.05);
  }

  private cancelAim(): void {
    this.exitAim();
    this.hint(null);
  }

  private async confirmTarget(id: PlayerId): Promise<void> {
    const a = this.aiming;
    if (!a) return;
    this.exitAim();
    this.hint(null);
    audio.play('click');
    const r = a.kind === 'misdirect' ? await this.t.send({ t: 'react', cardId: a.card.id, targetId: id }) : await this.t.send({ t: 'play', cardId: a.card.id, targetId: id });
    if (!r.ok) this.hint('Too late.', 1500);
  }

  // ==================================================================== event handlers

  private async handle(ev: GameEvent): Promise<void> {
    const dur = ev.dur / 1000;
    switch (ev.e) {
      case 'start':
        return this.onStart(ev.seats);
      case 'deal':
        return this.onDeal(ev.to, ev.card, dur);
      case 'intro':
        return this.onIntro();
      case 'turn':
        return this.onTurn(ev.player, ev.turnsLeft, ev.ms);
      case 'play':
        return this.onPlay(ev.player, ev.card, ev.effect, ev.target);
      case 'window':
        return this.onWindow(ev.ms);
      case 'parry':
        return this.onParry(ev.player, ev.card, ev.cancelled, ev.burned);
      case 'redirect':
        return this.onRedirect(ev.player, ev.card, ev.target);
      case 'privateer':
        return this.onPrivateer(ev.player, ev.card);
      case 'resolve':
        return this.onResolve(ev.player, ev.card, ev.effect, ev.cancelled);
      case 'burn':
        return this.onBurn(ev.card);
      case 'copy':
        return this.onCopy(ev.player, ev.card);
      case 'pass':
        return this.onPass(ev.from, ev.to, ev.card);
      case 'scry':
        return this.onScry(ev.player, ev.cards, ev.ms);
      case 'scryEnd':
        return this.onScryEnd();
      case 'shuffle':
        return this.onShuffle(ev.by);
      case 'reveal':
        return this.onReveal(ev.card);
      case 'givePrompt':
        return this.onGivePrompt(ev.from, ev.to, ev.ms);
      case 'steal':
        return this.onSteal(ev.from, ev.to, ev.card);
      case 'owed':
        return this.onOwed(ev.player, ev.by, ev.turnsLeft);
      case 'reverse':
        return this.onReverse(ev.dir);
      case 'lock':
        return this.onLock(ev.player, ev.type, ev.turns);
      case 'unlock':
        return this.onUnlock(ev.type);
      case 'ward':
        return this.onWard(ev.player, ev.target);
      case 'warded':
        return this.onWarded(ev.target, ev.card);
      case 'retake':
        return this.onRetake(ev.player, ev.card);
      case 'swap':
        return this.onSwap(ev.a, ev.b, ev.handA, ev.handB);
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
        return this.onOver(ev.winner, ev.winners, ev.stats);
    }
  }

  private async onStart(seats: SeatInfo[]): Promise<void> {
    this.seats = seats;
    this.table.setSeats(seats, this.me);
    this.table.setMyCharm(seats.find((x) => x.id === this.me)?.look?.charm);
    const app = this.app;
    void app.rig.glide(this.tableStation, 2.2, 0.1);
    // Introduce everyone around the table.
    const others = seats.filter((s) => s.id !== this.me);
    for (let i = 0; i < others.length; i++) {
      const sv = this.table.seat(others[i].id)!;
      sv.name.scale.setScalar(0.01);
      setTimeout(() => {
        audio.play('ignite', { vol: 0.5 });
        void tweens.to(0.5, (k) => sv.name.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
        sv.figure.lookYaw = 0;
      }, 250 + i * (1400 / Math.max(1, others.length)));
    }
    this.updateStatus();
    await tweens.wait(1.6);
  }

  private async onDeal(to: PlayerId, card: Card | undefined, dur: number): Promise<void> {
    const from = this.deckX();
    const k = Math.min(1, dur / 0.56);
    if (this.isMe(to) && card) {
      const cm = this.newCard(card, from, 'hand');
      audio.play('deal', { vol: 0.8 });
      await this.fly(cm.root, () => this.camX(0, 0.0, 0.5, 1.05), 0.32 * k, { arc: 0.15, ease: ease.outCubic });
      await tweens.wait(0.08 * k);
      this.addToHand(cm);
    } else {
      const cm = this.newCard(null, from);
      audio.play('deal', { vol: 0.45 });
      const sv = this.table.seat(to)!;
      if (card && sv.mate) cm.setCard(card);
      const n = sv.hand.length + 1;
      await this.fly(cm.root, () => this.table.handSlot(to, n - 1, n), 0.42 * k, { arc: 0.12 });
      sv.hand.push(cm);
      void this.table.layoutSeat(to, 0.2);
    }
  }

  private async onIntro(): Promise<void> {
    this.phase = 'intro';
    audio.play('stinger', { vol: 0.45 });
    this.banner(this.opts.mode === 'winter' ? 'A Winter Feast. Mind the Hand.' : this.opts.mode === 'teams' ? 'Protect your own. Doom the rest.' : "Don't draw the Hooded Hand");
    await tweens.to(1.2, (k) => (this.app.rig.fovKick = -Math.sin(k * Math.PI) * 2.5));
    if (this.tut) this.hint('Every card you hold is real. Hover over one to read it.');
    await tweens.wait(1.6);
  }

  private async onTurn(player: PlayerId, turnsLeft: number, ms: number | null): Promise<void> {
    const mine = this.isMe(player);
    const changed = this.current !== player;
    this.current = player;
    this.turnsLeft = turnsLeft;
    this.phase = 'turn';
    this.pending = null;
    this.give = null;
    this.turnLen = ms ?? 0;
    this.turnEnd = ms ? performance.now() + ms + 900 : 0;
    this.table.setSign(mine);
    this.table.setTurn(player);
    if (changed) this.table.flipHourglass();
    this.setBadge(mine ? turnsLeft : 0);
    this.table.clearBadges();
    if (!mine) this.table.setBadge(player, turnsLeft);
    if (mine && changed) {
      audio.play('ignite');
      audio.play('chime', { at: 0.25 });
    }
    this.tutorial('turn');
    await tweens.wait(0.85);
  }

  private async onPlay(player: PlayerId, card: Card, effect: CardType, target?: PlayerId): Promise<void> {
    this.phase = 'reaction';
    this.pending = { player, card, effect, target, cancelled: false, burned: false };
    this.claims = [];
    const slot = this.table.pileSlot();
    let cm: CardMesh;
    if (this.isMe(player)) {
      cm = this.takeFrom(player, card);
      audio.play('swish');
      await this.fly(cm.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.5, { arc: 0.16, spin: 0.6 });
      audio.play('place');
    } else {
      cm = this.takeFrom(player, card);
      cm.setVariant('hand');
      this.table.seat(player)?.figure.setReach(0.9, 'R');
      audio.play('swish');
      await this.fly(cm.root, () => this.camX(0.0, 0.05, 0.62, 0.95), 0.36, { arc: 0.1, ease: ease.outCubic });
      this.showPreview(card, 900);
      await tweens.wait(0.22);
      this.table.seat(player)?.figure.setReach(0.55, 'R');
      cm.setVariant('table');
      await this.fly(cm.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.32, { arc: 0.08 });
      audio.play('place');
      setTimeout(() => !this.hand.hovered && this.hidePreview(), 400);
    }
    this.table.pushPile(cm);
    this.pendingMesh = cm;
    this.impact(slot.p, player);
    if (this.isMe(player)) {
      if (effect === 'scry') this.myScried++;
      if (target) this.myMarked++;
    }
    const who = this.nameOf(player);
    if (card.type === 'glass') {
      this.mirrorShimmer(slot.p, effect);
      this.caption(slot.p.clone().add(V(0, 0.25, 0)), `${who} copies ${CARD_DEFS[effect].name}`, '#bfe6ff');
    } else if (target) this.caption(this.seatHead(target).add(V(0, 0.3, 0)), `${CARD_DEFS[card.type].name} → ${this.nameOf(target)}`, '#ffcf8a');
    this.tutorial('play', { player, card, target });
  }

  /** Card impact on the pile (cosmetic: varies with the player's equipped impact). */
  private impact(at: THREE.Vector3, player: PlayerId): void {
    const look = this.seats.find((s) => s.id === player)?.look?.impact ?? 'dust';
    const p = at.clone().add(V(0, 0.01, 0));
    switch (look) {
      case 'embers':
        this.fx.burst({ at: p, count: 22, color: '#ff8a3a', intensity: 3, speed: 0.6, up: 1.2, life: 0.9, size: 0.02, gravity: 0.3 });
        break;
      case 'gold':
        this.fx.burst({ at: p, count: 18, color: '#ffd76a', intensity: 3, speed: 0.7, up: 1.4, life: 0.8, size: 0.022, gravity: -1.6 });
        audio.play('coins', { vol: 0.35 });
        break;
      case 'frost':
        this.fx.burst({ at: p, count: 24, color: '#bfe6ff', intensity: 2.6, speed: 0.5, up: 0.5, life: 1.1, size: 0.02, gravity: -0.2 });
        break;
      case 'ravens':
        this.fx.burst({ at: p, count: 10, color: '#202020', intensity: 1, speed: 0.6, up: 1.6, life: 1.4, size: 0.04, gravity: 0.4, kind: 'feather' });
        break;
      case 'holy':
        this.fx.burst({ at: p, count: 16, color: '#fff2c0', intensity: 3.5, speed: 0.4, up: 2, life: 1.2, size: 0.03, gravity: 0.5 });
        break;
      case 'smoke':
        this.fx.burst({ at: p, count: 14, color: '#8a7a6a', intensity: 0.6, speed: 0.25, up: 1, life: 1.6, size: 0.06, gravity: 0.15 });
        break;
      default:
        this.fx.burst({ at: p, count: 8, color: '#ffd9a0', intensity: 1.2, speed: 0.25, up: 0.6, life: 0.5, size: 0.02, gravity: -0.2 });
    }
  }

  private mirrorShimmer(at: THREE.Vector3, effect: CardType): void {
    const ghost = this.newCard({ id: -1, type: effect }, { p: at.clone().add(V(0, 0.04, 0)), q: Q_FACE_PLAYER.clone(), s: 1.1 });
    ghost.tint(0.8, 0.95, 1.1, 0.4);
    audio.play('scry', { vol: 0.6 });
    const fl = this.fx.flash(at.clone().add(V(0, 0.12, 0)), new THREE.Color(1.4, 2.2, 3), 0.6);
    void tweens.to(1.1, (k) => {
      ghost.root.position.y = at.y + 0.04 + k * 0.22;
      ghost.root.scale.setScalar(1.1 + k * 0.2);
      (fl.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI);
      ghost.root.visible = k < 0.95;
    }).then(() => {
      ghost.dispose();
      this.fx.group.remove(fl);
    });
  }

  private onWindow(ms: number): void {
    this.phase = 'reaction';
    this.windowLen = ms;
    this.windowEnd = performance.now() + ms;
    this.refreshAffordances();
    this.tutorial('window');
    const p = this.pending;
    if (!this.tut && p && !p.cancelled && p.target === this.me && !this.isFriend(p.player) && HOSTILE.includes(p.effect)) {
      const answers = ['parry', 'breath', 'misdirect'].filter((t) => this.hand.ofType(t) && !this.locked(t as CardType));
      if (answers.length) this.hint(`${CARD_DEFS[p.effect].name} on you! Answer it?`, Math.min(ms, 2400));
    }
  }

  private async onParry(player: PlayerId, card: Card, cancelled: boolean, burned: boolean): Promise<void> {
    if (this.pending) {
      this.pending.cancelled = cancelled;
      this.pending.burned = this.pending.burned || burned;
    }
    const slot = this.table.pileSlot();
    const cm = this.takeFrom(player, card);
    cm.setVariant('table');
    audio.play('swish', { vol: 1.2 });
    await this.fly(cm.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.42, { arc: 0.22, spin: -1.2, ease: ease.inQuad });
    const at = slot.p.clone().add(V(0, 0.03, 0));
    if (card.type === 'breath') {
      audio.play('ignite', { vol: 1.4 });
      audio.play('whoosh');
      this.fx.burst({ at, count: 34, color: '#ff6a1a', intensity: 4, speed: 0.9, up: 1.4, life: 0.8, size: 0.035, gravity: 0.6 });
      const fl = this.fx.flash(at.clone().add(V(0, 0.08, 0)), new THREE.Color(4, 1.4, 0.3), 0.8);
      void tweens.to(0.6, (k) => ((fl.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI))).then(() => this.fx.group.remove(fl));
    } else {
      audio.play('parry');
      this.fx.burst({ at, count: 26, color: '#bfe0ff', intensity: 4, speed: 1.4, up: 0.8, life: 0.45, size: 0.025, gravity: -2.5 });
      const fl = this.fx.flash(at.clone().add(V(0, 0.02, 0)), new THREE.Color(2.5, 3, 4), 0.6);
      void tweens.to(0.4, (k) => ((fl.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI))).then(() => this.fx.group.remove(fl));
    }
    this.app.rig.shake(0.025);
    this.table.pushPile(cm);
    this.pendingMesh?.tint(cancelled ? 0.45 : 1, cancelled ? (burned ? 0.3 : 0.45) : 1, cancelled ? (burned ? 0.25 : 0.5) : 1);
    if (!this.isMe(player)) this.showPreview(card, 900);
    this.caption(at.clone().add(V(0, 0.25, 0)), `${this.nameOf(player)}: ${CARD_DEFS[card.type].name}!`, card.type === 'breath' ? '#ff9a5a' : '#bfe0ff');
    this.tutorial('parry', { player, cancelled });
    await tweens.wait(0.3);
  }

  private async onRedirect(player: PlayerId, card: Card, target: PlayerId): Promise<void> {
    if (this.pending) this.pending.target = target;
    const slot = this.table.pileSlot();
    const cm = this.takeFrom(player, card);
    cm.setVariant('table');
    audio.play('whoosh');
    await this.fly(cm.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.4, { arc: 0.2, spin: 2.4 });
    this.table.pushPile(cm);
    audio.play('scry', { vol: 0.5 });
    // A streak of violet light from the pile to the new mark.
    const from = slot.p.clone().add(V(0, 0.05, 0));
    const to = this.seatHead(target);
    const orb = this.fx.flash(from, new THREE.Color(2.4, 0.8, 2.6), 0.25);
    await tweens.to(0.45, (k) => {
      orb.position.lerpVectors(from, to, k);
      orb.position.y += Math.sin(k * Math.PI) * 0.3;
      (orb.material as THREE.SpriteMaterial).opacity = 1;
      if (Math.random() < 0.5) this.fx.burst({ at: orb.position.clone(), count: 2, color: '#d070ff', intensity: 2.5, speed: 0.05, life: 0.4, size: 0.02, gravity: 0 });
    }, { ease: ease.inOutQuad });
    this.fx.group.remove(orb);
    this.fx.burst({ at: to, count: 20, color: '#d070ff', intensity: 3, speed: 0.6, life: 0.6, size: 0.025, gravity: 0 });
    this.app.rig.shake(0.015);
    this.caption(to.clone().add(V(0, 0.25, 0)), `${this.nameOf(player)} points at ${this.nameOf(target)}`, '#e0a0ff');
    if (this.isMe(target)) this.hint('It is aimed at you now!', 1600);
  }

  private async onPrivateer(player: PlayerId, card: Card): Promise<void> {
    const cm = this.takeFrom(player, card);
    cm.setVariant('table');
    const spot = this.table.pilePos.clone().add(V(-0.05, 0.16, 0.22 + this.claims.length * 0.05));
    audio.play('swish');
    await this.fly(cm.root, () => ({ p: spot, q: Q_FACE_PLAYER.clone(), s: 0.85 }), 0.45, { arc: 0.12 });
    audio.play('coins', { vol: 0.4 });
    this.claims.push({ player, mesh: cm });
    this.caption(spot.clone().add(V(0, 0.2, 0)), `${this.nameOf(player)} sends a Privateer`, '#9ad0ff');
  }

  private async onResolve(player: PlayerId, card: Card, effect: CardType, cancelled: boolean): Promise<void> {
    this.table.setRing(0, 0);
    this.windowEnd = 0;
    this.phase = 'turn';
    if (cancelled) {
      audio.play('snuff', { vol: 0.8 });
      if (!this.tut) this.hint(`${CARD_DEFS[card.type].name} was stopped.`, 1500);
    } else if (effect === 'slip') {
      audio.play('whoosh');
      if (!this.isMe(player) && !this.tut) this.hint(`${this.nameOf(player)} slips away without drawing.`, 1800);
    }
    this.tutorial('resolve', { player, card, cancelled });
    this.pending = null;
    await tweens.wait(0.3);
  }

  private async onBurn(card: Card): Promise<void> {
    const cm = this.table.takeFromPile(card.id) ?? this.pendingMesh;
    if (!cm) return;
    audio.play('ignite', { vol: 1.2 });
    const start = cm.root.position.clone();
    const into = this.table.deckPos.clone().add(V(-0.06, 0.01, 0));
    // Burn: the card lifts in flame, then streaks into the deck.
    await tweens.to(0.6, (k) => {
      cm.root.position.copy(start).add(V(0, k * 0.18, 0));
      cm.root.rotation.z += 0.05;
      if (Math.random() < 0.6) this.fx.burst({ at: cm.root.position.clone(), count: 3, color: '#ff5a1a', intensity: 3.5, speed: 0.3, up: 1.5, life: 0.6, size: 0.03, gravity: 0.5 });
    });
    cm.tint(0.25, 0.12, 0.08);
    await this.fly(cm.root, () => ({ p: into, q: Q_FLAT_DOWN.clone(), s: 1 }), 0.45, { arc: 0.1, ease: ease.inQuad });
    audio.play('place');
    this.caption(into.clone().add(V(0, 0.2, 0)), 'Burned back into the deck', '#ff9a5a');
    cm.dispose();
    this.pendingMesh = null;
  }

  private async onCopy(player: PlayerId, card: Card): Promise<void> {
    const claim = this.claims.find((c) => c.player === player);
    if (claim) {
      claim.mesh.setCard({ id: -2, type: 'privateer' });
      const pt = this.table.pileSlot();
      void this.fly(claim.mesh.root, () => ({ p: pt.p, q: pt.q, s: 1 }), 0.35).then(() => this.table.pushPile(claim.mesh));
    }
    const at = { p: this.table.pilePos.clone().add(V(0, 0.08, 0)), q: Q_FACE_PLAYER.clone(), s: 1 };
    const cm = this.newCard(card, at, this.isMe(player) ? 'hand' : 'table');
    cm.tint(0.8, 0.95, 1.1);
    audio.play('scry', { vol: 0.5 });
    if (this.isMe(player)) {
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.5, 1.05), 0.5, { arc: 0.12 });
      cm.tint(1, 1, 1);
      await tweens.wait(0.2);
      this.addToHand(cm);
    } else await this.giveToSeat(player, cm, 0.6);
    this.caption(this.seatHead(player), `${this.nameOf(player)} copies ${CARD_DEFS[card.type].name}`, '#9ad0ff');
  }

  private async onPass(from: PlayerId, to: PlayerId, card: Card): Promise<void> {
    const claim = this.claims.find((c) => c.player === from);
    const cm = claim?.mesh ?? this.newCard(card, { p: this.table.pilePos.clone().add(V(0, 0.1, 0)), q: Q_FACE_PLAYER.clone(), s: 1 });
    this.caption(this.seatHead(from), 'The Privateer is caught!', '#ff8a6a');
    if (this.isMe(to)) {
      cm.setVariant('hand');
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.5, 1.05), 0.5, { arc: 0.12 });
      await tweens.wait(0.15);
      this.addToHand(cm);
    } else await this.giveToSeat(to, cm, 0.6);
  }

  private async onScry(player: PlayerId, cards: Card[] | undefined, ms: number): Promise<void> {
    this.phase = 'scry';
    audio.play('scry');
    const from = this.deckX();
    this.scryMeshes = [];
    const visible = !!cards;
    for (let i = 0; i < 3; i++) this.scryMeshes.push(this.newCard(visible ? (cards![i] ?? null) : null, from, visible ? 'hand' : 'table'));
    if (visible) {
      const jobs = this.scryMeshes.map((cm, i) =>
        this.fly(cm.root, () => this.camX((i - 1) * 0.165, 0.05 - Math.abs(i - 1) * 0.012, 0.62 + Math.abs(i - 1) * 0.02, 1.05), 0.55, { arc: 0.12, ease: ease.outCubic })
      );
      const fl = this.fx.flash(this.table.deckTopWorld(), new THREE.Color(1.8, 0.8, 3), 0.6);
      void tweens.to(0.7, (k) => ((fl.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI) * 0.8)).then(() => this.fx.group.remove(fl));
      await Promise.all(jobs);
      this.hand.lowered = 0.6;
      this.scryMeshes.forEach((cm) => {
        if (!cm.card) return;
        const card = cm.card;
        this.staticPicks.push(this.nav.picker.add({ object: cm.face, priority: -2, onHover: (on) => (on ? this.showPreview(card) : this.hidePreview()) }));
      });
      const mine = this.isMe(player);
      this.hint(this.tut ? 'Only you can see the future. The Hooded Hand lurks just beneath the top card.' : mine ? 'Only you can see the future. The top of the deck is on the left.' : `${this.nameOf(player)}'s vision, shared with you. Top is on the left.`);
      if (mine) {
        this.action('Done', () => {
          this.action(null);
          void this.t.send({ t: 'scryDone' });
        });
      }
    } else {
      const sv = this.table.seat(player);
      const jobs = this.scryMeshes.map((cm, i) => {
        const p = this.table.deckPos.clone().add(V(0.05, 0.22, (i - 1) * 0.12));
        const dummy = new THREE.Object3D();
        dummy.position.copy(p);
        dummy.lookAt(sv ? sv.figure.root.position.clone().add(V(0, 0.5, 0)) : p.clone().add(V(1, 0, 0)));
        return this.fly(cm.root, () => ({ p, q: dummy.quaternion.clone(), s: 0.9 }), 0.55, { arc: 0.05 });
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
    await Promise.all(this.scryMeshes.map((cm, i) => this.fly(cm.root, () => to, 0.45, { arc: 0.08 }).then(() => i === 0 && audio.play('place', { vol: 0.5 }))));
    for (const cm of this.scryMeshes) cm.dispose();
    this.scryMeshes = [];
    this.hidePreview();
    this.phase = 'turn';
    this.tutorial('scryEnd');
  }

  private async onShuffle(by: PlayerId): Promise<void> {
    audio.play('shuffle');
    const center = this.table.deckTopWorld();
    const half = 7;
    const left: CardMesh[] = [];
    const right: CardMesh[] = [];
    for (let i = 0; i < half; i++) {
      left.push(this.newCard(null, this.deckX()));
      right.push(this.newCard(null, this.deckX()));
    }
    const side = new THREE.Vector3(0, 0, 1);
    // Riffle: split, arch, and interleave back.
    await tweens.to(1.15, (k) => {
      const split = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
      [left, right].forEach((arr, s) =>
        arr.forEach((g, i) => {
          const dirS = s === 0 ? -1 : 1;
          const t = clamp((k - 0.35 - i * 0.03) / 0.3, 0, 1);
          const arch = Math.sin(t * Math.PI) * 0.06;
          g.root.position.copy(center).addScaledVector(side, dirS * 0.13 * split).add(V(0, i * 0.004 + arch + (s ? 0.002 : 0), 0));
          g.root.quaternion.copy(Q_FLAT_DOWN).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), dirS * arch * 4));
        })
      );
    }, { ease: ease.linear });
    [...left, ...right].forEach((g) => g.dispose());
    if (!this.tut) this.caption(center.clone().add(V(0, 0.2, 0)), `${this.nameOf(by)} shuffles the deck`, '#ffe0a0');
  }

  private async onReveal(card: Card): Promise<void> {
    const cm = this.newCard(card, { p: this.table.deckTopWorld(), q: Q_FLAT_DOWN.clone(), s: 1 }, 'hand');
    audio.play('flip');
    await this.fly(cm.root, () => this.camX(0, 0.08, 0.7, 1.1), 0.5, { arc: 0.15, ease: ease.outCubic });
    this.showPreview(card, 1200);
    if (card.type === 'hand') {
      audio.play('heartbeat');
      this.app.rig.shake(0.02);
      this.hint('Everyone sees it: the Hooded Hand sits on top!', 2000);
    } else this.hint(`The top card is ${CARD_DEFS[card.type].name}.`, 1800);
    await tweens.wait(1.0);
    await this.fly(cm.root, () => this.deckX(), 0.5, { arc: 0.1 });
    audio.play('place', { vol: 0.5 });
    cm.dispose();
    this.hidePreview();
  }

  private onGivePrompt(from: PlayerId, to: PlayerId, ms: number): void {
    this.phase = 'give';
    this.give = { from, to };
    this.giveEnd = performance.now() + ms;
    if (this.isMe(from)) {
      this.hint(`${this.nameOf(to)} demands a card. Click the one you'll hand over.`);
      this.app.rig.shake(0.01);
    } else if (this.isMe(to)) this.hint(`${this.nameOf(from)} is choosing what to give you…`);
    else this.hint(`${this.nameOf(from)} must hand ${this.nameOf(to)} a card.`, 2000);
    this.refreshAffordances();
  }

  private async onSteal(from: PlayerId, to: PlayerId, card?: Card): Promise<void> {
    this.give = null;
    this.giveEnd = 0;
    this.hint(null);
    if (!card && !this.table.seat(from) && !this.isMe(from)) return;
    if (!card && (this.isMe(from) || this.isMe(to))) {
      if (from === to) return;
    }
    const cm = this.takeFrom(from, card ?? null);
    audio.play('swish');
    if (this.isMe(to)) {
      cm.setVariant('hand');
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.55, 1, true), 0.45, { arc: 0.1 });
      if (card) cm.setCard(card);
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.55, 1.05), 0.3, { ease: ease.outCubic });
      audio.play('coins', { vol: 0.6 });
      await tweens.wait(0.2);
      this.addToHand(cm);
    } else {
      if (this.isMe(from)) this.hint(`${this.nameOf(to)} pockets your ${card ? CARD_DEFS[card.type].name : 'card'}.`, 1800);
      await this.giveToSeat(to, cm, 0.65);
    }
  }

  private async onOwed(player: PlayerId, by: PlayerId, turns: number): Promise<void> {
    audio.play('bounty');
    this.app.rig.shake(0.035);
    const sv = this.table.seat(player);
    sv?.figure.setReach(0.1, 'L');
    sv?.figure.flinch();
    this.allLook(this.isMe(player) ? this.app.gfx.camera.position.clone() : this.seatHead(player), player);
    setTimeout(() => this.allLook(null), 1600);
    if (this.isMe(player)) {
      this.banner(`Bounty! ${turns} turns`, '#ff8a3a');
      this.setBadge(turns);
    } else {
      this.table.setBadge(player, turns);
      if (!this.tut) this.hint(`${this.nameOf(player)} must take ${turns} turns.`, 1800);
    }
    this.tutorial('owed', { player });
    await tweens.wait(0.9);
    sv?.figure.setReach(0.55, 'L');
    void by;
  }

  private async onReverse(dir: 1 | -1): Promise<void> {
    this.table.reverse(dir);
    audio.play('whoosh', { vol: 1.2 });
    audio.play('chime', { at: 0.3, vol: 0.5 });
    this.banner('The order turns about!', '#7fe0b0');
    await tweens.wait(1.1);
  }

  private async onLock(player: PlayerId, type: CardType, turns: number): Promise<void> {
    this.table.showChains(true);
    audio.play('parry', { vol: 0.8 });
    audio.play('thud', { at: 0.2, vol: 0.6 });
    this.app.rig.shake(0.02);
    this.banner(`${CARD_DEFS[type].name}: shackled!`, '#c9c2b6');
    this.hint(`${this.nameOf(player)} chains every ${CARD_DEFS[type].name} for ${turns} turns.`, 2600);
    await tweens.wait(1.2);
  }

  private async onUnlock(type: CardType): Promise<void> {
    this.table.showChains(false);
    audio.play('coins', { vol: 0.5 });
    this.caption(this.table.pilePos.clone().add(V(0, 0.25, 0)), `${CARD_DEFS[type].name} is free again`, '#e0e0d0');
    await tweens.wait(0.5);
  }

  private async onWard(player: PlayerId, target: PlayerId): Promise<void> {
    audio.play('chime');
    audio.play('angel', { vol: 0.35 });
    const at = this.isMe(target) ? this.camX(0, -0.05, 0.6).p : this.seatHead(target);
    this.fx.burst({ at, count: 30, color: '#ffe08a', intensity: 3, speed: 0.6, life: 0.9, size: 0.025, gravity: 0 });
    this.table.setWard(target, true);
    if (this.isMe(target)) this.banner('You are warded', '#ffe08a');
    else this.caption(at.clone().add(V(0, 0.2, 0)), `${this.nameOf(player)} wards ${this.nameOf(target)}`, '#ffe08a');
    await tweens.wait(1.1);
  }

  private async onWarded(target: PlayerId, card: Card): Promise<void> {
    audio.play('parry');
    const at = this.isMe(target) ? this.camX(0, -0.05, 0.6).p : this.seatHead(target);
    this.fx.burst({ at, count: 36, color: '#ffe08a', intensity: 4, speed: 1.2, life: 0.6, size: 0.03, gravity: -1 });
    this.table.setWard(target, false);
    this.pendingMesh?.tint(0.45, 0.45, 0.5);
    this.app.rig.shake(0.02);
    this.caption(at.clone().add(V(0, 0.2, 0)), `The Aegis holds! ${CARD_DEFS[card.type].name} fizzles.`, '#ffe08a');
    await tweens.wait(1.0);
  }

  private async onRetake(player: PlayerId, card: Card): Promise<void> {
    const cm = this.table.takeFromPile(card.id) ?? this.newCard(card, { p: this.table.pilePos.clone(), q: Q_FLAT_DOWN.clone(), s: 1 });
    audio.play('scry', { vol: 0.5 });
    audio.play('swish');
    this.caption(this.table.pilePos.clone().add(V(0, 0.22, 0)), `${this.nameOf(player)} turns back the sands: ${CARD_DEFS[card.type].name}`, '#ffe0a0');
    if (this.isMe(player)) {
      cm.setCard(card);
      cm.setVariant('hand');
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.5, 1.05), 0.55, { arc: 0.15 });
      await tweens.wait(0.2);
      this.addToHand(cm);
    } else await this.giveToSeat(player, cm, 0.7);
  }

  private async onSwap(a: PlayerId, b: PlayerId, handA?: Card[], handB?: Card[]): Promise<void> {
    audio.play('whoosh', { vol: 1.2 });
    audio.play('shuffle', { at: 0.2, vol: 0.6 });
    this.caption(this.table.pilePos.clone().add(V(0, 0.25, 0)), `${this.nameOf(a)} and ${this.nameOf(b)} swap hands`, '#9fe07a');
    const meIn = this.isMe(a) || this.isMe(b);
    const other = this.isMe(a) ? b : a;
    const myNew = this.isMe(a) ? handA : handB;
    if (meIn) {
      // My cards fly to them; theirs fly to me.
      const mine = this.hand.cards.splice(0);
      mine.forEach((c) => {
        this.unregister(c);
        this.app.gfx.scene.attach(c.root);
        c.setVariant('table');
      });
      const sv = this.table.seat(other)!;
      const theirs = sv.hand.splice(0);
      const n1 = mine.length;
      const jobs: Promise<void>[] = [];
      mine.forEach((c, i) => jobs.push(this.fly(c.root, () => this.table.handSlot(other, i, n1), 0.8, { arc: 0.3 }).then(() => c.setCard(null))));
      theirs.forEach((c, i) => jobs.push(this.fly(c.root, () => this.camX((i - theirs.length / 2) * 0.05, 0.02, 0.55, 1, true), 0.8, { arc: 0.3 })));
      await Promise.all(jobs);
      sv.hand.push(...mine);
      void this.table.layoutSeat(other, 0.2);
      theirs.forEach((c) => c.dispose());
      for (const card of myNew ?? []) this.addToHand(this.newCard(card, this.camX(0, 0.02, 0.55, 1), 'hand'));
    } else {
      const sa = this.table.seat(a)!;
      const sb = this.table.seat(b)!;
      const ha = sa.hand.splice(0);
      const hb = sb.hand.splice(0);
      const jobs: Promise<void>[] = [];
      ha.forEach((c, i) => jobs.push(this.fly(c.root, () => this.table.handSlot(b, i, ha.length), 0.8, { arc: 0.3 })));
      hb.forEach((c, i) => jobs.push(this.fly(c.root, () => this.table.handSlot(a, i, hb.length), 0.8, { arc: 0.3 })));
      await Promise.all(jobs);
      sa.hand.push(...hb);
      sb.hand.push(...ha);
      if (sa.mate && handA) sa.hand.forEach((c, i) => c.setCard(handA[i] ?? null));
      if (sb.mate && handB) sb.hand.forEach((c, i) => c.setCard(handB[i] ?? null));
    }
    await tweens.wait(0.3);
  }

  private async onDraw(player: PlayerId, card: Card | undefined, bottom: boolean): Promise<void> {
    const from = bottom ? { p: this.table.deckPos.clone().add(V(0, 0.002, 0)), q: Q_FLAT_DOWN.clone(), s: 1 } : this.deckX();
    const isHand = card?.type === 'hand';
    if (this.isMe(player)) {
      const cm = this.newCard(card ?? null, from, 'hand');
      audio.play('draw');
      if (isHand) {
        await this.fly(cm.root, () => this.camX(0.0, 0.03, 0.5, 1.15, true), 0.6, { arc: 0.12, ease: ease.outCubic });
        this.doomMesh = cm;
        return;
      }
      await this.fly(cm.root, () => this.camX(0, 0.02, 0.5, 1.05), 0.5, { arc: 0.12, ease: ease.outCubic });
      await tweens.wait(0.25);
      this.addToHand(cm);
      this.tutorial('drew');
    } else {
      const sv = this.table.seat(player)!;
      const cm = this.newCard(null, from);
      audio.play('draw', { vol: 0.7 });
      sv.figure.setReach(0.85, 'L');
      sv.figure.lean = 0.8;
      setTimeout(() => (sv.figure.lean = 0), 700);
      if (isHand) {
        const p = this.table.pilePos.clone().add(V(0.02, 0.2, 0));
        const dummy = new THREE.Object3D();
        dummy.position.copy(p);
        dummy.lookAt(sv.figure.root.position.clone().add(V(0, 0.5, 0)));
        await this.fly(cm.root, () => ({ p, q: dummy.quaternion.clone(), s: 1.25 }), 0.65, { arc: 0.1 });
        cm.setCard(card!);
        this.doomMesh = cm;
        sv.figure.setReach(0.55, 'L');
        return;
      }
      if (card && sv.mate) cm.setCard(card);
      const n = sv.hand.length + 1;
      await this.fly(cm.root, () => this.table.handSlot(player, n - 1, n), 0.6, { arc: 0.1 });
      sv.hand.push(cm);
      void this.table.layoutSeat(player, 0.2);
      sv.figure.setReach(0.55, 'L');
    }
  }

  private async onDoom(player: PlayerId, card: Card, ms: number, hasAngel?: boolean): Promise<void> {
    this.phase = 'rescue';
    this.doomed = player;
    const app = this.app;
    const tv = app.tavern;
    audio.cutMusic();
    audio.play('stinger');
    this.hint(null);
    this.hidePreview();
    const cm = this.doomMesh ?? this.newCard(card, this.deckX());
    this.doomMesh = cm;
    cm.setCard(card);
    void tweens.to(0.7, (k) => {
      app.gfx.grade.u('uDanger').value = k;
      tv.setLightLevel(1 - k * 0.45);
      app.gfx.chroma.offset.set(0.0012 * k, 0.0008 * k);
    });
    tv.flames.uniforms.uTint.value.setRGB(1.4, 0.55, 0.45);
    this.allLook(this.isMe(player) ? this.app.gfx.camera.position.clone() : this.seatHead(player), player, 0.6);
    if (this.isMe(player)) {
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
      const p = cm.root.position.clone();
      const dummy = new THREE.Object3D();
      dummy.position.copy(p);
      dummy.lookAt(app.gfx.camera.position);
      await tweens.to(0.45, (k) => cm.root.quaternion.slerpQuaternions(q0, dummy.quaternion, k), { ease: ease.outBack });
      app.rig.shake(0.02);
      const sv = this.table.seat(player);
      if (sv) sv.figure.breathe = 6;
    }
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
      void this.fly(cm.root, () => this.camX(0.12, 0.05, 0.6, 1.05), 0.4, { ease: ease.outCubic });
      this.hand.lowered = 0;
      const shackled = this.sync?.lock?.type === 'angel';
      if (hasAngel) this.hint(this.tut ? 'Quick! Click your Guardian Angel!' : this.sync?.last === 'angel' && !this.hand.ofType('angel') ? 'Your Looking Glass can copy the Angel. Play it!' : 'Play your Guardian Angel!');
      else this.hint(shackled ? 'Your Angels are in chains…' : 'No angel watches over you…');
    } else if (!this.tut) this.hint(`${this.nameOf(player)} drew the Hooded Hand!`);
    this.refreshAffordances();
    this.tutorial('doom', { player });
  }

  private async onRescue(player: PlayerId, card: Card): Promise<void> {
    this.rescueEnd = 0;
    this.hint(null);
    const app = this.app;
    const tv = app.tavern;
    const doom = this.doomMesh!;
    let angel: CardMesh;
    if (this.isMe(player)) {
      angel = this.takeFrom(player, card);
      angel.setVariant('hand');
      await this.fly(angel.root, () => this.camX(-0.1, 0.06, 0.52, 1.15), 0.45, { arc: 0.06, ease: ease.outCubic });
    } else {
      angel = this.takeFrom(player, card);
      const p = doom.root.position.clone().add(V(-0.08, 0.06, -0.1));
      await this.fly(angel.root, () => ({ p, q: doom.root.quaternion.clone(), s: 1.25 }), 0.45, { arc: 0.1 });
    }
    audio.play('angel');
    this.allLook(null, undefined, -0.5);
    setTimeout(() => this.allLook(null, undefined, 0), 1500);
    const at = angel.root.position.clone();
    const fl = this.fx.flash(at, new THREE.Color(3, 2.7, 2), 1.4);
    const ring = this.fx.ring(at, new THREE.Color(3, 2.5, 1.4), app.gfx.camera.quaternion.clone());
    const ring2 = this.fx.ring(at, new THREE.Color(2.4, 2.2, 1.6), app.gfx.camera.quaternion.clone());
    this.fx.burst({ at, count: 30, color: '#ffffff', speed: 0.5, up: 0.4, life: 2.2, size: 0.035, gravity: -0.12, drag: 1.2, kind: 'feather', spread: V(0.1, 0.1, 0.1) });
    this.fx.burst({ at, count: 46, color: '#ffe8b0', intensity: 3, speed: 0.9, life: 1.3, size: 0.02, gravity: 0.1 });
    // Shafts of light.
    const rays: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(
        new THREE.PlaneGeometry(0.03, 1.2),
        new THREE.MeshBasicMaterial({ map: tv.glowTex, color: new THREE.Color(2.4, 2.1, 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      r.position.copy(at);
      r.quaternion.copy(app.gfx.camera.quaternion);
      r.rotateZ((i / 9) * Math.PI * 2);
      r.translateY(0.6);
      this.fx.group.add(r);
      rays.push(r);
    }
    tv.flames.uniforms.uTint.value.setRGB(1, 1, 1);
    await tweens.to(1.3, (k) => {
      const flash = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      app.gfx.grade.u('uHoly').value = flash * 0.65;
      app.gfx.grade.u('uDanger').value = 1 - k * 0.7;
      (fl.material as THREE.SpriteMaterial).opacity = flash;
      fl.scale.setScalar(1.4 + k * 1.2);
      ring.scale.setScalar(0.05 + k * 0.6);
      ring2.scale.setScalar(0.05 + Math.max(0, k - 0.15) * 0.9);
      (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      (ring2.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - k);
      rays.forEach((r, i) => ((r.material as THREE.MeshBasicMaterial).opacity = flash * (0.5 + 0.5 * Math.sin(i + k * 6))));
      tv.setLightLevel(0.55 + k * 0.35);
    }, { ease: ease.outCubic });
    this.fx.group.remove(fl, ring, ring2, ...rays);
    const sv = this.table.seat(player);
    if (sv) sv.figure.breathe = 1;
    const slot = this.table.pileSlot();
    angel.setVariant('table');
    await this.fly(angel.root, () => ({ p: slot.p, q: slot.q, s: 1 }), 0.45, { arc: 0.1 });
    audio.play('place');
    this.table.pushPile(angel);
    this.tutorial('rescued', { player });
  }

  private onHidePrompt(player: PlayerId, ms: number): void {
    this.phase = 'hide';
    const doom = this.doomMesh!;
    if (this.isMe(player)) {
      void this.fly(doom.root, () => this.camX(0.13, 0.04, 0.62, 1.0), 0.35);
      this.openHideUi(ms);
    } else {
      const sv = this.table.seat(player);
      const p = this.table.deckPos.clone().add(V(0.02, 0.24, 0));
      const dummy = new THREE.Object3D();
      dummy.position.copy(p);
      dummy.lookAt(sv ? sv.figure.root.position.clone().add(V(0, 0.5, 0)) : p);
      void this.fly(doom.root, () => ({ p, q: dummy.quaternion.clone(), s: 1.1 }), 0.4, { arc: 0.05 });
      if (!this.tut) this.hint(`${this.nameOf(player)} is hiding the Hooded Hand…`);
    }
    this.tutorial('hidePrompt', { player });
  }

  private openHideUi(ms: number): void {
    const deck = this.sync?.deck ?? 0;
    let pos = 0;
    const track = h('div', { class: 'track' });
    const knob = h('div', { class: 'knob' }, h('span', { class: 'num' }, '1'), h('span', { class: 'tri' }));
    track.append(knob);
    const setPos = (p: number) => {
      pos = clamp(Math.round(p), 0, deck);
      knob.style.top = `${(deck > 0 ? pos / deck : 0) * 100}%`;
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
    const timer = h('div', { class: 'hide-timer' });
    const t0 = performance.now();
    const tick = () => {
      if (!this.hideUi) return;
      const left = Math.max(0, Math.ceil((ms - (performance.now() - t0)) / 1000));
      timer.textContent = left <= 30 ? `${left}s` : '';
      requestAnimationFrame(tick);
    };
    const labels = h('div', { class: 'labels' }, h('span', {}, 'Top of deck'), h('span', {}, deck > 2 ? 'Middle' : ''), h('span', {}, 'Bottom'));
    this.hideUi = h('div', { class: 'hide-ui' }, h('h3', {}, 'Hide the Hooded Hand!'), labels, track, confirm, timer);
    this.ui.append(this.hideUi);
    tick();
    setPos(0);
    this.hint(this.tut ? 'No one will know where you hide the Hooded Hand. Put it on top.' : 'No one will know where you hide it.');
    this.hintEl.classList.add('below');
    this.hidePreview();
    // Nothing to play while hiding: put the hand away so it does not cover the Hand.
    this.hand.hovered = null;
    this.hand.lowered = 1;
    // The pointer lives on the slider at the far left; keep the view steady instead of swinging after it.
    this.app.rig.lookScale = 0.25;
  }

  private closeHideUi(): void {
    this.hideUi?.remove();
    this.hideUi = null;
    this.hintEl.classList.remove('below');
    this.hand.lowered = 0;
    this.app.rig.lookScale = 1;
  }

  private async onHidden(player: PlayerId, position?: number): Promise<void> {
    this.closeHideUi();
    this.hint(null);
    const app = this.app;
    const tv = app.tavern;
    const doom = this.doomMesh;
    this.doomMesh = null;
    this.doomed = null;
    if (doom) {
      const deck = this.sync?.deck ?? 1;
      const depth = position != null ? position : Math.floor(deck / 2);
      const top = this.table.deckTopWorld();
      const into = this.table.deckPos.clone().add(V(-0.06, Math.max(0.002, (deck - depth) * 0.0011), 0));
      doom.setVariant('table');
      await this.fly(doom.root, () => ({ p: top.clone().add(V(-0.18, 0.06, 0)), q: Q_FLAT_DOWN.clone(), s: 1 }), 0.5, { arc: 0.12 });
      audio.play('swish');
      await this.fly(doom.root, () => ({ p: into, q: Q_FLAT_DOWN.clone(), s: 1 }), 0.35, { ease: ease.inQuad });
      audio.play('place');
      doom.dispose();
    }
    void tweens.to(0.8, (k) => {
      app.gfx.grade.u('uDanger').value = Math.min(app.gfx.grade.u('uDanger').value, 0.3 * (1 - k));
      app.gfx.chroma.offset.set(0, 0);
      tv.setLightLevel(0.9 + k * 0.1);
    });
    tv.flames.uniforms.uTint.value.setRGB(1, 1, 1);
    this.allLook(null);
    audio.startMusic();
    this.phase = 'turn';
    this.tutorial('hidden', { player });
    await tweens.wait(0.4);
  }

  private async onSlain(player: PlayerId): Promise<void> {
    this.rescueEnd = 0;
    this.hint(null);
    this.hand.highlight.clear();
    const app = this.app;
    const tv = app.tavern;
    const mine = this.isMe(player);
    if (mine) this.iAmDead = true;
    else if (!this.iAmDead) this.outlasted++;
    const seat = this.seats.find((s) => s.id === player)!;
    const all = [...tv.tableCandleFlames, ...tv.chandelierFlames, ...tv.sign.flames];
    all.forEach((f, i) => setTimeout(() => tv.flames.setLit(f, 0), (i / all.length) * 900));
    for (let i = 0; i < 4; i++) audio.play('snuff', { at: i * 0.25, vol: 0.6 });
    await tweens.to(1.1, (k) => tv.setLightLevel(0.55 * (1 - k) + 0.05 * k));
    await tweens.wait(0.45);
    audio.play('slash');
    app.gfx.grade.u('uHoly').value = 0.5;
    void tweens.to(0.25, (k) => (app.gfx.grade.u('uHoly').value = 0.5 * (1 - k)));
    app.rig.shake(mine ? 0.12 : 0.05);
    const sv = this.table.seat(player);
    if (mine) {
      // Your own hand scatters and your view falls to the floor.
      this.hand.cards.splice(0).forEach((c) => {
        this.unregister(c);
        this.app.gfx.scene.attach(c.root);
        c.setVariant('table');
        const p = this.table.center.clone().add(V(-0.6 + Math.random() * 0.3, 0.003, (Math.random() - 0.5) * 0.8));
        const q = Q_FLAT_UP.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.random() * 6));
        void this.fly(c.root, () => ({ p, q, s: 1 }), 0.6 + Math.random() * 0.3, { arc: 0.2 });
      });
      void tweens.to(1.0, (k) => {
        app.rig.offset.set(-0.4 * k, -1.05 * ease.inQuad(k), 0.25 * k);
        app.rig.targetOffset.set(0, -1.6 * k, 1.2 * k);
      }, { ease: ease.inCubic });
      audio.play('thud', { at: 0.85 });
      void tweens.to(1.6, (k) => (app.gfx.grade.u('uFade').value = k * 0.9), { delay: 0.5 });
      await tweens.wait(1.3);
    } else if (sv) {
      const f = sv.figure;
      const r0 = f.root.position.clone();
      const q0 = f.root.quaternion.clone();
      const c0 = sv.chair.position.clone();
      const cq = sv.chair.quaternion.clone();
      sv.hand.splice(0).forEach((c, i) => {
        c.setCard(null);
        const p = this.table.center.clone().addScaledVector(sv.out, 0.4 + Math.random() * 0.25).add(V((Math.random() - 0.5) * 0.3, 0.002 + i * 0.001, (Math.random() - 0.5) * 0.3));
        const q = Q_FLAT_DOWN.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.random() * 6));
        void this.fly(c.root, () => ({ p, q, s: 1 }), 0.5 + Math.random() * 0.3, { arc: 0.15 });
      });
      const axis = new THREE.Vector3(-sv.out.z, 0, sv.out.x);
      await tweens.to(0.75, (k) => {
        f.root.position.copy(r0).addScaledVector(sv.out, 1.25 * k).add(V(0, Math.sin(k * Math.PI) * 0.45 - 0.5 * ease.inQuad(k), 0));
        f.root.quaternion.copy(q0).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, 1.65 * ease.outCubic(k)));
        f.eyesOn = 1 - k;
        sv.chair.position.copy(c0).addScaledVector(sv.out, 0.35 * k);
        sv.chair.quaternion.copy(cq).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, 1.4 * ease.inQuad(k)));
      }, { ease: ease.outQuad });
      audio.play('thud');
      app.rig.shake(0.06);
      f.root.visible = false;
      this.allLook(sv.pos.clone().add(V(0, 0.8, 0)), player, 0.3);
      setTimeout(() => this.allLook(null), 2600);
      sv.alive = false;
      sv.name.visible = false;
      sv.badge.visible = false;
      sv.wardOn = false;
    }
    all.forEach((f, i) => setTimeout(() => tv.flames.setLit(f, tv.sign.flames.includes(f) ? 0 : 1), 300 + (i / all.length) * 900));
    audio.play('ignite', { at: 0.3 });
    if (!mine) void tweens.to(1.2, (k) => tv.setLightLevel(0.05 + k * 0.75));
    await tweens.wait(0.6);
    const poster = h(
      'div',
      { class: 'poster' },
      h('h2', {}, 'Missing!'),
      h('div', {
        class: 'photo',
        html: `<svg viewBox="0 0 100 110"><path d="M54 8C38 14 26 34 26 54c0 14 6 22 12 26h24c6-4 12-12 12-26 0-20-10-36-20-46z" fill="${seat.cloak}" opacity=".9"/><path d="M14 110c4-18 16-28 30-30h12c14 2 26 12 30 30z" fill="${seat.cloak}" opacity=".9"/><ellipse cx="50" cy="55" rx="14" ry="17" fill="#1a0e06"/><circle cx="45" cy="54" r="2" fill="#ffb347"/><circle cx="55" cy="54" r="2" fill="#ffb347"/></svg>`,
      }),
      h('div', { class: 'name' }, seat.name),
      h('div', { class: 'epithet' }, seat.epithet),
      h('div', { class: 'seen' }, 'Last seen near the Hooded Hand tavern'),
      h('div', { class: 'stamp' }, mine ? 'You' : 'Slain')
    );
    if (!tweens.instant) this.ui.append(poster);
    audio.play('paper');
    audio.play('thud', { vol: 0.4, at: 0.05 });
    const left = this.sync?.alive.length ?? 0;
    await tweens.wait(left > 1 && !mine ? 2.4 : 3.0);
    poster.style.transition = 'opacity .5s';
    poster.style.opacity = '0';
    setTimeout(() => poster.remove(), 600);
    tv.flames.uniforms.uTint.value.setRGB(1, 1, 1);
    void tweens.to(0.6, (k) => {
      app.gfx.grade.u('uDanger').value *= 1 - k;
      app.gfx.chroma.offset.set(0, 0);
    });
    if (!mine && left > 1) audio.startMusic();
    if (mine && left > 1) {
      // Keep watching as a ghost.
      void tweens.to(1.2, (k) => {
        app.rig.offset.multiplyScalar(1 - k);
        app.rig.targetOffset.multiplyScalar(1 - k);
        app.gfx.grade.u('uFade').value = 0.9 * (1 - k) + 0.2 * k;
      });
      this.hint('You are slain. Watch how the rest of the night unfolds…', 3000);
    }
    await tweens.wait(0.5);
  }

  private onOver(winner: PlayerId | null, winners: PlayerId[], stats: Record<PlayerId, PlayerStats>): void {
    this.phase = 'over';
    this.result = { winner, winners, stats };
    // Online, rebuilt after a reload: the night already ended while we were away. No ledger twice; back to the table.
    if (this.opts.online && tweens.instant) {
      this.backToTable();
      return;
    }
    void showResults(this);
  }

  /** Get up from the table (online: give up the seat). */
  leave(): void {
    const online = this.opts.online;
    if (online && online.state !== 'closed') online.leave();
    this.exit();
  }

  /** Online: back to this table's waiting room for another round. */
  backToTable(): void {
    const online = this.opts.online;
    if (!online || online.state === 'closed') return this.leave();
    online.again();
    this.exit(online);
  }

  private exit(lobby?: OnlineSession): void {
    if (this.disposed || this.leaving) return;
    this.leaving = true;
    void (async () => {
      this.nav.picker.enabled = false;
      await tweens.to(0.6, (k) => (this.app.gfx.grade.u('uFade').value = Math.max(this.app.gfx.grade.u('uFade').value, k)));
      if (this.restarting) return;
      this.nav.app.setScreen(null);
      this.nav.picker.enabled = true;
      this.app.rig.offset.set(0, 0, 0);
      this.app.rig.targetOffset.set(0, 0, 0);
      this.app.rig.snap(this.app.tavern.stations.play);
      this.nav.toPlay(lobby ? { lobby } : undefined);
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
          H("Safe. It is your rival's turn now…");
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
      case 'rescued':
        if (d.player === me) this.tutStep = 9;
        break;
      case 'hidden':
        if (d.player === me) H('Now pray your rival draws it…');
        break;
    }
  }

  // ==================================================================== frame

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

  update(t: number, dt: number): void {
    this.table.update(t, dt);
    this.hand.update(dt);
    this.fx.update(dt);
    const now = performance.now();
    if (this.windowEnd > now) this.table.setRing((this.windowEnd - now) / this.windowLen, 1);
    if (this.turnEnd && this.turnLen) this.table.hgFrac = clamp((this.turnEnd - now) / this.turnLen, 0, 1);
    else this.table.hgFrac = damp(this.table.hgFrac, 1, 2, dt);
    if (this.rescueEnd > now && this.phase === 'rescue') {
      const left = Math.ceil((this.rescueEnd - now) / 1000);
      if (this.countdownEl.textContent !== String(left)) {
        this.countdownEl.textContent = String(left);
        if (left <= 10) audio.play('tick', { vol: 1.5 });
      }
      this.countdownEl.style.opacity = left <= 30 ? '0.9' : '0';
      this.countdownEl.style.transform = `translate(-50%,-50%) scale(${0.55 + 0.04 * Math.sin(t * 8)})`;
      this.placeCountdown(-0.17);
    } else if (this.phase === 'give' && this.giveEnd > now) {
      const left = Math.ceil((this.giveEnd - now) / 1000);
      this.countdownEl.textContent = String(left);
      this.countdownEl.style.opacity = left <= 30 ? '0.6' : '0';
      this.countdownEl.style.left = '50%';
      this.countdownEl.style.top = '30%';
      this.countdownEl.style.transform = 'translate(-50%,-50%) scale(0.45)';
    } else if (this.phase !== 'rescue' && this.countdownEl.style.opacity !== '0' && !this.processing) {
      this.countdownEl.style.opacity = '0';
    }
    if (Math.floor(t * 5) !== Math.floor((t - dt) * 5)) {
      this.table.deckGlowTarget = this.canDraw() ? 1 : 0;
      if (this.idle() && this.phase === 'turn' && this.isMe(this.current)) {
        // Subtle glow on playable cards during your turn.
        this.hand.cards.forEach((c) => {
          if (!c.card) return;
          const d = CARD_DEFS[c.card.type];
          if (d.playable && !this.locked(c.card.type)) this.hand.highlight.add(c.card.id);
        });
        this.hand.softHighlight = true;
      } else this.hand.softHighlight = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.t.dispose();
    this.offSession?.();
    tweens.instant = false;
    audio.suppressed = false;
    for (const u of this.picks.values()) u();
    for (const u of this.staticPicks) u();
    this.aimPicks.forEach((u) => u());
    removeEventListener('keydown', this.keyHandler);
    this.app.gfx.renderer.domElement.removeEventListener('contextmenu', this.onContext);
    this.hand.dispose();
    this.table.dispose();
    this.fx.group.parent?.remove(this.fx.group);
    // Remove every card and effect this match left in the scene (but never the tavern itself, which an old
    // shape-based heuristic used to catch, leaving the menus in the dark). The camera stays for later matches.
    const scene = this.app.gfx.scene;
    for (const c of [...scene.children]) if (!this.sceneBefore.has(c) && c !== this.app.gfx.camera) scene.remove(c);
    this.doomMesh?.dispose();
    this.scryMeshes.forEach((c) => c.dispose());
    this.claims.forEach((c) => c.mesh.dispose());
    this.ui.remove();
    const g = this.app.gfx.grade;
    g.u('uDanger').value = 0;
    g.u('uHoly').value = 0;
    this.app.gfx.chroma.offset.set(0, 0);
    this.app.tavern.flames.uniforms.uTint.value.setRGB(1, 1, 1);
    this.app.tavern.setLightLevel(1);
    this.app.tavern.setFestive(false);
    [...this.app.tavern.tableCandleFlames, ...this.app.tavern.chandelierFlames].forEach((f) => this.app.tavern.flames.setLit(f, 1));
    this.app.rig.fovKick = 0;
    this.app.rig.sway = 1;
    this.nav.hud.showLeave(false);
    this.nav.hud.onLeave = undefined;
    tweens.scale = 1;
  }
}

