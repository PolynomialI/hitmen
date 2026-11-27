// The Codex: every card with its art and rules text. Opened from the bottom of Settings.
import type { App } from '../app';
import { audio } from '../audio/audio';
import { CARD_DEFS, CARD_ORDER } from '../../shared/cards';
import { h } from '../ui/dom';

export function openCodex(layer: HTMLElement, app: App): void {
  if (layer.querySelector('.panel.codex')) return;
  const urls = app.cards.urls;
  const grid = h('div', { class: 'codex-grid' });
  const setNames: Record<string, string> = { core: 'The Deck', teams: 'Teams only', ranked: 'Duel only', winter: 'Winter Feast' };
  let lastSet = '';
  for (const t of CARD_ORDER) {
    const d = CARD_DEFS[t];
    if (d.set !== lastSet) {
      lastSet = d.set;
      grid.append(h('div', { class: 'codex-head' }, setNames[d.set]));
    }
    grid.append(h('div', { class: 'codex-card' }, h('img', { src: urls[t], alt: d.name, draggable: 'false' }), h('b', {}, d.name), h('p', {}, d.text)));
  }
  const scrim = h('div', { class: 'scrim' });
  const close = h('button', { class: 'btn-text' }, 'Close');
  close.addEventListener('click', () => {
    audio.play('click');
    scrim.remove();
  });
  scrim.append(h('div', { class: 'panel codex' }, h('h2', {}, 'The Codex'), grid, h('div', { class: 'row' }, h('span'), close)));
  scrim.addEventListener('click', (e) => e.target === scrim && scrim.remove());
  layer.append(scrim);
  audio.play('paper');
}
