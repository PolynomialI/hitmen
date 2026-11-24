// Card catalogue for The Hooded Hand.
// Mechanics are genre-standard ("don't draw the deadly card"); names, flavour and art are original to this project.

export type CardType =
  | 'hand'
  | 'angel'
  | 'scry'
  | 'parry'
  | 'bounty'
  | 'slip'
  | 'brawl'
  | 'pickpocket'
  | 'backdoor';

export interface Card {
  id: number;
  type: CardType;
}

export interface CardDef {
  type: CardType;
  name: string;
  /** One or two short sentences shown in the hover preview. */
  text: string;
  /** Longer flavour line for the codex. */
  flavour: string;
  /** Primary field colour of the card face. */
  color: string;
  /** Darker shade used for gradients and frames. */
  shade: string;
  /** Can be played at any time, including out of turn (shown with a spark badge). */
  instant?: boolean;
  /** Requires choosing a mark (shown with a target badge). */
  targeted?: boolean;
  /** Can be played voluntarily from the hand during your turn. */
  playable: boolean;
}

export const CARD_DEFS: Record<CardType, CardDef> = {
  hand: {
    type: 'hand',
    name: 'The Hooded Hand',
    text: 'Draw this and you are slain, unless a Guardian Angel watches over you.',
    flavour: 'Nobody sees the face beneath the hood. Nobody who lives, anyway.',
    color: '#9b1c1c',
    shade: '#3d0707',
    playable: false,
  },
  angel: {
    type: 'angel',
    name: 'Guardian Angel',
    text: 'Saves you when you draw the Hooded Hand. Then hide it back in the deck.',
    flavour: 'Some say she answers prayers. Most say she answers coin.',
    color: '#1f8a55',
    shade: '#0b3a22',
    playable: false,
  },
  scry: {
    type: 'scry',
    name: 'Scrying Orb',
    text: 'Secretly view the top 3 cards of the deck.',
    flavour: 'The glass shows what is coming. It never says when.',
    color: '#6a2fa0',
    shade: '#2a0f45',
    playable: true,
  },
  parry: {
    type: 'parry',
    name: 'Parry',
    text: 'When a card is played, cancel its effect. Play it at any time.',
    flavour: 'Steel meets steel. Nothing happens. Everyone breathes again.',
    color: '#2f5f9e',
    shade: '#0f2443',
    instant: true,
    playable: false,
  },
  bounty: {
    type: 'bounty',
    name: 'Bounty',
    text: 'End your turn without drawing. The player you mark must take 2 turns.',
    flavour: 'Twelve crowns on a head is twelve reasons to look over your shoulder.',
    color: '#c2581b',
    shade: '#4f1d05',
    targeted: true,
    playable: true,
  },
  slip: {
    type: 'slip',
    name: 'Slip Away',
    text: 'End your turn without drawing.',
    flavour: 'A loose shutter, a dark alley, and a very convenient excuse.',
    color: '#6f9a1e',
    shade: '#263a06',
    playable: true,
  },
  brawl: {
    type: 'brawl',
    name: 'Tavern Brawl',
    text: 'Shuffle the deck.',
    flavour: 'Somebody threw a stool. Now nobody knows where anything is.',
    color: '#b48a16',
    shade: '#4a3604',
    playable: true,
  },
  pickpocket: {
    type: 'pickpocket',
    name: 'Pickpocket',
    text: 'Steal a random card from the player you mark.',
    flavour: 'Light fingers, heavy purse.',
    color: '#1d7a78',
    shade: '#08302f',
    targeted: true,
    playable: true,
  },
  backdoor: {
    type: 'backdoor',
    name: 'Back Door',
    text: 'End your turn by drawing from the bottom of the deck.',
    flavour: 'Every tavern has one. The wise know where it is before they sit down.',
    color: '#7a4a26',
    shade: '#2c180a',
    playable: true,
  },
};

export const CARD_ORDER: CardType[] = [
  'hand',
  'angel',
  'parry',
  'scry',
  'bounty',
  'slip',
  'pickpocket',
  'brawl',
  'backdoor',
];

/** Action cards that make up the shuffled pool (deadly card and angels are added separately). */
export const ACTION_POOL_1V1: Partial<Record<CardType, number>> = {
  scry: 4,
  parry: 4,
  bounty: 3,
  slip: 4,
  brawl: 2,
  pickpocket: 3,
  backdoor: 2,
};

export function def(t: CardType): CardDef {
  return CARD_DEFS[t];
}
