/**
 * The small amount of state shared between systems: the current palace, the
 * room's surfaces, and a typed event bus. Systems own behaviour; this owns
 * nothing but data.
 */
import type { Deck, Palace, Surface } from '../core/types.js';

export type AppEvent =
  | { type: 'start-deck'; deck: Deck }
  | { type: 'refit' }
  | { type: 'new-palace' }
  | { type: 'switch-palace' }
  | { type: 'palace-changed' }
  /** Every memory has landed (built) or found its place again (restored). */
  | { type: 'palace-ready'; restored: boolean }
  /** A concept stage was answered on recall: lights or dims its thread. */
  | { type: 'stage-checked'; memoryId: string; correct: boolean }
  /** Rebuild-the-chain practice started or ended. */
  | { type: 'chain'; on: boolean }
  /** In chain practice, the link into stage `index` was rebuilt (index 0 = the first stage found). */
  | { type: 'chain-link'; index: number }
  | { type: 'status'; text: string }
  | { type: 'own-notes' }
  | { type: 'flipped'; face: number; label: string }
  | { type: 'rated'; rating: 'again' | 'hard' | 'good' };

type Listener = (e: AppEvent) => void;

class Bus {
  private listeners = new Set<Listener>();
  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: AppEvent): void {
    for (const fn of [...this.listeners]) fn(e);
  }
}

export const bus = new Bus();

export const app = {
  palace: null as Palace | null,
  /** Deck chosen on the 2D page; built as soon as mixed reality starts. */
  pendingDeck: null as Deck | null,
  surfaces: [] as Surface[],
  /** Monotonic counter bumped whenever the surface set meaningfully changes. */
  surfacesVersion: 0,
  /** Whether progress can be persisted (false in private browsing). */
  storageOk: true,
  /** How placements are stored: relative to the persistent anchor or to the session origin. */
  frame: 'reference' as 'anchor' | 'reference',
  /** Result of the last restore check (memories that still found their object). */
  lastVerify: null as null | { checked: number; matched: number },
  /** Latest hub status line. */
  status: 'Ready.',
  /** Rebuild-the-chain practice: stage numbers hidden, pinch the stages in order. */
  chainMode: false,
  /** Last grab release, for tuning and tests. */
  lastRelease: null as null | { held: number; travel: number; v: [number, number, number]; result: string },
};

export function setStatus(text: string): void {
  app.status = text;
  bus.emit({ type: 'status', text });
}

export function getStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const k = '__loci_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
