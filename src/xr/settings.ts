/**
 * Comfort and access settings, persisted per browser. Every interaction in
 * Loci has a path that needs no arm movement and no fine pinch.
 */
export interface Settings {
  /** Look at a memory for a moment to flip it; rate with look-to-press buttons. */
  dwell: boolean;
  /** Black cards, white text, yellow edge. */
  contrast: boolean;
  /** Tiles 35% larger. */
  large: boolean;
  /** No flights, hops or shakes; instant transitions. */
  calm: boolean;
  /** Spatial sound cues. */
  sound: boolean;
}

const KEY = 'loci.settings.v1';
const DEFAULTS: Settings = { dwell: false, contrast: false, large: false, calm: false, sound: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    const prefersCalm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { ...DEFAULTS, calm: prefersCalm, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

type Listener = (s: Settings, key: keyof Settings) => void;
const listeners = new Set<Listener>();

export function onSettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toggleSetting(key: keyof Settings): boolean {
  settings[key] = !settings[key];
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* private mode: setting lasts for this session */
  }
  for (const fn of listeners) fn(settings, key);
  return settings[key];
}
