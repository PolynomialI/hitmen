import { loadFonts } from '../client/fonts';
import { renderCard } from '../client/art/cardArt';
import { CARD_ORDER } from '../shared/cards';

(async () => {
  await loadFonts();
  for (const t of [...CARD_ORDER, 'back' as const]) {
    const c = await renderCard(t, 512);
    document.body.appendChild(c);
  }
  document.body.dataset.ready = '1';
})();
