import { describe, expect, it } from 'vitest';
import {
  architectPrompt,
  bindPrompt,
  deterministicBind,
  vetArchitectOutput,
  vetBoundScenes,
} from '../src/core/architect.js';
import { glyphsFor } from '../src/core/glyphs.js';
import { deckFromNotes, MAX_ITEMS, parseNotes } from '../src/core/notes.js';
import { DeckSchema } from '../src/core/schema.js';

describe('parseNotes', () => {
  it('splits cue/answer on common separators', () => {
    const { items } = parseNotes('Mitochondria - powerhouse of the cell\nRibosome: makes proteins\nNucleus = control centre');
    expect(items).toEqual([
      { cue: 'Mitochondria', answer: 'powerhouse of the cell' },
      { cue: 'Ribosome', answer: 'makes proteins' },
      { cue: 'Nucleus', answer: 'control centre' },
    ]);
  });

  it('detects numbered lists as ordered and strips the numbers', () => {
    const r = parseNotes('1. Open with a story\n2. State the problem\n3) Show the demo\n4. Ask for the vote');
    expect(r.ordered).toBe(true);
    expect(r.items[0].answer).toBe('Open with a story');
  });

  it('treats bullet lists as unordered', () => {
    const r = parseNotes('- apples\n- bread\n- milk');
    expect(r.ordered).toBe(false);
    expect(r.items).toHaveLength(3);
  });

  it(`caps at ${MAX_ITEMS} items and ignores blank lines`, () => {
    const many = Array.from({ length: 30 }, (_, i) => `item ${i} - thing ${i}`).join('\n\n');
    expect(parseNotes(many).items).toHaveLength(MAX_ITEMS);
  });

  it('builds a schema-valid offline deck', () => {
    const deck = deckFromNotes('Hola - Hello\nGracias - Thank you');
    expect(deck).not.toBeNull();
    expect(DeckSchema.safeParse(deck).success).toBe(true);
    expect(deckFromNotes('   \n  ')).toBeNull();
  });
});

describe('glyphsFor', () => {
  it('maps study vocabulary to emoji and always returns one', () => {
    expect(glyphsFor('the heart pumps blood')).toContain('❤️');
    expect(glyphsFor('zzqx')).toHaveLength(1);
  });
});

describe('Palace Architect vetting', () => {
  const notes = 'Mercury - closest to the Sun\nVenus - hottest planet';
  const good = {
    title: 'Inner planets',
    ordered: true,
    items: [
      { cue: 'Mercury', answer: 'closest to the Sun', scene: 'A tiny thermometer sprints laps around a campfire.', glyphs: ['🌡️', '🏃'] },
      { cue: 'Venus', answer: 'hottest planet', scene: 'A pressure cooker whistles inside a cloud of yellow fog.', glyphs: ['♨️'] },
    ],
  };

  it('accepts clean output and keeps order', () => {
    const r = vetArchitectOutput(good, notes, 'ai_x');
    expect(r?.deck.items.map((i) => i.cue)).toEqual(['Mercury', 'Venus']);
    expect(r?.deck.source).toBe('architect');
    expect(r?.repaired).toBe(0);
    expect(DeckSchema.safeParse(r?.deck).success).toBe(true);
  });

  it('replaces an unsafe scene but keeps the fact', () => {
    const bad = structuredClone(good);
    bad.items[0].scene = 'Mercury sips a can of pepsi with Albert.';
    const r = vetArchitectOutput(bad, notes, 'ai_x');
    expect(r?.repaired).toBe(1);
    expect(r?.deck.items[0].answer).toBe('closest to the Sun');
    expect(r?.deck.items[0].scene).not.toMatch(/pepsi|Albert/i);
  });

  it('rejects words smuggled in as glyphs', () => {
    const odd = structuredClone(good);
    odd.items[1].glyphs = ['fire', 'hot'];
    const r = vetArchitectOutput(odd, notes, 'ai_x');
    expect(r?.deck.items[1].glyphs.every((g) => /\p{Extended_Pictographic}/u.test(g))).toBe(true);
  });

  it('returns null for unusable output', () => {
    expect(vetArchitectOutput({ nope: true }, notes, 'x')).toBeNull();
    expect(vetArchitectOutput('text', notes, 'x')).toBeNull();
  });

  it('trims over-long fields instead of failing the whole deck', () => {
    const long = structuredClone(good);
    long.items[0].answer = 'x'.repeat(500);
    expect(vetArchitectOutput(long, notes, 'x')?.deck.items[0].answer).toHaveLength(200);
  });

  it('puts the learner notes inside the prompt, sanitised', () => {
    const p = architectPrompt('hello\u0007 world');
    expect(p).toContain('hello world');
    expect(p).toContain('No real people');
  });
});

describe('room binding', () => {
  const items = [
    { cue: 'Mercury', scene: 'A tiny thermometer sprints laps around a campfire.', label: 'lamp' },
    { cue: 'Venus', scene: 'A pressure cooker whistles in yellow fog.', label: 'couch' },
  ];
  it('builds an ordered prompt naming each object', () => {
    const p = bindPrompt(items);
    expect(p).toContain('1. object: lamp');
    expect(p).toContain('2. object: couch');
  });
  it('keeps safe rewrites and repairs bad ones deterministically', () => {
    const r = vetBoundScenes({ scenes: ['The thermometer sprints laps around your lamp shade.', 'Your couch drinks a pepsi.'] }, items, 'Mercury Venus');
    expect(r.repaired).toBe(1);
    expect(r.scenes[0]).toContain('your lamp');
    expect(r.scenes[1]).toBe(deterministicBind(items[1]));
  });
  it('falls back per item when the count is wrong', () => {
    const r = vetBoundScenes({ scenes: ['only one'] }, items, '');
    expect(r.repaired).toBe(2);
  });
  it('anchors a scene to its object offline', () => {
    expect(deterministicBind({ scene: 'Picture a crowned king.', label: 'shelf' })).toBe('On your shelf: a crowned king.');
    expect(deterministicBind({ scene: 'A king.', label: '' })).toBe('A king.');
  });
});
