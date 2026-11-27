/**
 * Presentation durations (ms). The authoritative host reserves this much time after each event so every
 * client's animation finishes before the next decision point. Client animations must fit inside these.
 */
export const DUR = {
  start: 1500,
  deal: 280,
  intro: 2200,
  // Passing the turn is near instant: a 1v1 where both players click the deck as fast as they can gets through
  // well over four draws a second (draw + turn = 130 ms, plus the connection's round trip).
  turn: 40,
  // The played card floats up above the pile with its name under it, then lands.
  play: 1200,
  window: 0,
  parry: 680,
  redirect: 420,
  privateer: 600,
  resolve: 100,
  burn: 1050,
  copy: 820,
  pass: 750,
  scry: 680,
  scryEnd: 520,
  shuffle: 980,
  reveal: 1650,
  givePrompt: 220,
  steal: 980,
  owed: 480,
  reverse: 420,
  lock: 1100,
  unlock: 520,
  ward: 980,
  warded: 980,
  retake: 820,
  swap: 1350,
  // A plain draw is quick; drawing the Hooded Hand keeps a moment of suspense (DRAW_HAND).
  draw: 90,
  doom: 2550,
  rescue: 1950,
  hidePrompt: 220,
  hidden: 1120,
  slain: 2850,
  over: 400,
} as const;

/** A draw that turns up the Hooded Hand (the pull keeps its suspense). */
export const DRAW_HAND = 650;

export const DEFAULT_TIMERS = {
  turnMs: 30_000,
  reactionMs: 1_800,
  rescueMs: 6_500,
  hideMs: 10_000,
  scryMs: 7_000,
  giveMs: 7_000,
};
