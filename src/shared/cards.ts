// Card catalogue for The Hooded Hand.
// Mechanics follow the "don't draw the deadly card" genre; names, flavour and art are original to this project.

export type CardType =
  // Core
  | 'hand'
  | 'angel'
  | 'scry'
  | 'parry'
  | 'bounty'
  | 'slip'
  | 'brawl'
  | 'pickpocket'
  | 'backdoor'
  | 'breath'
  | 'glass'
  | 'shackles'
  | 'misdirect'
  | 'turnabout'
  // Teams
  | 'aegis'
  | 'warband'
  // Ranked
  | 'privateer'
  | 'sands'
  // Winter Feast (seasonal)
  | 'mistletoe'
  | 'yule';

export interface Card {
  id: number;
  type: CardType;
}

/** When a card may be played. */
export type Timing =
  /** Only on your own turn, when nothing is pending. */
  | 'turn'
  /** Any time no card is pending, including other players' turns. */
  | 'quick'
  /** Only while another card is in the air (its reaction window). */
  | 'reaction'
  /** Never played voluntarily (deadly card / rescue). */
  | 'never';

export interface CardDef {
  type: CardType;
  name: string;
  text: string;
  flavour: string;
  color: string;
  shade: string;
  timing: Timing;
  /** Shows the spark badge (playable outside your turn). */
  instant?: boolean;
  /** Requires choosing a player. */
  targeted?: boolean;
  /** Where the card comes from (codex grouping). */
  set: 'core' | 'teams' | 'ranked' | 'winter';
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
    timing: 'never',
    set: 'core',
    playable: false,
  },
  angel: {
    type: 'angel',
    name: 'Guardian Angel',
    text: 'Saves you when you draw the Hooded Hand. Then hide it back in the deck.',
    flavour: 'Some say she answers prayers. Most say she answers coin.',
    color: '#1f8a55',
    shade: '#0b3a22',
    timing: 'never',
    set: 'core',
    playable: false,
  },
  scry: {
    type: 'scry',
    name: 'Scrying Orb',
    text: 'Secretly view the top 3 cards of the deck.',
    flavour: 'The glass shows what is coming. It never says when.',
    color: '#6a2fa0',
    shade: '#2a0f45',
    timing: 'turn',
    set: 'core',
    playable: true,
  },
  parry: {
    type: 'parry',
    name: 'Parry',
    text: 'When a card is played, cancel its effect. Play it at any time.',
    flavour: 'Steel meets steel. Nothing happens. Everyone breathes again.',
    color: '#2f5f9e',
    shade: '#0f2443',
    timing: 'reaction',
    instant: true,
    set: 'core',
    playable: false,
  },
  bounty: {
    type: 'bounty',
    name: 'Bounty',
    text: 'End your turn without drawing. The player you mark must take 2 turns.',
    flavour: 'Twelve crowns on a head is twelve reasons to look over your shoulder.',
    color: '#c2581b',
    shade: '#4f1d05',
    timing: 'turn',
    targeted: true,
    set: 'core',
    playable: true,
  },
  slip: {
    type: 'slip',
    name: 'Slip Away',
    text: 'End your turn without drawing.',
    flavour: 'A loose shutter, a dark alley, and a very convenient excuse.',
    color: '#6f9a1e',
    shade: '#263a06',
    timing: 'turn',
    set: 'core',
    playable: true,
  },
  brawl: {
    type: 'brawl',
    name: 'Tavern Brawl',
    text: 'Shuffle the deck. Play it at any time, even on another player\'s turn.',
    flavour: 'Somebody threw a stool. Now nobody knows where anything is.',
    color: '#b48a16',
    shade: '#4a3604',
    timing: 'quick',
    instant: true,
    set: 'core',
    playable: true,
  },
  pickpocket: {
    type: 'pickpocket',
    name: 'Pickpocket',
    text: 'The player you mark must hand you a card of their choosing.',
    flavour: 'Light fingers, heavy purse.',
    color: '#1d7a78',
    shade: '#08302f',
    timing: 'turn',
    targeted: true,
    set: 'core',
    playable: true,
  },
  backdoor: {
    type: 'backdoor',
    name: 'Back Door',
    text: 'End your turn by drawing from the bottom of the deck.',
    flavour: 'Every tavern has one. The wise know where it is before they sit down.',
    color: '#7a4a26',
    shade: '#2c180a',
    timing: 'turn',
    set: 'core',
    playable: true,
  },
  breath: {
    type: 'breath',
    name: "Dragon's Breath",
    text: 'When a card is played, burn it: its effect is cancelled and it is shuffled back into the deck.',
    flavour: 'Some arguments are settled with steel. Others with fire.',
    color: '#d0401a',
    shade: '#4a0d02',
    timing: 'reaction',
    instant: true,
    set: 'core',
    playable: false,
  },
  glass: {
    type: 'glass',
    name: 'Looking Glass',
    text: 'Copy the last card played. If it was a Guardian Angel, it can save you from the Hooded Hand.',
    flavour: 'The reflection does exactly what you did. Only faster.',
    color: '#3a8fb0',
    shade: '#0d3040',
    timing: 'turn',
    set: 'core',
    playable: true,
  },
  shackles: {
    type: 'shackles',
    name: 'Shackles',
    text: 'Chain the top card of the discard pile: nobody may play that kind of card for 3 turns.',
    flavour: 'Iron does not care what you meant to do.',
    color: '#5b5f66',
    shade: '#1c1e22',
    timing: 'turn',
    set: 'core',
    playable: true,
  },
  misdirect: {
    type: 'misdirect',
    name: 'Misdirection',
    text: 'When a card that marks a player is played, choose a new mark for it. Play it at any time.',
    flavour: '"Him. He did it." Works more often than it should.',
    color: '#8e2f7a',
    shade: '#320a2a',
    timing: 'reaction',
    instant: true,
    targeted: true,
    set: 'core',
    playable: false,
  },
  turnabout: {
    type: 'turnabout',
    name: 'Turnabout',
    text: 'End your turn without drawing and reverse the order of play.',
    flavour: 'The wheel turns. Mind your fingers.',
    color: '#2a8a6a',
    shade: '#0a3326',
    timing: 'turn',
    set: 'core',
    playable: true,
  },
  aegis: {
    type: 'aegis',
    name: 'Aegis',
    text: 'Ward a player. The next card that marks them fizzles. Teams only.',
    flavour: 'A shield is just a door you carry with you.',
    color: '#b8a040',
    shade: '#3e3410',
    timing: 'turn',
    targeted: true,
    set: 'teams',
    playable: true,
  },
  warband: {
    type: 'warband',
    name: 'Warband',
    text: 'End your turn without drawing. The rival you mark must take 3 turns. Teams only.',
    flavour: 'One bounty hunter is a nuisance. Five is a parade.',
    color: '#8a1f2f',
    shade: '#2e060c',
    timing: 'turn',
    targeted: true,
    set: 'teams',
    playable: true,
  },
  privateer: {
    type: 'privateer',
    name: 'Privateer',
    text: 'When another player plays a card, take a copy of it. If that card is then cancelled, they take your Privateer.',
    flavour: 'Not a thief. A licensed acquirer of other people\'s luck.',
    color: '#24506a',
    shade: '#081c26',
    timing: 'reaction',
    instant: true,
    set: 'ranked',
    playable: false,
  },
  sands: {
    type: 'sands',
    name: 'Sands of Time',
    text: 'Take the top card of the discard pile back into your hand.',
    flavour: 'Turn the glass over. Try that again.',
    color: '#c79a3a',
    shade: '#4a3410',
    timing: 'turn',
    set: 'ranked',
    playable: true,
  },
  mistletoe: {
    type: 'mistletoe',
    name: 'Mistletoe',
    text: 'Swap your whole hand with the player you mark. Winter Feast only.',
    flavour: 'Tradition demands a kiss. The Hand demands everything else.',
    color: '#2f8a3a',
    shade: '#0c3010',
    timing: 'turn',
    targeted: true,
    set: 'winter',
    playable: true,
  },
  yule: {
    type: 'yule',
    name: 'Yule Log',
    text: 'Shuffle the deck, then everyone sees the new top card. Play it at any time. Winter Feast only.',
    flavour: 'Throw it on the fire. Watch the sparks. Pray.',
    color: '#a8461f',
    shade: '#3a1406',
    timing: 'quick',
    instant: true,
    set: 'winter',
    playable: true,
  },
};

export const CARD_ORDER: CardType[] = [
  'hand',
  'angel',
  'parry',
  'breath',
  'misdirect',
  'scry',
  'bounty',
  'slip',
  'turnabout',
  'backdoor',
  'pickpocket',
  'brawl',
  'glass',
  'shackles',
  'aegis',
  'warband',
  'privateer',
  'sands',
  'mistletoe',
  'yule',
];

export type DeckKind = 'original' | 'teams' | 'ranked' | 'winter' | 'tutorial';

/** Relative weights of action cards for each deck. The pool is sized to the table (see poolFor). */
const BASE: Partial<Record<CardType, number>> = {
  scry: 4,
  parry: 5,
  bounty: 4,
  slip: 4,
  brawl: 2,
  pickpocket: 3,
  backdoor: 2,
  breath: 2,
  glass: 2,
  shackles: 2,
  misdirect: 2,
  turnabout: 3,
};

export const DECKS: Record<DeckKind, Partial<Record<CardType, number>>> = {
  original: BASE,
  tutorial: BASE,
  teams: { ...BASE, aegis: 3, warband: 2 },
  ranked: { ...BASE, privateer: 2, sands: 2, misdirect: 1, turnabout: 1 },
  winter: { ...BASE, brawl: 0, mistletoe: 3, yule: 3 },
};

/** Action cards in play for a table of n players: about 10 + 8n cards, spread by the deck's weights. */
export function poolFor(kind: DeckKind, n: number): CardType[] {
  const w = DECKS[kind];
  const target = 10 + 8 * n;
  const types = Object.entries(w).filter(([, c]) => (c ?? 0) > 0) as Array<[CardType, number]>;
  const total = types.reduce((s, [, c]) => s + c, 0);
  const out: CardType[] = [];
  // Largest remainder apportionment so every listed card appears at least once.
  const quotas = types.map(([t, c]) => ({ t, q: (c / total) * target }));
  for (const { t, q } of quotas) for (let i = 0; i < Math.max(1, Math.floor(q)); i++) out.push(t);
  const rest = quotas.sort((a, b) => (b.q % 1) - (a.q % 1));
  for (let i = 0; out.length < target && i < rest.length * 3; i++) out.push(rest[i % rest.length].t);
  return out;
}

export function def(t: CardType): CardDef {
  return CARD_DEFS[t];
}

/** Cards whose effect needs a mark. */
export function needsTarget(t: CardType): boolean {
  return !!CARD_DEFS[t].targeted;
}
