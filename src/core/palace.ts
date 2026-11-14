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

export function savePalace(store: KeyValue, palace: Palace): boolean {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(palace));
    return true;
  } catch {
    // Quota exceeded or storage disabled (private mode). The session keeps
    // working in memory; the UI warns that progress won't survive.
    return false;
  }
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; palace: Palace }
  | { status: 'corrupt'; error: string };

export function loadPalace(store: KeyValue): LoadResult {
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return { status: 'empty' };
  }
  if (!raw) return { status: 'empty' };
  try {
    const parsed = PalaceSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { status: 'corrupt', error: parsed.error.issues[0]?.message ?? 'invalid' };
    return { status: 'ok', palace: parsed.data as Palace };
  } catch (e) {
    return { status: 'corrupt', error: (e as Error).message };
  }
}

export function clearPalace(store: KeyValue): void {
  try {
    store.removeItem(STORAGE_KEY);
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
