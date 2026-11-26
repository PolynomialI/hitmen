import { h, icon } from './dom';
import { onProfile, profile } from './profile';

/** Persistent overlay: profile plate (bottom-right) and corner buttons (top-left). */
export class Hud {
  readonly el: HTMLElement;
  private plate: HTMLElement;
  private coinsEl: HTMLElement;
  private nameEl: HTMLElement;
  private levelEl: HTMLElement;
  private rubiesEl: HTMLElement;
  private settingsBtn: HTMLButtonElement;
  readonly leaveBtn: HTMLButtonElement;
  /** Frame-rate readout next to the corner buttons (Settings → Show frame rate). */
  readonly fpsEl: HTMLElement;
  onSettings?: () => void;
  onLeave?: () => void;

  constructor(parent: HTMLElement) {
    this.coinsEl = h('span', {}, profile.coins.toLocaleString());
    this.nameEl = h('b', {}, profile.name);
    this.levelEl = h('div', { class: 'seal' }, String(profile.level));
    this.rubiesEl = h('span', {}, String(profile.rubies));
    this.plate = h(
      'div',
      { class: 'hud-profile hidden' },
      this.levelEl,
      h('div', { class: 'who' }, this.nameEl),
      h('div', { class: 'coins' }, h('i', { class: 'coin-ico' }), this.coinsEl),
      h('div', { class: 'coins' }, h('i', { class: 'ruby-ico' }), this.rubiesEl)
    );
    this.settingsBtn = h('button', { class: 'icon-btn', title: 'Settings', 'aria-label': 'Settings' }) as HTMLButtonElement;
    this.settingsBtn.append(icon('gear'));
    this.settingsBtn.addEventListener('click', () => this.onSettings?.());
    this.fpsEl = h('span', { class: 'fps', style: 'display:none' });
    this.leaveBtn = h('button', { class: 'icon-btn', title: 'Leave table', 'aria-label': 'Leave table', style: 'display:none' }) as HTMLButtonElement;
    this.leaveBtn.append(icon('door'));
    this.leaveBtn.addEventListener('click', () => this.onLeave?.());
    this.el = h('div', { class: 'layer' }, h('div', { class: 'corner-btns' }, this.settingsBtn, this.leaveBtn, this.fpsEl), this.plate);
    parent.append(this.el);
    onProfile(() => {
      this.coinsEl.textContent = profile.coins.toLocaleString();
      this.nameEl.textContent = profile.name;
      this.levelEl.textContent = String(profile.level);
      this.rubiesEl.textContent = String(profile.rubies);
    });
  }

  showProfile(on: boolean): void {
    this.plate.classList.toggle('hidden', !on);
  }

  showLeave(on: boolean): void {
    this.leaveBtn.style.display = on ? '' : 'none';
  }

  /** Count coins up visually. */
  bumpCoins(from: number, to: number): void {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1200);
      this.coinsEl.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }
}

export function toast(parent: HTMLElement, title: string, sub?: string): void {
  const t = h('div', { class: 'toast' }, title, sub ? h('small', {}, sub) : null);
  parent.append(t);
  setTimeout(() => t.remove(), 2700);
}
