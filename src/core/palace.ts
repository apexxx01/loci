/**
 * Palace lifecycle: build from a deck, record reviews, persist safely.
 * Storage is injected so the same code runs against localStorage in the
 * headset and an in-memory map in tests.
 */
import { PalaceSchema } from './schema.js';
import { newCard, review, type RecallRating } from './scheduler.js';
import type { Deck, Palace, Placement } from './types.js';

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'loci.palace.v1';

export function createPalace(deck: Deck, placements: Placement[], now: Date, id?: string): Palace {
  const cards: Palace['cards'] = {};
  for (const item of deck.items) cards[item.id] = newCard(now);
  return {
    version: 1,
    id: id ?? `p_${now.getTime().toString(36)}`,
    deck,
    createdAt: now.toISOString(),
    placements,
    cards,
    history: [],
  };
}

/** Returns a new palace with one review applied. Unknown ids are ignored. */
export function recordReview(
  palace: Palace,
  memoryId: string,
  rating: RecallRating,
  now: Date,
): Palace {
  const card = palace.cards[memoryId];
  if (!card) return palace;
  return {
    ...palace,
    cards: { ...palace.cards, [memoryId]: review(card, rating, now) },
    history: [...palace.history, { memoryId, at: now.toISOString(), rating }].slice(-5000),
  };
}

/** Replace placements (after the learner moves a tile, or a remap). */
export function withPlacements(palace: Palace, placements: Placement[]): Palace {
  return { ...palace, placements };
}

/* ------------------------------------------------------------------ library
 * A learner keeps several palaces (a speech, a vocabulary set, a number...).
 * They share the room's persistent anchor; one is active at a time.
 */
export const LIBRARY_KEY = 'loci.library.v2';
export const MAX_PALACES = 12;

export interface Library {
  version: 2;
  activeId: string | null;
  palaces: Record<string, Palace>;
}

const emptyLibrary = (): Library => ({ version: 2, activeId: null, palaces: {} });

/** Read the library, migrating a single v1 palace if that is all there is. */
export function loadLibrary(store: KeyValue): { library: Library; corrupt: string | null } {
  let raw: string | null = null;
  let legacy: string | null = null;
  try {
    raw = store.getItem(LIBRARY_KEY);
    legacy = store.getItem(STORAGE_KEY);
  } catch {
    return { library: emptyLibrary(), corrupt: null };
  }
  if (raw) {
    try {
      const data = JSON.parse(raw) as Library;
      const lib = emptyLibrary();
      for (const [id, p] of Object.entries(data.palaces ?? {})) {
        const parsed = PalaceSchema.safeParse(p);
        if (parsed.success) lib.palaces[id] = parsed.data as Palace;
      }
      lib.activeId = data.activeId && lib.palaces[data.activeId] ? data.activeId : null;
      return { library: lib, corrupt: null };
    } catch (e) {
      return { library: emptyLibrary(), corrupt: (e as Error).message };
    }
  }
  if (legacy) {
    try {
      const parsed = PalaceSchema.safeParse(JSON.parse(legacy));
      if (!parsed.success) return { library: emptyLibrary(), corrupt: parsed.error.issues[0]?.message ?? 'invalid' };
      const palace = parsed.data as Palace;
      return { library: { version: 2, activeId: palace.id, palaces: { [palace.id]: palace } }, corrupt: null };
    } catch (e) {
      return { library: emptyLibrary(), corrupt: (e as Error).message };
    }
  }
  return { library: emptyLibrary(), corrupt: null };
}

export function saveLibrary(store: KeyValue, library: Library): boolean {
  try {
    store.setItem(LIBRARY_KEY, JSON.stringify(library));
    store.removeItem(STORAGE_KEY);
    return true;
  } catch {
    // Quota exceeded or storage disabled (private mode). The session keeps
    // working in memory; the UI warns that progress won't survive.
    return false;
  }
}

/**
 * Record a recall made away from the headset (the browser review). Updates the
 * palace in place and leaves whichever palace is in the room where it is.
 */
export function reviewInLibrary(
  store: KeyValue,
  palaceId: string,
  memoryId: string,
  rating: RecallRating,
  now: Date,
): Palace | null {
  const { library } = loadLibrary(store);
  const palace = library.palaces[palaceId];
  if (!palace || !palace.cards[memoryId]) return null;
  const next = recordReview(palace, memoryId, rating, now);
  library.palaces[palaceId] = next;
  return saveLibrary(store, library) ? next : null;
}

/** Save a palace and make it the active one. Oldest palaces drop off past the cap. */
export function savePalace(store: KeyValue, palace: Palace): boolean {
  const { library } = loadLibrary(store);
  library.palaces[palace.id] = palace;
  library.activeId = palace.id;
  const ids = Object.keys(library.palaces);
  if (ids.length > MAX_PALACES) {
    const oldest = ids
      .filter((id) => id !== palace.id)
      .sort((x, y) => library.palaces[x].createdAt.localeCompare(library.palaces[y].createdAt))[0];
    delete library.palaces[oldest];
  }
  return saveLibrary(store, library);
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; palace: Palace }
  | { status: 'corrupt'; error: string };

/** The active palace, if any. */
export function loadPalace(store: KeyValue): LoadResult {
  const { library, corrupt } = loadLibrary(store);
  if (corrupt) return { status: 'corrupt', error: corrupt };
  const palace = library.activeId ? library.palaces[library.activeId] : undefined;
  return palace ? { status: 'ok', palace } : { status: 'empty' };
}

export function listPalaces(store: KeyValue): Palace[] {
  return Object.values(loadLibrary(store).library.palaces).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function setActivePalace(store: KeyValue, id: string | null): Palace | null {
  const { library } = loadLibrary(store);
  library.activeId = id && library.palaces[id] ? id : null;
  saveLibrary(store, library);
  return library.activeId ? library.palaces[library.activeId] : null;
}

export function deletePalace(store: KeyValue, id: string): void {
  const { library } = loadLibrary(store);
  delete library.palaces[id];
  if (library.activeId === id) library.activeId = null;
  saveLibrary(store, library);
}

export function clearPalace(store: KeyValue): void {
  try {
    store.removeItem(STORAGE_KEY);
    store.removeItem(LIBRARY_KEY);
  } catch {
    /* ignore */
  }
}

export class MemoryStore implements KeyValue {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
