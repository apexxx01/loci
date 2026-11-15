/**
 * The Palace Architect: prompt construction and output vetting. The model is
 * only ever asked for text; this module decides what is allowed into the
 * palace. Shared by the server function and the tests.
 */
import { glyphsFor } from './glyphs.js';
import { MAX_ITEMS } from './notes.js';
import { checkMnemonic, sanitizeUserText } from './safety.js';
import { ArchitectDeckSchema, type ArchitectDeck } from './schema.js';
import type { Deck, MemoryItem } from './types.js';

export const ARCHITECT_RULES = `You are the Palace Architect inside Loci, a mixed-reality memory palace.
You turn a learner's notes into memories that will be pinned to real objects in their room.

For each thing worth memorising (at most ${MAX_ITEMS}), produce:
- cue: the short prompt the learner sees first (max 6 words), taken from their notes.
- answer: what they must recall (max 18 words), faithful to their notes. Never invent facts.
- scene: ONE vivid, concrete, slightly absurd picture (max 24 words) that links the cue to the answer.
  Use the keyword method (a sound-alike image for unfamiliar words), exaggeration, motion and colour.
- glyphs: 1 to 3 emoji that depict the scene.

Hard rules:
- Family-friendly (ages 10+): no violence, gore, alcohol, drugs, weapons, romance or adult content.
- No real people, celebrities or characters, and no brands, products or logos.
- Do not use any proper noun unless it appears in the learner's notes.
- Keep the learner's order. Set "ordered" true when the notes are a sequence (steps, ranks, timelines, numbered lists).
- Title: 2 to 5 words naming the topic.
Return only JSON matching the schema.`;

export const BIND_RULES = `You are the Palace Architect inside Loci. Each memory now sits on a real object in the learner's room.
Rewrite each scene so the object itself changes what happens: use what that object is and does
(a lamp shines and heats, a couch sinks and squeaks, a window fogs and opens, a plant grows and drips, a door swings and knocks,
a shelf holds and tips over, a screen glows and flickers). Never just swap the preposition. Make it vivid, a little absurd, and specific to that object.
Keep the same meaning and cue-to-answer link, max 26 words, family-friendly, no real people, no brands,
no proper nouns that are not already in the scene or cue. Say "your <object>". Return only JSON matching the schema.`;

/** JSON schema (OpenAPI subset) for Gemini structured output. */
export const ARCHITECT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    ordered: { type: 'boolean' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cue: { type: 'string' },
          answer: { type: 'string' },
          scene: { type: 'string' },
          glyphs: { type: 'array', items: { type: 'string' } },
        },
        required: ['cue', 'answer', 'scene', 'glyphs'],
      },
    },
  },
  required: ['title', 'ordered', 'items'],
} as const;

export const BIND_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    scenes: { type: 'array', items: { type: 'string' } },
  },
  required: ['scenes'],
} as const;

export const KINDS = ['notes', 'topic', 'sequence', 'vocab', 'names'] as const;
export type Kind = (typeof KINDS)[number];
export const AUDIENCES = ['child', 'teen', 'adult'] as const;
export type Audience = (typeof AUDIENCES)[number];

const KIND_RULES: Record<Kind, string> = {
  notes: 'The input is the learner\'s own notes. Pick out each distinct thing worth memorising.',
  topic: `The input is a TOPIC or a passage, not a list. Teach it: choose the most important, well-established facts a learner should know
(at most ${MAX_ITEMS}), ordered from foundational to detailed. Only include facts you are highly confident are correct and uncontroversial.
The cue is a short question or term; the answer is the fact. In this mode you may use proper nouns that belong to the topic.`,
  sequence: 'The input is a speech, process or routine. Each item is one step or talking point, in order. Always set "ordered" true. The cue is "Step N" or a 2-4 word handle; the answer is what to say or do.',
  vocab: 'The input is vocabulary (word and meaning, possibly another language). The cue is the word, the answer is its meaning. Build each scene with the keyword method: something the word SOUNDS like in English, acting out the meaning.',
  names: 'The input is a list of people the learner needs to remember (name plus a detail such as role or where they met). The cue is the detail; the answer is the name. Build the scene from what the name sounds like, never from how a person looks.',
};

const AUDIENCE_RULES: Record<Audience, string> = {
  child: 'The learner is a child of about 7 to 10: use very simple words, short sentences, and playful, gentle images (animals, toys, food).',
  teen: 'The learner is a teenager: keep it quick, funny and concrete.',
  adult: 'The learner is an adult: keep it concise and vivid.',
};

export function architectPrompt(notes: string, kind: Kind = 'notes', audience: Audience = 'adult'): string {
  return `${ARCHITECT_RULES}\n\n${KIND_RULES[kind]}\n${AUDIENCE_RULES[audience]}\n\nLearner's input:\n"""\n${sanitizeUserText(notes, 4000)}\n"""`;
}

export function bindPrompt(items: { cue: string; scene: string; label: string }[]): string {
  const lines = items
    .map((it, i) => `${i + 1}. object: ${it.label || 'the space in front of you'} | cue: ${it.cue} | scene: ${it.scene}`)
    .join('\n');
  return `${BIND_RULES}\n\nReturn exactly ${items.length} scenes, in this order:\n${lines}`;
}

export interface VetResult {
  deck: Deck;
  /** Items whose scene was replaced because it failed the safety check. */
  repaired: number;
}

/**
 * Validate and clean model output. Unsafe scenes are not dropped (the learner
 * still needs the fact) — they are replaced with a deterministic plain scene.
 */
export function vetArchitectOutput(raw: unknown, notes: string, id: string): VetResult | null {
  const parsed = ArchitectDeckSchema.safeParse(clampShape(raw));
  if (!parsed.success) return null;
  const out: ArchitectDeck = parsed.data;
  let repaired = 0;
  const items: MemoryItem[] = out.items.slice(0, MAX_ITEMS).map((it, order) => {
    // Cue and answer count as sourced text: in topic mode the facts (and their
    // proper nouns) come from the Architect, and the scene may refer to them.
    const source = `${notes} ${it.cue} ${it.answer}`;
    let scene = it.scene.trim();
    const verdict = checkMnemonic(scene, source);
    if (!verdict.ok) {
      repaired++;
      scene = `Picture ${it.cue} glowing in front of you, spelling out the answer in light.`;
    }
    const glyphs = it.glyphs.filter(isEmojiish).slice(0, 3);
    return {
      id: `${id}:${order}`,
      cue: it.cue.trim().slice(0, 80),
      answer: it.answer.trim().slice(0, 200),
      scene,
      glyphs: glyphs.length ? glyphs : glyphsFor(`${it.cue} ${it.answer}`),
      order,
    };
  });
  if (!items.length) return null;
  return {
    deck: {
      id,
      title: out.title.trim().slice(0, 60) || 'My notes',
      subtitle: `${items.length} memories, built from your notes`,
      ordered: out.ordered,
      source: 'architect',
      items,
    },
    repaired,
  };
}

/** Vet room-bound rewrites; fall back to the original scene per item. */
export function vetBoundScenes(
  raw: unknown,
  items: { cue: string; scene: string; label: string }[],
  sourceText: string,
): { scenes: string[]; repaired: number } {
  const rawScenes = (raw as { scenes?: unknown })?.scenes;
  // A wrong count means we cannot trust which scene belongs to which memory.
  const scenes = Array.isArray(rawScenes) && rawScenes.length === items.length ? rawScenes : null;
  let repaired = 0;
  const out = items.map((it, i) => {
    const s = scenes && typeof scenes[i] === 'string' ? (scenes[i] as string).trim() : '';
    const ok = s.length >= 8 && s.length <= 240 && checkMnemonic(s, `${sourceText} ${it.scene} ${it.cue} ${it.label}`).ok;
    if (!ok) {
      repaired++;
      return deterministicBind(it);
    }
    return s;
  });
  return { scenes: out, repaired };
}

/** Offline binding: anchor the existing scene to the object by name. */
export function deterministicBind(it: { scene: string; label: string }): string {
  if (!it.label) return it.scene;
  const s = it.scene.replace(/^(picture|imagine)\s+/i, '');
  return `On your ${it.label}: ${s.charAt(0).toLowerCase()}${s.slice(1)}`.slice(0, 240);
}

/** Pictographic check: rejects plain words smuggled in as "glyphs". */
function isEmojiish(s: string): boolean {
  return /\p{Extended_Pictographic}/u.test(s) && !/[A-Za-z]{2,}/.test(s);
}

/** Trim over-long strings before schema validation so near-misses survive. */
function clampShape(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const r = raw as { title?: unknown; ordered?: unknown; items?: unknown };
  const items = Array.isArray(r.items) ? r.items.slice(0, 24) : r.items;
  return {
    title: typeof r.title === 'string' ? r.title.slice(0, 60) : r.title,
    ordered: Boolean(r.ordered),
    items: Array.isArray(items)
      ? items.map((it: Record<string, unknown>) => ({
          cue: typeof it?.cue === 'string' ? it.cue.slice(0, 80) : it?.cue,
          answer: typeof it?.answer === 'string' ? it.answer.slice(0, 200) : it?.answer,
          scene: typeof it?.scene === 'string' ? it.scene.slice(0, 240) : it?.scene,
          glyphs: Array.isArray(it?.glyphs) ? (it.glyphs as unknown[]).filter((g) => typeof g === 'string').slice(0, 3) : ['✨'],
        }))
      : items,
  };
}
