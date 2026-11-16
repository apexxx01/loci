/**
 * The Palace Architect: prompt construction and output vetting. The model is
 * only ever asked for text; this module decides what is allowed into the
 * palace. Shared by the server function and the tests.
 */
import { glyphsFor } from './glyphs.js';
import { MAX_ITEMS } from './notes.js';
import { checkMnemonic, sanitizeUserText } from './safety.js';
import { ArchitectConceptSchema, ArchitectDeckSchema, ArchitectGradeSchema, ArchitectVerifySchema, type ArchitectDeck, type ArchitectGrade } from './schema.js';
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
a shelf holds and tips over, a screen glows and flickers). Never just swap the preposition. Keep the original scene's key image (the detail that links cue to answer) and let the object act on it. Vivid, a little absurd, specific to that object.
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

/* ------------------------------------------------------------------ teach mode
 * Not a list of facts: how something WORKS, as 4 to 7 linked stages. Each stage
 * lands on one object in the room and a thread of light joins it to the next,
 * so walking the room is walking the mechanism.
 */
export const MAX_STAGES = 7;

export const TEACH_RULES = `You are the Palace Architect inside Loci, a mixed-reality memory palace.
The learner wants to UNDERSTAND how something works, not memorise a list. Explain it as a chain of ${4} to ${MAX_STAGES} linked stages,
in causal or chronological order, where each stage leads to the next. Each stage will sit on a different object in the learner's room,
joined to the next by a thread of light, so walking around the room is walking through the mechanism.

For each stage produce:
- cue: the stage's name, 2 to 5 words (e.g. "Right atrium fills").
- answer: the core claim, one plain sentence, max 22 words.
- why: why that is true or why it matters, one sentence, max 24 words. Teach the reason, not a restatement.
- scene: ONE vivid, concrete, slightly absurd picture (max 24 words) that makes the claim memorable.
- glyphs: 1 to 3 emoji that depict the scene.
- wrong: ONE misconception about this stage that real people genuinely believe (the kind teachers have to correct), stated confidently as if true (max 18 words). Never a silly or absurd invention; it must sound plausible to a beginner.
- right: the accurate statement that corrects it, in the same shape (max 18 words).
- link: how this stage causes or leads into the next one, a short verb phrase (max 10 words). Empty string for the last stage.

Hard rules:
- Only well-established, uncontroversial facts you are highly confident about. If the topic is contested or unsafe, explain only the settled parts.
- Simple language; define any technical word the first time it appears.
- Family-friendly (ages 10+): no gore, violence, alcohol, drugs, weapons or adult content.
- No real people, celebrities or characters, and no brands, products or logos.
- Title: 2 to 6 words naming the concept (e.g. "How the heart pumps blood").
Return only JSON matching the schema.`;

export const CONCEPT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    stages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cue: { type: 'string' },
          answer: { type: 'string' },
          why: { type: 'string' },
          scene: { type: 'string' },
          glyphs: { type: 'array', items: { type: 'string' } },
          wrong: { type: 'string' },
          right: { type: 'string' },
          link: { type: 'string' },
        },
        required: ['cue', 'answer', 'why', 'scene', 'glyphs', 'wrong', 'right', 'link'],
      },
    },
  },
  required: ['title', 'stages'],
} as const;

export function teachPrompt(topic: string, audience: Audience = 'adult'): string {
  return `${TEACH_RULES}\n${AUDIENCE_RULES[audience]}\n\nWhat the learner wants to understand (a topic, a question, or their own notes to explain):\n"""\n${sanitizeUserText(topic, 4000)}\n"""`;
}

/** Validate and clean a concept. Unsafe scenes are replaced; an unsafe myth check is dropped. */
export function vetConceptOutput(raw: unknown, topic: string, id: string): VetResult | null {
  const parsed = ArchitectConceptSchema.safeParse(clampConcept(raw));
  if (!parsed.success) return null;
  let repaired = 0;
  const stages = parsed.data.stages.slice(0, MAX_STAGES);
  const items: MemoryItem[] = stages.map((st, order) => {
    const source = `${topic} ${st.cue} ${st.answer} ${st.why}`;
    let scene = st.scene.trim();
    if (!checkMnemonic(scene, source).ok) {
      repaired++;
      scene = `Picture ${st.cue.toLowerCase()} happening right in front of you, glowing as it goes.`;
    }
    const checkOk = [st.wrong, st.right].every((t) => checkMnemonic(t, source).ok) && norm(st.wrong) !== norm(st.right);
    const glyphs = st.glyphs.filter(isEmojiish).slice(0, 3);
    const last = order === stages.length - 1;
    return {
      id: `${id}:${order}`,
      cue: st.cue.trim().slice(0, 80),
      answer: st.answer.trim().slice(0, 200),
      why: st.why.trim().slice(0, 240),
      scene,
      glyphs: glyphs.length ? glyphs : glyphsFor(`${st.cue} ${st.answer}`),
      order,
      ...(checkOk ? { check: { wrong: st.wrong.trim().slice(0, 200), right: st.right.trim().slice(0, 200) } } : {}),
      ...(!last && st.link.trim() ? { link: st.link.trim().slice(0, 120) } : {}),
    };
  });
  if (items.length < 3) return null;
  return {
    deck: {
      id,
      title: parsed.data.title.trim().slice(0, 60) || 'How it works',
      subtitle: `${items.length} linked stages, taught by the Palace Architect`,
      ordered: true,
      source: 'architect',
      kind: 'concept',
      items,
    },
    repaired,
  };
}

/* ------------------------------------------------------------------ explain-back grading */
export const GRADE_RULES = `You are the Palace Architect inside Loci, grading a learner who explained a concept in their own words.
You get the concept's stages (numbered from 0) and the learner's explanation. Decide, for each stage, whether the explanation
shows they understand its key idea. Be fair: paraphrase, simpler words and a different order all count; a stage counts as hit
only if its key idea is actually present, not just its name. Put each stage index in exactly one of "hit" or "missed".
If the explanation states something false about the concept, name the misconception in one short sentence in "misconception",
otherwise return an empty string. "feedback": two short, warm, specific sentences: what they got right, then the most important
thing to add. Address the learner as "you". Return only JSON matching the schema.`;

export const GRADE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    hit: { type: 'array', items: { type: 'integer' } },
    missed: { type: 'array', items: { type: 'integer' } },
    misconception: { type: 'string' },
    feedback: { type: 'string' },
  },
  required: ['hit', 'missed', 'misconception', 'feedback'],
} as const;

export interface GradeStage {
  cue: string;
  answer: string;
}

export function gradePrompt(title: string, stages: GradeStage[], explanation: string): string {
  const lines = stages.map((s, i) => `${i}. ${s.cue}: ${s.answer}`).join('\n');
  return `${GRADE_RULES}\n\nConcept: ${sanitizeUserText(title, 80)}\nStages:\n${lines}\n\nLearner's explanation:\n"""\n${sanitizeUserText(explanation, 3000)}\n"""`;
}

/** Make the model's grade consistent: every stage exactly once, text vetted. */
export function vetGrade(raw: unknown, stages: GradeStage[], explanation: string): ArchitectGrade | null {
  const n = stages.length;
  const r = (raw ?? {}) as Record<string, unknown>;
  const ints = (v: unknown) => (Array.isArray(v) ? v.filter((i) => Number.isInteger(i) && i >= 0 && i < n).slice(0, 24) : v);
  const parsed = ArchitectGradeSchema.safeParse({ ...r, hit: ints(r.hit), missed: ints(r.missed) });
  if (!parsed.success) return null;
  const hit = [...new Set(parsed.data.hit.filter((i) => i >= 0 && i < n))].sort((a, b) => a - b);
  const missed = Array.from({ length: n }, (_, i) => i).filter((i) => !hit.includes(i));
  const source = `${explanation} ${stages.map((s) => `${s.cue} ${s.answer}`).join(' ')}`;
  const clean = (t: string) => (t && checkMnemonic(t, source).ok ? t.trim() : '');
  return { hit, missed, misconception: clean(parsed.data.misconception).slice(0, 240), feedback: clean(parsed.data.feedback).slice(0, 400) };
}

/* ------------------------------------------------------------------ rescue: re-imagine a memory that keeps slipping */
export const REIMAGINE_RULES = `You are the Palace Architect inside Loci. The learner has missed this memory more than once, so its picture is not working.
Invent a COMPLETELY DIFFERENT picture for the same fact: a new image, new action and new sense (sound, smell, heat or touch),
bound to the object it sits on (use what that object is and does). Make the link between cue and answer impossible to miss.
Max 26 words, family-friendly, no real people, no brands, say "your <object>". Return only JSON matching the schema.`;

export function reimaginePrompt(it: { cue: string; answer: string; scene: string; label: string }): string {
  return `${REIMAGINE_RULES}\n\nobject: ${it.label || 'the space in front of you'}\ncue: ${sanitizeUserText(it.cue, 80)}\nanswer: ${sanitizeUserText(it.answer, 200)}\nthe picture that did not work: ${sanitizeUserText(it.scene, 240)}\n\nReturn {"scenes": [one new scene]}.`;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clampConcept(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const r = raw as { title?: unknown; stages?: unknown };
  const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : v);
  return {
    title: cut(r.title, 60),
    stages: Array.isArray(r.stages)
      ? r.stages.slice(0, 8).map((st: Record<string, unknown>) => ({
          cue: cut(st?.cue, 80),
          answer: cut(st?.answer, 200),
          why: cut(st?.why, 240),
          scene: cut(st?.scene, 240),
          glyphs: Array.isArray(st?.glyphs) ? (st.glyphs as unknown[]).filter((g) => typeof g === 'string').slice(0, 3) : ['✨'],
          wrong: cut(st?.wrong, 200),
          right: cut(st?.right, 200),
          link: typeof st?.link === 'string' ? st.link.slice(0, 120) : '',
        }))
      : r.stages,
  };
}

/* ------------------------------------------------------------------ fact-check pass
 * A second, independent read of every stage, looking only for mistakes. It is
 * conservative on purpose: it flags clear errors, not style or simplification.
 */
export const VERIFY_RULES = `You are a careful fact-checker for Loci, a learning app. You get the stages of a short explanation.
For each stage, check the claim, the reason, and the two myth-check statements (the "myth" must be false and the "fact" must be true).
Flag a stage ONLY if something in it is clearly factually wrong, or the myth is actually true, or the fact is actually false.
Do not flag simplifications that are fine for a beginner, style, or missing detail. If everything is accurate, return an empty list.
For each flag give the stage index and, in one short sentence (max 30 words), what is wrong and what is right. Return only JSON matching the schema.`;

export const VERIFY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    flags: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, issue: { type: 'string' } }, required: ['index', 'issue'] } },
  },
  required: ['flags'],
} as const;

export interface VerifyStage {
  cue: string;
  answer: string;
  why?: string;
  myth?: string;
  fact?: string;
}

export function verifyPrompt(title: string, stages: VerifyStage[]): string {
  const lines = stages
    .map((s, i) => `${i}. ${s.cue}\n   claim: ${s.answer}\n   reason: ${s.why ?? ''}${s.myth ? `\n   myth: ${s.myth}\n   fact: ${s.fact ?? ''}` : ''}`)
    .join('\n');
  return `${VERIFY_RULES}\n\nTopic: ${sanitizeUserText(title, 80)}\nStages:\n${lines}`;
}

export function vetVerify(raw: unknown, stages: VerifyStage[]): { index: number; issue: string }[] {
  const r = (raw ?? {}) as { flags?: unknown };
  const flags = Array.isArray(r.flags)
    ? r.flags.filter((f: { index?: unknown }) => Number.isInteger(f?.index) && (f.index as number) >= 0 && (f.index as number) < stages.length).slice(0, 24)
    : r.flags;
  const parsed = ArchitectVerifySchema.safeParse({ flags });
  if (!parsed.success) return [];
  const seen = new Set<number>();
  const source = stages.map((s) => `${s.cue} ${s.answer} ${s.why ?? ''} ${s.myth ?? ''} ${s.fact ?? ''}`).join(' ');
  return parsed.data.flags.filter((f) => {
    if (f.index < 0 || f.index >= stages.length || seen.has(f.index)) return false;
    seen.add(f.index);
    return checkMnemonic(f.issue, `${source} ${f.issue}`).reasons.every((r) => !/blocked|brand|unsafe/i.test(r));
  });
}
