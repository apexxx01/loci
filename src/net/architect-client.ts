/**
 * Client for the Palace Architect. Every call has a deterministic fallback, so
 * a dead network or a missing key degrades the experience instead of breaking it.
 */
import { deterministicBind, type Audience, type Kind } from '../core/architect.js';
import { deckFromNotes } from '../core/notes.js';
import { DeckSchema } from '../core/schema.js';
import type { Deck } from '../core/types.js';

const API = `${import.meta.env.BASE_URL}api/architect`.replace(/^\.\//, '/');
const TIMEOUT_MS = 25_000;

export type BuildResult =
  | { ok: true; deck: Deck; via: 'architect'; ms: number; repaired: number }
  | { ok: true; deck: Deck; via: 'offline'; reason: string }
  | { ok: false; error: string };

async function post(body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function buildDeck(notes: string, kind: Kind = 'notes', audience: Audience = 'adult'): Promise<BuildResult> {
  // A topic has no lines to fall back on; everything else can be built offline.
  const offline = kind === 'topic' ? null : deckFromNotes(notes);
  if (!notes.trim()) return { ok: false, error: 'Type something to remember first.' };
  if (!offline && kind !== 'topic') return { ok: false, error: 'Add at least one line to remember.' };
  try {
    const { status, data } = await post({ mode: 'build', notes, kind, audience });
    const parsed = DeckSchema.safeParse(data.deck);
    if (status === 200 && parsed.success) {
      return { ok: true, deck: parsed.data as Deck, via: 'architect', ms: Number(data.ms) || 0, repaired: Number(data.repaired) || 0 };
    }
    if (!offline) return { ok: false, error: 'The Palace Architect is unavailable right now, and a topic needs it. Try again in a moment, or paste your own notes.' };
    return { ok: true, deck: offline, via: 'offline', reason: String(data.error ?? `HTTP ${status}`) };
  } catch (e) {
    const err = e as Error;
    if (!offline) return { ok: false, error: 'Could not reach the Palace Architect. Check your connection, or paste your own notes.' };
    return { ok: true, deck: offline, via: 'offline', reason: err.name === 'AbortError' ? 'timed out' : 'offline' };
  }
}

export interface BindInput {
  cue: string;
  scene: string;
  label: string;
}

export async function bindScenes(items: BindInput[]): Promise<{ scenes: string[]; via: 'architect' | 'offline'; ms?: number }> {
  try {
    const { status, data } = await post({ mode: 'bind', items });
    const scenes = data.scenes;
    if (status === 200 && Array.isArray(scenes) && scenes.length === items.length && scenes.every((s) => typeof s === 'string')) {
      return { scenes: scenes as string[], via: 'architect', ms: Number(data.ms) || 0 };
    }
  } catch {
    /* fall through */
  }
  return { scenes: items.map(deterministicBind), via: 'offline' };
}
