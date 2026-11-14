import { describe, expect, it } from 'vitest';
import { PLANETS, SPANISH } from '../src/core/decks.js';
import { decodeDeck, encodeDeck } from '../src/core/share.js';

describe('share links', () => {
  it('round-trips a deck (content only, never the room)', async () => {
    const code = await encodeDeck(PLANETS);
    const r = await decodeDeck(code);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deck.source).toBe('shared');
    expect(r.deck.items.map((i) => [i.cue, i.answer, i.scene, i.glyphs])).toEqual(
      PLANETS.items.map((i) => [i.cue, i.answer, i.scene, i.glyphs]),
    );
    expect(r.deck.ordered).toBe(true);
  });

  it('compresses to a URL-friendly code', async () => {
    const code = await encodeDeck(SPANISH);
    expect(code).toMatch(/^[zj][A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(1500);
  });

  it('shares the room-independent scene, not the bound one', async () => {
    const bound = {
      ...PLANETS,
      items: PLANETS.items.map((i) => ({ ...i, baseScene: i.scene, scene: `On your couch: ${i.scene}` })),
    };
    const r = await decodeDeck(await encodeDeck(bound));
    expect(r.ok && r.deck.items[0].scene).toBe(PLANETS.items[0].scene);
  });

  it('re-vets tampered content', async () => {
    const evil = { ...PLANETS, items: [{ ...PLANETS.items[0], scene: 'Mercury drinks a pepsi.' }] };
    const r = await decodeDeck(await encodeDeck(evil));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.repaired).toBe(1);
      expect(r.deck.items[0].scene).not.toMatch(/pepsi/i);
    }
  });

  it('rejects garbage without throwing', async () => {
    expect((await decodeDeck('xnope')).ok).toBe(false);
    expect((await decodeDeck('zAAAA')).ok).toBe(false);
    expect((await decodeDeck('j' + 'A'.repeat(30000))).ok).toBe(false);
  });
});
