/**
 * Presentation durations (ms). The authoritative host reserves this much time after each event so every
 * client's animation finishes before the next decision point. Client animations must fit inside these.
 */
export const DUR = {
  start: 400,
  deal: 620,
  intro: 2600,
  turn: 900,
  play: 950,
  window: 0,
  parry: 900,
  resolve: 350,
  scry: 900,
  scryEnd: 700,
  shuffle: 1300,
  steal: 1300,
  owed: 1100,
  draw: 1050,
  doom: 3400,
  rescue: 2600,
  hidePrompt: 300,
  hidden: 1500,
  slain: 7600,
  over: 500,
} as const;

export const DEFAULT_TIMERS = {
  turnMs: 35_000,
  reactionMs: 2_400,
  rescueMs: 8_000,
  hideMs: 12_000,
  scryMs: 9_000,
};
