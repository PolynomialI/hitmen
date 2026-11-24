import { Bot } from './bot';
import type { Setup } from './engine';
import type { Action, GameEvent, PlayerId, PlayerView } from './types';

/**
 * Tutorial: a stacked deck and a scripted rival that walk the player through every core moment:
 * reading cards, scrying, drawing, parrying out of turn, marking a rival, surviving the Hooded Hand
 * with a Guardian Angel, hiding it, and watching the rival fall.
 */
export function tutorialSetup(human: PlayerId, bot: PlayerId): Setup {
  return {
    first: human,
    hands: {
      [human]: ['angel', 'scry', 'bounty', 'parry'],
      [bot]: ['pickpocket', 'slip', 'parry'],
    },
    deck: ['scry', 'hand', 'slip', 'brawl', 'pickpocket', 'backdoor', 'bounty', 'slip', 'scry'],
    reactionFor: (p) => {
      if (p.player === bot && p.card.type === 'pickpocket' && !p.cancelled) return 60_000;
      return null;
    },
  };
}

export class TutorialBot extends Bot {
  private human: PlayerId;
  private botTurns = 0;
  private pickpocketDone = false;

  constructor(id: PlayerId, human: PlayerId) {
    super(id, 7, 1);
    this.human = human;
  }

  observe(ev: GameEvent): void {
    super.observe(ev);
    if (ev.e === 'turn' && ev.player === this.id) this.botTurns++;
    if (ev.e === 'resolve' && ev.player === this.id && ev.card.type === 'pickpocket') this.pickpocketDone = true;
  }

  protected thinkTime(v: PlayerView): number {
    if (v.phase === 'reaction') return 900;
    return 1700;
  }

  protected decide(v: PlayerView): Action | null {
    if (v.phase === 'reaction') {
      const p = v.pending!;
      if (p.player === this.human && p.card.type === 'bounty' && !p.cancelled) {
        const parry = this.has(v, 'parry');
        if (parry) return { t: 'react', cardId: parry.id };
      }
      return null;
    }
    if (v.phase === 'turn' && v.sync.current === this.id) {
      if (this.botTurns === 1) {
        const pp = this.has(v, 'pickpocket');
        if (pp && !this.pickpocketDone) return { t: 'play', cardId: pp.id, targetId: this.human };
        const slip = this.has(v, 'slip');
        if (slip) return { t: 'play', cardId: slip.id };
      }
      if (this.botTurns === 2) return { t: 'draw' };
    }
    if (v.phase === 'turn') return v.sync.current === this.id ? super.decide(v) : null;
    return super.decide(v);
  }
}
