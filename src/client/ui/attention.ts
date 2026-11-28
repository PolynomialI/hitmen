// A silent nudge for a player in another tab: the page title says what is waiting for them ("Your turn"), with a
// small mark that blinks, until they come back to the tab or it no longer applies.
const BASE = document.title;
let timer = 0;
let shown: string | null = null;

/** Show `text` in the tab title while the page is hidden (null: clear it). */
export function attention(text: string | null): void {
  clearInterval(timer);
  timer = 0;
  shown = text && document.hidden ? text : null;
  if (!text || !document.hidden) {
    document.title = BASE;
    return;
  }
  let on = true;
  document.title = `● ${text} — ${BASE}`;
  timer = window.setInterval(() => {
    on = !on;
    document.title = `${on ? '●' : '○'} ${text} — ${BASE}`;
  }, 1000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) attention(null);
});

/** Clear the title's nudge only if it is this one. */
export function clearAttention(text: string): void {
  if (shown === text) attention(null);
}
