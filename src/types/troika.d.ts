declare module 'troika-three-text' {
  import type { Material, Mesh, Color } from 'three';
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    anchorX: number | 'left' | 'center' | 'right' | string;
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom' | string;
    color: number | string | Color;
    letterSpacing: number;
    lineHeight: number | 'normal';
    maxWidth: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    outlineBlur: number | string;
    outlineOpacity: number;
    strokeWidth: number | string;
    strokeColor: number | string | Color;
    fillOpacity: number;
    depthOffset: number;
    curveRadius: number;
    sdfGlyphSize: number;
    material: Material;
    sync(cb?: () => void): void;
    dispose(): void;
  }
  export function preloadFont(opts: { font: string; characters?: string }, cb: () => void): void;
}
