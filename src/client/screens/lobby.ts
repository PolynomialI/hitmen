// Online tables in the play menu: the waiting room of a table, and the "Join a Table" panel (open tables + code).
import { engineMode, normalizeCode, QUEUE_SIZE, type LobbyInfo, type OnlineMode, type QueueMode } from '../../shared/online';
import { audio } from '../audio/audio';
import { lookFromProfile } from '../cosmetics/apply';
import { listRooms, liveTables, OnlineSession } from '../net/online';
import { h } from '../ui/dom';
import { toast } from '../ui/hud';
import { profile } from '../ui/profile';
import type { Nav } from './menus';

export const MODE_NAME: Record<OnlineMode, string> = { original: 'Original', teams: 'Teams', scrimmage: 'Scrimmage', winter: 'Winter Feast', duel: 'Duel' };
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
  // An invite link opens the game straight into this table (no code to type).
  const copy = button('copy', 'Copy invite link', () => {
    const c = session.room;
    if (!c) return;
    const link = `${location.origin}${location.pathname}?join=${c}`;
    const shown = () => toast(nav.layer, 'Invite link copied', 'Send it to your friends');
    const fallback = () => toast(nav.layer, `Table code: ${c}`, link);
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(shown, fallback);
    else fallback();
  });
  const lede = h('p', { class: 'lede' }, 'Setting the table…');
  const seats = h('ol', { class: 'seats' });
  const note = h('p', { class: 'note' }, 'Waiting for players…');
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
    nav.startMatch({ mode: engineMode(l.mode), rivals: l.seats.length - 1, online: session });
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
      // The host can ask someone to leave before the night begins.
      if (iHost && s.id !== session.me && l.status === 'waiting') {
        const kick = h('button', { class: 'kick', title: `Ask ${s.name} to leave` }, '✕');
        kick.addEventListener('click', () => {
          audio.play('click');
          session.kick(s.id);
        });
        li.append(kick);
      }
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
      // Real players only: the night can begin once someone else has sat down (and in Teams, both sides have a player).
      const sides = [0, 1].map((t) => l.seats.filter((x) => x.team === t).length);
      const ready = l.seats.length >= 2 && (l.mode !== 'teams' || sides.every((n) => n > 0));
      const go = button('btn-text', 'Begin', () => session.start());
      if (!ready) go.setAttribute('disabled', 'true');
      right.append(go);
    } else right.append(h('span', { class: 'wait' }, `Waiting for ${host?.name ?? 'the host'} to begin…`));
    note.style.visibility = l.seats.length < 2 ? 'visible' : 'hidden';
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
  // Leaving the waiting room any other way than into the match (Leave, Back to the menu) gives up the seat: a player
  // who is not looking at the table must not be dealt in.
  const dispose = () => {
    off();
    el.remove();
    if (!started && session.state !== 'closed') session.leave();
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
  let shown = '';
  const refresh = async () => {
    const rooms = await listRooms();
    if (!alive) return;
    // Only rebuild when something changed: a row replaced under the pointer would swallow the click.
    const key = JSON.stringify(rooms.map((r) => [r.code, r.host, r.mode, r.players, r.size]));
    if (key === shown) return;
    shown = key;
    list.replaceChildren();
    if (!rooms.length) list.append(h('p', { class: 'empty' }, 'No open tables right now.'));
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

/** Duel / Teams: wait for real players; the server deals as soon as there are enough. */
export function queueModal(nav: Nav, mode: QueueMode, onClose: () => void): Modal {
  const need = QUEUE_SIZE[mode];
  const count = h('b', { class: 'q-count' }, `1 / ${need}`);
  const dots = h('div', { class: 'q-dots' }, ...Array.from({ length: need }, (_, i) => h('i', { class: i === 0 ? 'on' : '' })));
  const session = OnlineSession.queue(mode, profile.name, lookFromProfile());
  let done = false;
  const cancel = button('btn-text', 'Cancel', () => {
    dispose();
    onClose();
  });
  const el = h(
    'div',
    { class: 'scrim' },
    h('div', { class: 'panel queue' }, h('h2', {}, mode === 'duel' ? 'Duel' : 'Teams'), dots, count, h('div', { class: 'row' }, h('span'), cancel))
  );
  const off = session.on({
    queued: (waiting, n) => {
      count.textContent = `${Math.min(waiting, n)} / ${n}`;
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < waiting));
      audio.play('tick');
    },
    lobby: (l) => {
      if (done || l.status !== 'playing') return;
      done = true;
      dispose();
      onClose();
      audio.play('paper');
      nav.startMatch({ mode: engineMode(l.mode), rivals: l.seats.length - 1, online: session });
    },
    error: (m) => toast(nav.layer, m),
    closed: (m) => {
      if (done) return;
      if (m) toast(nav.layer, m);
      dispose();
      onClose();
    },
  });
  // However the window goes away (Cancel, Back, another panel), a player not yet dealt in gives up their place.
  const dispose = () => {
    off();
    el.remove();
    if (!done) {
      done = true;
      session.leave();
    }
  };
  return { el, dispose };
}

/** Watch Table: matches being played, to watch from the players' chairs (no hands shown). */
export function watchModal(nav: Nav, onClose: () => void): Modal {
  const list = h('div', { class: 'open-tables' }, h('p', { class: 'empty' }, 'Looking around the tavern…'));
  const close = button('btn-text', 'Close', () => {
    dispose();
    onClose();
  });
  const el = h('div', { class: 'scrim' }, h('div', { class: 'panel join' }, h('h2', {}, 'Watch a Table'), list, h('div', { class: 'row' }, close)));
  el.addEventListener('click', (e) => {
    if (e.target === el) {
      dispose();
      onClose();
    }
  });
  const watch = (code: string) => {
    dispose();
    onClose();
    const s = OnlineSession.watch(code);
    const off = s.on({
      lobby: (l) => {
        off();
        nav.startMatch({ mode: engineMode(l.mode), rivals: l.seats.length - 1, online: s, spectate: true });
      },
      closed: (m) => {
        off();
        if (m) toast(nav.layer, m);
      },
    });
  };
  let alive = true;
  let shown = '';
  const refresh = async () => {
    const live = await liveTables();
    if (!alive) return;
    const key = JSON.stringify(live.map((t) => [t.code, t.alive, t.watchers]));
    if (key === shown) return;
    shown = key;
    list.replaceChildren();
    if (!live.length) list.append(h('p', { class: 'empty' }, 'No matches being played right now.'));
    for (const t of live) {
      const row = h('button', { class: 'open-table' }, h('b', {}, t.players.join(', ')), h('span', {}, `${MODE_NAME[t.mode]} · ${t.alive} left`), h('em', {}, 'Watch'));
      row.addEventListener('pointerenter', () => audio.play('hover'));
      row.addEventListener('click', () => {
        audio.play('paper');
        watch(t.code);
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
  return { el, dispose };
}
