import { describe, expect, it } from 'vitest';
import { architectPrompt, vetArchitectOutput } from '../src/core/architect.js';
import { ELEMENTS, PLANETS } from '../src/core/decks.js';
import { chunkDigits, deckFromNumber, parseNumber } from '../src/core/numbers.js';
import {
  LIBRARY_KEY,
  MAX_PALACES,
  MemoryStore,
  STORAGE_KEY,
  createPalace,
  deletePalace,
  listPalaces,
  loadLibrary,
  loadPalace,
  savePalace,
  setActivePalace,
} from '../src/core/palace.js';
import { DeckSchema } from '../src/core/schema.js';

const t = (n: number) => new Date(Date.UTC(2026, 10, 14, 10, n));

describe('palace library', () => {
  it('keeps several palaces and tracks the active one', () => {
    const store = new MemoryStore();
    const a = createPalace(PLANETS, [], t(0), 'a');
    const b = createPalace(ELEMENTS, [], t(1), 'b');
    savePalace(store, a);
    savePalace(store, b);
    expect(listPalaces(store).map((p) => p.id)).toEqual(['b', 'a']);
    expect((loadPalace(store) as { palace: { id: string } }).palace.id).toBe('b');
    expect(setActivePalace(store, 'a')?.id).toBe('a');
    deletePalace(store, 'a');
    expect(loadPalace(store).status).toBe('empty');
    expect(listPalaces(store)).toHaveLength(1);
  });

  it('migrates a single v1 palace', () => {
    const store = new MemoryStore();
    const old = createPalace(PLANETS, [], t(0), 'old');
    store.setItem(STORAGE_KEY, JSON.stringify(old));
    expect((loadPalace(store) as { palace: { id: string } }).palace.id).toBe('old');
    savePalace(store, old);
    expect(store.getItem(STORAGE_KEY)).toBeNull();
    expect(store.getItem(LIBRARY_KEY)).toContain('"old"');
  });

  it('drops invalid entries instead of failing the whole library', () => {
    const store = new MemoryStore();
    const good = createPalace(PLANETS, [], t(0), 'good');
    store.setItem(LIBRARY_KEY, JSON.stringify({ version: 2, activeId: 'bad', palaces: { good, bad: { id: 3 } } }));
    const { library } = loadLibrary(store);
    expect(Object.keys(library.palaces)).toEqual(['good']);
    expect(library.activeId).toBeNull();
  });

  it('caps the library, dropping the oldest', () => {
    const store = new MemoryStore();
    for (let i = 0; i < MAX_PALACES + 2; i++) savePalace(store, createPalace(PLANETS, [], t(i), `p${i}`));
    const ids = listPalaces(store).map((p) => p.id);
    expect(ids).toHaveLength(MAX_PALACES);
    expect(ids).not.toContain('p0');
    expect(ids).toContain(`p${MAX_PALACES + 1}`);
  });
});

describe('numbers by shape', () => {
  it('parses a label and strips formatting', () => {
    expect(parseNumber('Mum: +91 98450-12345')).toEqual({ label: 'Mum', digits: '919845012345' });
    expect(parseNumber('3.14159').digits).toBe('314159');
  });
  it('chunks in threes without a lonely last digit', () => {
    expect(chunkDigits('1234567')).toEqual(['123', '4567']);
    expect(chunkDigits('12345678')).toEqual(['123', '456', '78']);
  });
  it('builds an ordered, schema-valid deck on the device', () => {
    const deck = deckFromNumber('Locker - 4718', 'n');
    expect(deck?.ordered).toBe(true);
    expect(deck?.items.map((i) => i.answer)).toEqual(['4 7 1 8']);
    expect(deck?.items[0].glyphs).toEqual(['⛵', '🪃', '🕯️']);
    expect(deck?.items[0].scene).toContain('a sailboat, then a boomerang');
    expect(DeckSchema.safeParse(deck).success).toBe(true);
    expect(deckFromNumber('12')).toBeNull();
  });
});

describe('learning modes', () => {
  it('changes the brief by kind and audience', () => {
    expect(architectPrompt('photosynthesis', 'topic', 'child')).toMatch(/TOPIC[\s\S]*child of about 7/);
    expect(architectPrompt('x', 'names')).toContain('never from how a person looks');
  });
  it('lets a topic scene mention names that appear in its own answer', () => {
    const out = {
      title: 'Moon landing',
      ordered: true,
      items: [{ cue: 'First person on the Moon', answer: 'Neil Armstrong, in 1969', scene: 'A strong arm kneels to plant a flag while Armstrong waves.', glyphs: ['💪', '🌙'] }],
    };
    expect(vetArchitectOutput(out, 'the moon landing', 'x')?.repaired).toBe(0);
  });
});
