// Settings (the gear in the top-left corner): graphics quality and resolution, frame rate, sound.
// Every change applies at once and is saved for the next visit.
import type { App } from '../app';
import { audio } from '../audio/audio';
import { QUALITIES } from '../core/gfx';
import { openCodex } from './codex';
import { h } from '../ui/dom';
import { profile, saveProfile } from '../ui/profile';
import { saveSettings, settings, type QualityChoice, type ResolutionChoice } from '../ui/settings';

export const QUALITY_NAME: Record<QualityChoice, string> = { auto: 'Auto', ultra: 'Ultra', high: 'High', medium: 'Medium', low: 'Low', lowest: 'Lowest' };
const RESOLUTIONS: ResolutionChoice[] = ['auto', 1, 0.85, 0.7, 0.5];

/** A row of choices, one selected. */
function choices<T>(options: readonly T[], current: () => T, label: (o: T) => string, pick: (o: T) => void): HTMLElement {
  const row = h('div', { class: 'seg' });
  const draw = () =>
    row.replaceChildren(
      ...options.map((o) => {
        const b = h('button', { class: 'size' + (o === current() ? ' sel' : '') }, label(o));
        b.addEventListener('click', () => {
          audio.play('tick');
          pick(o);
          draw();
        });
        return b;
      })
    );
  draw();
  return row;
}

function toggle(on: () => boolean, set: (v: boolean) => void): HTMLElement {
  const b = h('button', { class: 'switch', role: 'switch' }, h('i'));
  const show = () => {
    b.classList.toggle('on', on());
    b.setAttribute('aria-checked', String(on()));
  };
  b.addEventListener('click', () => {
    audio.play('tick');
    set(!on());
    show();
  });
  show();
  return b;
}

function slider(key: 'master' | 'music' | 'effects' | 'ambience'): HTMLElement {
  const r = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(settings[key] * 100)), 'aria-label': key }) as HTMLInputElement;
  r.addEventListener('input', () => {
    saveSettings({ [key]: Number(r.value) / 100 });
    audio.setVolumes({ [key]: settings[key] });
  });
  return r;
}

const line = (label: string, control: HTMLElement) => h('div', { class: 'set-row' }, h('span', {}, label), control);

export function openSettings(layer: HTMLElement, app: App): void {
  if (layer.querySelector('.panel.settings')) return;
  audio.play('paper');
  const close = () => {
    removeEventListener('keydown', onKey, true);
    scrim.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const codex = h('button', { class: 'btn-text codex-btn' }, 'Card Codex');
  codex.addEventListener('click', () => {
    audio.play('click');
    close();
    openCodex(layer, app);
  });
  const done = h('button', { class: 'btn-text' }, 'Close');
  done.addEventListener('click', () => {
    audio.play('click');
    close();
  });
  const panel = h(
    'div',
    { class: 'panel settings' },
    h('h2', {}, 'Settings'),
    h('h3', {}, 'Graphics'),
    line(
      'Quality',
      choices(['auto', ...[...QUALITIES].reverse()] as QualityChoice[], () => settings.quality, (q) => QUALITY_NAME[q], (q) => {
        saveSettings({ quality: q });
        app.gfx.setQuality(q);
      })
    ),
    line(
      'Resolution',
      choices(RESOLUTIONS, () => settings.resolution, (r) => (r === 'auto' ? 'Auto' : `${Math.round(r * 100)}%`), (r) => {
        saveSettings({ resolution: r });
        app.gfx.setResolution(r);
      })
    ),
    line('Show frame rate', toggle(() => settings.showFps, (v) => saveSettings({ showFps: v }))),
    line(
      'Limit to 30 FPS',
      toggle(
        () => settings.cap30,
        (v) => {
          saveSettings({ cap30: v });
          app.gfx.minInterval = v ? 1000 / 30 : 0;
        }
      )
    ),
    h('h3', {}, 'Sound'),
    line(
      'Sound',
      toggle(
        () => !profile.muted,
        (v) => {
          saveProfile({ muted: !v });
          audio.setMuted(!v);
        }
      )
    ),
    line('Master', slider('master')),
    line('Music', slider('music')),
    line('Effects', slider('effects')),
    line('Ambience', slider('ambience')),
    h('div', { class: 'row' }, codex, done)
  );
  const scrim = h('div', { class: 'scrim' }, panel);
  scrim.addEventListener('click', (e) => e.target === scrim && close());
  addEventListener('keydown', onKey, true);
  layer.append(scrim);
}
