/**
 * Presentation durations (ms). The authoritative host reserves this much time after each event so every
 * client's animation finishes before the next decision point. Client animations must fit inside these.
 */
export const DUR = {
  start: 2000,
  deal: 560,
  intro: 3000,
  turn: 900,
  play: 950,
  window: 0,
  parry: 900,
  redirect: 1000,
  privateer: 800,
  resolve: 350,
  burn: 1400,
  copy: 1100,
  pass: 1000,
  scry: 900,
  scryEnd: 700,
  shuffle: 1300,
  reveal: 2200,
  givePrompt: 300,
  steal: 1300,
  owed: 1100,
  reverse: 1300,
  lock: 1500,
  unlock: 700,
  ward: 1300,
  warded: 1300,
  retake: 1100,
  swap: 1800,
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
  giveMs: 9_000,
};
