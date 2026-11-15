/**
 * Numbers without AI: the classic number-shape system. Each digit becomes the
 * object it looks like, and a long number becomes a short walk of little
 * scenes. Everything is computed on the device, so a phone number or a date
 * never leaves it.
 */
import type { Deck, MemoryItem } from './types.js';

export const DIGIT_SHAPES: { glyph: string; name: string }[] = [
  { glyph: '🥚', name: 'an egg' },
  { glyph: '🕯️', name: 'a candle' },
  { glyph: '🦢', name: 'a swan' },
  { glyph: '🦋', name: 'a butterfly' },
  { glyph: '⛵', name: 'a sailboat' },
  { glyph: '🪝', name: 'a hook' },
  { glyph: '🐘', name: "an elephant's trunk" },
  { glyph: '🪃', name: 'a boomerang' },
  { glyph: '⛄', name: 'a snowman' },
  { glyph: '🎈', name: 'a balloon on a string' },
];

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];

/** "Mum: 98450 12345" -> label "Mum", digits "9845012345". */
export function parseNumber(input: string): { label: string; digits: string } {
  const m = /^([^0-9:=-]{1,40})[:=-]\s*(.+)$/s.exec(input.trim());
  const label = m ? m[1].trim() : '';
  const digits = (m ? m[2] : input).replace(/\D/g, '');
  return { label, digits: digits.slice(0, 36) };
}

/** Split into groups of 3 (a trailing single digit joins the previous group as 4). */
export function chunkDigits(digits: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < digits.length; i += 3) out.push(digits.slice(i, i + 3));
  if (out.length > 1 && out[out.length - 1].length === 1) {
    const tail = out.pop()!;
    out[out.length - 1] += tail;
  }
  return out;
}

export function deckFromNumber(input: string, id = `num_${Date.now().toString(36)}`): Deck | null {
  const { label, digits } = parseNumber(input);
  if (digits.length < 3) return null;
  const chunks = chunkDigits(digits);
  const items: MemoryItem[] = chunks.map((chunk, order) => {
    const shapes = [...chunk].map((d) => DIGIT_SHAPES[Number(d)]);
    const names = shapes.map((s) => s.name);
    const scene =
      names.length === 1
        ? `Picture ${names[0]} sitting right here.`
        : `Picture ${names.slice(0, -1).join(', then ')}, then ${names[names.length - 1]}, lined up right here.`;
    return {
      id: `${id}:${order}`,
      cue: `${ORDINALS[order] ?? `Part ${order + 1}`} ${chunk.length} digits`,
      answer: [...chunk].join(' '),
      scene,
      glyphs: shapes.slice(0, 3).map((s) => s.glyph),
      order,
    };
  });
  return {
    id,
    title: label ? `${label}: number`.slice(0, 60) : `A ${digits.length}-digit number`,
    subtitle: `${digits.length} digits in ${chunks.length} stops, by number shape`,
    ordered: true,
    source: 'handoff',
    items,
  };
}
