/**
 * Client for the Palace Architect. Every call has a deterministic fallback, so
 * a dead network or a missing key degrades the experience instead of breaking it.
 */
import { deterministicBind, type Audience, type Kind } from '../core/architect.js';
import { deckFromNotes } from '../core/notes.js';
import { gradeOffline } from '../core/grade.js';
import { conceptById } from '../core/concepts.js';
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

/* ------------------------------------------------------------------ teach, grade, re-imagine */
export type TeachResult = { ok: true; deck: Deck; ms: number; repaired: number; offline?: boolean; cached?: boolean } | { ok: false; error: string };

const TEACH_CACHE = 'loci.teachcache.v1';
const cacheKey = (topic: string, audience: Audience) => `${audience}|${topic.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
function cached(key: string): Deck | null {
  try {
    const all = JSON.parse(localStorage.getItem(TEACH_CACHE) ?? '{}') as Record<string, unknown>;
    const p = DeckSchema.safeParse(all[key]);
    return p.success ? (p.data as Deck) : null;
  } catch {
    return null;
  }
}
function remember(key: string, deck: Deck): void {
  try {
    const all = JSON.parse(localStorage.getItem(TEACH_CACHE) ?? '{}') as Record<string, unknown>;
    all[key] = deck;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete all[k];
    localStorage.setItem(TEACH_CACHE, JSON.stringify(all));
  } catch {
    /* private browsing or full */
  }
}

export async function teachConcept(topic: string, audience: Audience = 'adult'): Promise<TeachResult> {
  if (topic.trim().length < 3) return { ok: false, error: 'Name something to understand first.' };
  // Asking the same thing again on this device is instant.
  const key = cacheKey(topic, audience);
  const hit = cached(key);
  if (hit) return { ok: true, deck: hit, ms: 0, repaired: 0, cached: true };
  try {
    const { status, data } = await post({ mode: 'teach', topic, audience });
    const parsed = DeckSchema.safeParse(data.deck);
    if (status === 200 && parsed.success) {
      remember(key, parsed.data as Deck);
      return { ok: true, deck: parsed.data as Deck, ms: Number(data.ms) || 0, repaired: Number(data.repaired) || 0, cached: Boolean(data.cached) };
    }
    if (status >= 500 || status === 429) return offlineConcept(topic, String(data.error ?? ''));
    return { ok: false, error: String(data.error ?? 'The Palace Architect could not explain that one. Try asking it a different way.') };
  } catch (e) {
    return offlineConcept(topic, (e as Error).name === 'AbortError' ? 'The Palace Architect took too long.' : 'The Palace Architect could not be reached.');
  }
}

export interface Grade {
  hit: number[];
  missed: number[];
  misconception: string;
  feedback: string;
  via: 'architect' | 'offline';
  ms?: number;
}

export async function gradeExplanation(title: string, stages: { cue: string; answer: string }[], explanation: string): Promise<Grade> {
  try {
    const { status, data } = await post({ mode: 'grade', title, stages, explanation });
    if (status === 200 && Array.isArray(data.hit) && Array.isArray(data.missed)) {
      return {
        hit: (data.hit as number[]).filter(Number.isInteger),
        missed: (data.missed as number[]).filter(Number.isInteger),
        misconception: String(data.misconception ?? ''),
        feedback: String(data.feedback ?? ''),
        via: 'architect',
        ms: Number(data.ms) || 0,
      };
    }
  } catch {
    /* fall through */
  }
  return { ...gradeOffline(stages, explanation), via: 'offline' };
}

export async function reimagineScene(item: { cue: string; answer: string; scene: string; label: string }): Promise<string | null> {
  try {
    const { status, data } = await post({ mode: 'reimagine', item });
    return status === 200 && typeof data.scene === 'string' && data.scene ? data.scene : null;
  } catch {
    return null;
  }
}

/**
 * When the Architect cannot answer, a question that matches one of the
 * ready-made concepts still gets a walk; anything else gets a clear way on.
 */
function offlineConcept(topic: string, why: string): TeachResult {
  const t = topic.toLowerCase();
  const match = OFFLINE_KEYS.find(([, words]) => words.some((w) => t.includes(w)));
  const deck = match && conceptById(match[0]);
  if (deck) return { ok: true, deck, ms: 0, repaired: 0, offline: true };
  return { ok: false, error: `${why} Check your connection and try again in a moment.`.trim() };
}

const OFFLINE_KEYS: [string, string[]][] = [
  ['concept-heart', ['heart', 'blood', 'circulat', 'ventricle', 'atrium']],
  ['concept-plants', ['photosynth', 'plants make', 'chlorophyll', 'plant food']],
  ['concept-seasons', ['season', 'summer', 'winter', 'axial tilt']],
  ['concept-vaccine', ['vaccin', 'immun', 'antibod']],
  ['concept-water', ['water cycle', 'evaporat', 'precipitat', 'condensation', 'rain form']],
  ['concept-web', ['web page', 'website', 'browser', 'dns', 'http']],
];

/**
 * A second, fact-checking pass over a concept. Doubted stages get a short note
 * of what to double-check; null means the check could not run.
 */
export async function verifyConcept(deck: Deck): Promise<Deck | null> {
  try {
    const stages = deck.items.map((it) => ({ cue: it.cue, answer: it.answer, why: it.why, myth: it.check?.wrong, fact: it.check?.right }));
    const { status, data } = await post({ mode: 'verify', title: deck.title, stages });
    if (status !== 200 || !Array.isArray(data.flags)) return null;
    const flags = new Map((data.flags as { index: number; issue: string }[]).map((f) => [f.index, String(f.issue).slice(0, 240)]));
    return { ...deck, items: deck.items.map((it, i) => (flags.has(i) ? { ...it, doubt: flags.get(i) } : { ...it, doubt: undefined })) };
  } catch {
    return null;
  }
}
