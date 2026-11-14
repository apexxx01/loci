/**
 * Turning a learner's raw notes into a deck WITHOUT any AI. This is the
 * take-it-away path: if the Palace Architect is unreachable, Loci still
 * builds a palace from "cue - answer" lines, a numbered list, or plain lines.
 */
import { glyphsFor } from './glyphs.js';
import { sanitizeUserText } from './safety.js';
import type { Deck, MemoryItem } from './types.js';

export const MAX_ITEMS = 12;

export interface RawItem {
  cue: string;
  answer: string;
}

const SEPARATORS = [' — ', ' – ', ' - ', ': ', ' = ', ' -> ', ' → ', '\t'];

/** Split notes into cue/answer pairs. Order is preserved. */
export function parseNotes(text: string): { items: RawItem[]; ordered: boolean } {
  const clean = sanitizeUserText(text);
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // A list is "ordered" if most lines start with 1. 2) etc.
  const numbered = lines.filter((l) => /^\(?\d{1,2}[.)]\s+/.test(l)).length;
  const ordered = lines.length > 1 && numbered >= Math.ceil(lines.length * 0.6);

  const items: RawItem[] = [];
  for (const raw of lines) {
    const line = raw
      .replace(/^\(?\d{1,2}[.)]\s+/, '')
      .replace(/^[-*•▪◦]\s+/, '')
      .trim();
    if (!line) continue;
    let cue = line;
    let answer = '';
    for (const sep of SEPARATORS) {
      const i = line.indexOf(sep);
      if (i > 0) {
        cue = line.slice(0, i).trim();
        answer = line.slice(i + sep.length).trim();
        break;
      }
    }
    if (!answer) {
      // A bare line is its own answer; the cue becomes its position/first words.
      answer = cue;
      cue = cue.split(/\s+/).slice(0, 4).join(' ');
    }
    items.push({ cue: cue.slice(0, 80), answer: answer.slice(0, 200) });
    if (items.length >= MAX_ITEMS) break;
  }
  return { items, ordered };
}

/** Deterministic deck from notes: emoji from a local keyword index, plain scene. */
export function deckFromNotes(text: string, title = 'My notes', id = 'notes'): Deck | null {
  const { items, ordered } = parseNotes(text);
  if (!items.length) return null;
  const memory: MemoryItem[] = items.map((it, order) => ({
    id: `${id}:${order}`,
    cue: it.cue,
    answer: it.answer,
    scene: `Picture ${it.cue} glowing right here, shouting "${shorten(it.answer, 60)}".`,
    glyphs: glyphsFor(`${it.cue} ${it.answer}`),
    order,
  }));
  return {
    id,
    title: title.slice(0, 60),
    subtitle: `${memory.length} memories from your notes`,
    ordered,
    source: 'handoff',
    items: memory,
  };
}

function shorten(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}
