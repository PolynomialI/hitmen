// Player settings: graphics quality and resolution, volumes, frame-rate display and cap. Saved per browser; works
// (in memory) if storage is blocked. Read before the renderer starts.
import type { Quality } from '../core/gfx';

export type QualityChoice = 'auto' | Quality;
/** 'auto' adapts to the device; a number is a fixed share of the screen's native resolution. */
export type ResolutionChoice = 'auto' | number;

export interface Settings {
  quality: QualityChoice;
  resolution: ResolutionChoice;
  master: number;
  music: number;
  effects: number;
  ambience: number;
  showFps: boolean;
  /** Cap at 30 frames per second (steadier and cooler on weak machines). */
  cap30: boolean;
}

const KEY = 'hooded-hand-settings-v1';
const DEFAULTS: Settings = { quality: 'auto', resolution: 'auto', master: 1, music: 1, effects: 1, ambience: 1, showFps: false, cap30: false };

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Settings>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();
const listeners = new Set<(s: Settings) => void>();

export function saveSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage blocked: keep for this visit */
  }
  for (const fn of listeners) fn(settings);
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
