import '@fontsource/grenze-gotisch/400.css';
import '@fontsource/grenze-gotisch/600.css';
import '@fontsource/grenze-gotisch/800.css';
import '@fontsource/im-fell-english-sc/400.css';
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/400-italic.css';
import '@fontsource/alegreya/700.css';

/** Make sure the display fonts are actually loaded before we rasterise text into textures. */
export async function loadFonts(): Promise<void> {
  const faces = [
    '400 40px "Grenze Gotisch"',
    '600 40px "Grenze Gotisch"',
    '800 40px "Grenze Gotisch"',
    '400 40px "IM Fell English SC"',
    '400 20px "Alegreya"',
    'italic 400 20px "Alegreya"',
    '700 20px "Alegreya"',
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => undefined)));
}
