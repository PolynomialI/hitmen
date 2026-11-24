// Online tables in the play menu: the waiting room of a table, and the "Join a Table" panel (open tables + code).
import { normalizeCode, type LobbyInfo, type OnlineMode } from '../../shared/online';
import { audio } from '../audio/audio';
import { lookFromProfile } from '../cosmetics/apply';
import { listRooms, OnlineSession } from '../net/online';
import { h } from '../ui/dom';
import { toast } from '../ui/hud';
import { profile } from '../ui/profile';
import type { Nav } from './menus';

export const MODE_NAME: Record<OnlineMode, string> = { original: 'Original', teams: 'Teams', winter: 'Winter Feast' };
const TEAM_NAME = ['Crimson', 'Azure'];

export interface Modal {
  el: HTMLElement;
  dispose(): void;
}

const button = (cls: string, label: string, fn: () => void): HTMLButtonElement => {
  const b = h('button', { class: cls }, label) as HTMLButtonElement;
  b.addEventListener('pointerenter', () => audio.play('hover'));
  b.addEventListener('click', () => {
    audio.play('click');
    fn();
  });
  return b;
};

/** The waiting room of an online table. Starts the match for everyone at the table when the host does. */
export function lobbyModal(nav: Nav, session: OnlineSession, onClose: () => void): Modal {
  const code = h('span', { class: 'code' }, '·····');
  const copy = button('copy', 'Copy', () => {
    const c = session.room;
    if (!c) return;
    navigator.clipboard?.writeText(c).then(
      () => toast(nav.layer, 'Code copied', `Tell your friends: ${c}`),
      () => toast(nav.layer, `Tell your friends: ${c}`)
    ) ?? toast(nav.layer, `Tell your friends: ${c}`);
  });
  const lede = h('p', { class: 'lede' }, 'Setting the table…');
  const seats = h('ol', { class: 'seats' });
  const note = h('p', { class: 'note' }, 'Empty chairs are taken by tavern regulars when the night begins.');
  const leave = button('btn-text', 'Leave', () => session.leave());
  const right = h('div', { class: 'lobby-go' });
  const el = h(
    'div',
    { class: 'scrim' },
    h('div', { class: 'panel lobby' }, h('h2', {}, 'Table ', code, copy), lede, seats, note, h('div', { class: 'row' }, leave, right))
  );

  let started = false;
  const go = (l: LobbyInfo) => {
    if (started) return;
    started = true;
    dispose();
    onClose();
    nav.startMatch({ mode: l.mode, rivals: l.size - 1, online: session });
  };

  const render = (l: LobbyInfo) => {
    code.textContent = l.code;
    const me = l.seats.find((s) => s.id === session.me);
    const host = l.seats.find((s) => s.host);
    const iHost = !!me?.host;
    const kind = l.public ? 'Open to anyone in the tavern' : 'Private: share the code';
    lede.textContent =
      session.state === 'reconnecting'
        ? 'The connection wavers… reconnecting.'
        : `${MODE_NAME[l.mode]} · ${l.mode === 'teams' ? `${l.size / 2} against ${l.size / 2}` : `${l.size} seats`} · ${kind}`;
    seats.replaceChildren();
    for (let i = 0; i < l.size; i++) {
      const s = l.seats[i];
      if (!s) {
        seats.append(h('li', { class: 'seat empty' }, h('span', { class: 'dot' }), h('i', {}, 'An empty chair')));
        continue;
      }
      const li = h(
        'li',
        { class: `seat${s.id === session.me ? ' me' : ''}${s.connected ? '' : ' away'}${s.team != null ? ' team-' + s.team : ''}` },
        h('span', { class: 'dot' }),
        h('b', {}, s.name),
        s.id === session.me ? h('em', {}, 'you') : null,
        s.host ? h('em', { class: 'host' }, 'host') : null,
        s.connected ? null : h('em', {}, 'away')
      );
      if (s.team != null) {
        const chip = h('button', { class: 'team-chip t' + s.team, disabled: s.id === session.me && l.status === 'waiting' ? null : 'true' }, TEAM_NAME[s.team]) as HTMLButtonElement;
        chip.title = s.id === session.me ? 'Switch sides' : '';
        chip.addEventListener('click', () => {
          audio.play('tick');
          session.setTeam(1 - s.team!);
        });
        li.append(chip);
      }
      seats.append(li);
    }
    right.replaceChildren();
    if (l.status === 'over') right.append(button('btn-text', 'Another round', () => session.again()));
    else if (iHost) {
      const filled = l.seats.length;
      right.append(button('btn-text', filled < l.size ? 'Start the night' : 'Begin', () => session.start()));
    } else right.append(h('span', { class: 'wait' }, `Waiting for ${host?.name ?? 'the host'} to begin…`));
    note.style.visibility = l.seats.length < l.size ? 'visible' : 'hidden';
  };

  const off = session.on({
    lobby: (l) => (l.status === 'playing' ? go(l) : render(l)),
    state: () => session.lobby && render(session.lobby),
    error: (m) => toast(nav.layer, m),
    closed: (m) => {
      if (m) toast(nav.layer, m);
      dispose();
      onClose();
    },
  });
  const dispose = () => {
    off();
    el.remove();
  };
  if (session.lobby) {
    if (session.lobby.status === 'playing') queueMicrotask(() => go(session.lobby!));
    else render(session.lobby);
  }
  return { el, dispose };
}

/** "Join a Table": public tables waiting for players, and joining a private table by its code. */
export function joinModal(nav: Nav, onJoin: (s: OnlineSession) => void, onClose: () => void): Modal {
  const list = h('div', { class: 'open-tables' }, h('p', { class: 'empty' }, 'Looking around the tavern…'));
  const input = h('input', { class: 'code-input', maxlength: '8', placeholder: 'CODE', 'aria-label': 'Table code', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') joinCode();
  });
  input.addEventListener('input', () => (input.value = normalizeCode(input.value)));
  const join = (code: string) => {
    dispose();
    onJoin(OnlineSession.join(code, profile.name, lookFromProfile()));
  };
  const joinCode = () => {
    const c = normalizeCode(input.value);
    if (c.length < 4) {
      input.focus();
      return toast(nav.layer, 'Enter the table code');
    }
    audio.play('paper');
    join(c);
  };
  const close = button('btn-text', 'Close', () => {
    dispose();
    onClose();
  });
  const el = h(
    'div',
    { class: 'scrim' },
    h(
      'div',
      { class: 'panel join' },
      h('h2', {}, 'Join a Table'),
      h('p', { class: 'lede' }, 'Sit down with other patrons of the Hand.'),
      h('h3', {}, 'Open tables'),
      list,
      h('h3', {}, 'Private table'),
      h('div', { class: 'code-row' }, input, button('btn-text', 'Join', joinCode)),
      h('div', { class: 'row' }, close)
    )
  );
  el.addEventListener('click', (e) => {
    if (e.target === el) {
      dispose();
      onClose();
    }
  });

  let alive = true;
  const refresh = async () => {
    const rooms = await listRooms();
    if (!alive) return;
    list.replaceChildren();
    if (!rooms.length) list.append(h('p', { class: 'empty' }, 'No open tables right now. Create one and others can join.'));
    for (const r of rooms) {
      const row = h(
        'button',
        { class: 'open-table' },
        h('b', {}, `${r.host}'s table`),
        h('span', {}, `${MODE_NAME[r.mode]} · ${r.players}/${r.size}`),
        h('em', {}, 'Join')
      );
      row.addEventListener('pointerenter', () => audio.play('hover'));
      row.addEventListener('click', () => {
        audio.play('paper');
        join(r.code);
      });
      list.append(row);
    }
  };
  void refresh();
  const timer = window.setInterval(() => void refresh(), 3000);
  const dispose = () => {
    alive = false;
    clearInterval(timer);
    el.remove();
  };
  setTimeout(() => input.focus(), 50);
  return { el, dispose };
}
