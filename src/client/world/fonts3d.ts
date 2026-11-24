import gothic from '@fontsource/grenze-gotisch/files/grenze-gotisch-latin-700-normal.woff?url';
import gothicBlack from '@fontsource/grenze-gotisch/files/grenze-gotisch-latin-900-normal.woff?url';
import fell from '@fontsource/im-fell-english-sc/files/im-fell-english-sc-latin-400-normal.woff?url';
import serif from '@fontsource/alegreya/files/alegreya-latin-700-normal.woff?url';
import { preloadFont } from 'troika-three-text';

export const FONT3D = { gothic, gothicBlack, fell, serif };

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%:'!?.,-— ";

export function preload3DFonts(): Promise<void> {
  return Promise.all(
    Object.values(FONT3D).map((font) => new Promise<void>((res) => preloadFont({ font, characters: CHARS }, () => res())))
  ).then(() => undefined);
}
