import { audio } from '../audio/audio';
import { tweens } from '../core/tween';
import { h } from '../ui/dom';
import { profile, saveProfile } from '../ui/profile';
import { addXp, claimChallenge, defOf, levelProgress, progressChallenges, rankedResult, rankOf, refreshChallenges, xpForLevel, type MatchSummary } from '../ui/progression';
import type { MatchScreen } from './matchScreen';

/** Victory / defeat ledger with coins, XP, level-ups, ranked rating and challenge progress. */
export async function showResults(s: MatchScreen): Promise<void> {
  const r = s.result!;
  if (s.opts.spectate) {
    const back = h('button', { class: 'btn-text' }, 'Back to the board');
    back.addEventListener('click', () => s.leave());
    const again = h('button', { class: 'btn-text' }, 'Watch another');
    again.addEventListener('click', () => s.nav.startMatch(s.opts));
    s.ui.append(h('div', { class: 'scrim' }, h('div', { class: 'panel results' }, h('h2', {}, `${s.nameOf(r.winner ?? undefined)} wins the night`), h('p', { class: 'lede' }, 'The Hooded Hand claimed the rest.'), h('div', { class: 'row' }, back, again))));
    audio.play('win');
    return;
  }
  const mode = s.opts.mode;
  const me = s.me;
  const won = r.winners.includes(me);
  const st = r.stats[me];
  const rivals = s.seats.length - 1;
  const half = mode === 'scrimmage' ? 0.5 : 1;
  const lines: Array<[string, number]> = [['Sat at the table', 100]];
  if (st.played) lines.push([`Played cards ×${st.played}`, st.played * 20]);
  if (st.parries) lines.push([`Parries & burns ×${st.parries}`, st.parries * 25]);
  if (st.rescues) lines.push([`Survived the Hand ×${st.rescues}`, st.rescues * 75]);
  if (s.outlasted) lines.push([`Outlasted rivals ×${s.outlasted}`, s.outlasted * 60]);
  if (won) {
    const prize =
      mode === 'tutorial' ? (profile.tutorialDone ? 100 : 400) : mode === 'teams' ? 350 : mode === 'ranked' ? 500 : mode === 'winter' ? 450 : mode === 'scrimmage' ? 300 : 400 + 50 * rivals;
    lines.push([mode === 'tutorial' ? 'Finished the lesson' : mode === 'teams' ? 'Your team prevailed' : 'Last soul standing', prize]);
  }
  const total = Math.round(lines.reduce((a, [, v]) => a + v, 0) * half);
  const xp = Math.round((120 + st.played * 10 + st.rescues * 40 + s.outlasted * 35 + (won ? 250 : 0)) * half);
  const before = profile.coins;
  const lvlBefore = levelProgress();
  profile.coins += total;
  const levels = addXp(xp);
  profile.stats.matches++;
  if (won) profile.stats.wins++;
  profile.stats.rescues += st.rescues;
  profile.stats.played += st.played;
  profile.stats.parries += st.parries;
  profile.stats.outlasted += s.outlasted;
  if (!won) profile.stats.slain++;
  if (mode !== 'tutorial') {
    if (won) profile.wins++;
    else profile.losses++;
  }
  let rankLine: HTMLElement | null = null;
  if (mode === 'ranked') {
    const rival = s.seats.find((x) => x.id !== me)!;
    const delta = rankedResult(rival.name, won);
    const rk = rankOf(profile.ranked.rating);
    rankLine = h('div', { class: 'rank-line' }, `Renown ${delta >= 0 ? '+' : ''}${delta} → ${profile.ranked.rating} (${rk.name})`);
  }
  saveProfile({ tutorialDone: profile.tutorialDone || (mode === 'tutorial' && won) });
  refreshChallenges();
  const summary: MatchSummary = { mode, won, played: st.played, parries: st.parries, rescues: st.rescues, outlasted: s.outlasted, scried: s.myScried, marked: s.myMarked, rivals };
  const completed = mode === 'tutorial' ? [] : progressChallenges(summary);

  s.nav.hud.showProfile(true);
  s.nav.hud.bumpCoins(before, profile.coins);
  audio.play(won ? 'win' : 'lose');
  if (!won) {
    void tweens.to(1.2, (k) => {
      s.app.rig.offset.multiplyScalar(1 - k);
      s.app.rig.targetOffset.multiplyScalar(1 - k);
      s.app.gfx.grade.u('uFade').value = Math.min(s.app.gfx.grade.u('uFade').value, 0.9) * (1 - k) + 0.35 * k;
    });
  }

  // ---- ledger
  const ledger = h(
    'div',
    { class: 'ledger' },
    ...lines.map(([l, v], i) => h('div', { style: `animation-delay:${0.3 + i * 0.16}s` }, h('span', {}, l), h('b', {}, h('i', { class: 'coin-ico' }), '+' + Math.round(v * half)))),
    h('div', { class: 'total', style: `animation-delay:${0.3 + lines.length * 0.16}s` }, h('span', {}, 'Total'), h('b', {}, h('i', { class: 'coin-ico' }), '+' + total))
  );
  // ---- xp bar
  const fill = h('i');
  const lvlLabel = h('span', {}, `Level ${lvlBefore.level}`);
  const xpLabel = h('em', {}, `+${xp} XP`);
  const xpBar = h('div', { class: 'xpbar' }, lvlLabel, h('div', { class: 'bar' }, fill), xpLabel);
  fill.style.width = `${(lvlBefore.into / lvlBefore.need) * 100}%`;
  setTimeout(async () => {
    let lv = lvlBefore.level;
    for (const L of levels) {
      fill.style.transition = 'width .7s ease';
      fill.style.width = '100%';
      await new Promise((r2) => setTimeout(r2, 750));
      fill.style.transition = 'none';
      fill.style.width = '0%';
      lv = L;
      lvlLabel.textContent = `Level ${lv}`;
      audio.play('chime');
      const up = h('div', { class: 'levelup' }, `Level ${L}! +400 coins, +1 ruby`);
      xpBar.after(up);
      await new Promise((r2) => setTimeout(r2, 60));
    }
    fill.style.transition = 'width .9s ease';
    fill.style.width = `${(profile.xp / xpForLevel(profile.level)) * 100}%`;
  }, 900 + lines.length * 160);

  // ---- challenges
  const chal = h('div', { class: 'panel challenges-panel' }, h('h2', {}, 'Challenges'));
  const renderList = (title: string, items: typeof profile.daily.items) => {
    chal.append(h('h4', {}, title));
    for (const c of items) {
      const d = defOf(c.id);
      if (!d) continue;
      const pct = Math.min(1, c.progress / d.goal);
      const claim = h('button', { class: 'claim' + (c.claimed ? ' done' : pct >= 1 ? ' ready' : '') }, c.claimed ? 'Claimed' : pct >= 1 ? 'Claim' : `${c.progress}/${d.goal}`);
      claim.addEventListener('click', () => {
        if (claimChallenge(c.id)) {
          audio.play('coins');
          claim.textContent = 'Claimed';
          claim.className = 'claim done';
          s.nav.hud.bumpCoins(profile.coins - d.reward.coins, profile.coins);
        }
      });
      const fresh = completed.includes(c.id);
      chal.append(
        h(
          'div',
          { class: 'chal' + (fresh ? ' fresh' : '') },
          h('div', { class: 'ct' }, h('span', {}, d.text), h('small', {}, `${d.reward.coins} coins${d.reward.rubies ? ` · ${d.reward.rubies} ruby` : ''}${d.reward.tokens ? ` · ${d.reward.tokens} token` : ''}`)),
          h('div', { class: 'cbar' }, h('i', { style: `width:${pct * 100}%` })),
          claim
        )
      );
    }
  };
  renderList('Daily', profile.daily.items);
  renderList('Weekly', profile.weekly.items);

  const again = h('button', { class: 'btn-text' }, mode === 'tutorial' ? 'Play for real' : s.opts.online ? 'Back to the table' : 'Another round');
  again.addEventListener('click', () => {
    audio.play('click');
    if (s.opts.online) s.backToTable();
    else s.nav.startMatch(mode === 'tutorial' ? { mode: 'original', rivals: 1 } : s.opts);
  });
  const leave = h('button', { class: 'btn-text' }, 'Leave the table');
  leave.addEventListener('click', () => {
    audio.play('click');
    s.leave();
  });
  const title = won ? (mode === 'tutorial' ? 'Lesson learned' : mode === 'teams' ? 'Your team survives' : 'You survived') : mode === 'teams' ? 'Your team has fallen' : 'You were slain';
  const lede = won
    ? mode === 'tutorial'
      ? 'You know the ways of the Hand now. Go and win some coin.'
      : 'The others will not be playing again tonight.'
    : '';
  const panel = h(
    'div',
    { class: 'scrim results-wrap' },
    h('div', { class: 'panel results' }, h('h2', {}, title), lede ? h('p', { class: 'lede' }, lede) : null, rankLine, ledger, xpBar, h('div', { class: 'row' }, leave, again)),
    mode === 'tutorial' ? null : chal
  );
  for (let i = 0; i < lines.length + 1; i++) audio.play('coins', { at: 0.35 + i * 0.16, vol: 0.4 });
  s.ui.append(panel);
}
