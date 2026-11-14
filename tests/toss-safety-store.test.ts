import { describe, expect, it } from 'vitest';
import { PLANETS, STARTER_DECKS } from '../src/core/decks.js';
import {
  MemoryStore,
  STORAGE_KEY,
  createPalace,
  loadPalace,
  recordReview,
  savePalace,
} from '../src/core/palace.js';
import { checkMnemonic, sanitizeUserText } from '../src/core/safety.js';
import { DeckSchema } from '../src/core/schema.js';
import { SampleRing, classifyToss, rateToss, releaseVelocity } from '../src/core/toss.js';

describe('toss classification', () => {
  const track = (vx: number, vy: number, vz: number, jitter = 0) => {
    const ring = new SampleRing();
    for (let i = 0; i < 12; i++) {
      const t = i / 72;
      const j = jitter * (i % 2 ? 1 : -1);
      ring.push(t, vx * t + j, 1 + vy * t + j, vz * t);
    }
    return releaseVelocity(ring.toArray());
  };

  it('recovers velocity from a steady flick', () => {
    const v = track(0, 1.5, 0);
    expect(v[1]).toBeCloseTo(1.5, 3);
  });

  it('reads an upward flick as recalled and a downward push as forgotten', () => {
    expect(classifyToss(track(0.1, 1.4, -0.2))).toBe('up');
    expect(classifyToss(track(0, -1.2, 0.1))).toBe('down');
  });

  it('ignores slow drags and sideways throws', () => {
    expect(classifyToss(track(0.05, 0.3, 0))).toBe('none');
    expect(classifyToss(track(2.5, 0.9, 0))).toBe('none');
  });

  it('is robust to hand-tracking jitter', () => {
    expect(classifyToss(track(0, 1.4, 0, 0.004))).toBe('up');
  });

  it('downgrades a hinted recall to hard', () => {
    expect(rateToss('up', false)).toBe('good');
    expect(rateToss('up', true)).toBe('hard');
    expect(rateToss('down', true)).toBe('again');
    expect(rateToss('none', false)).toBeNull();
  });

  it('ring buffer keeps only the newest samples, oldest first', () => {
    const ring = new SampleRing(4);
    for (let i = 0; i < 6; i++) ring.push(i, i, 0, 0);
    expect(ring.toArray().map((s) => s.t)).toEqual([2, 3, 4, 5]);
  });
});

describe('mnemonic safety', () => {
  const notes = 'Mercury Venus Earth Mars';
  it('accepts a vivid, sourced mnemonic', () => {
    expect(checkMnemonic('Imagine Mercury sprinting around a giant campfire.', notes).ok).toBe(true);
  });
  it('rejects brands even when lower-cased', () => {
    const v = checkMnemonic('A thermometer drinks a can of pepsi.', notes);
    expect(v.ok).toBe(false);
    expect(v.reasons[0]).toContain('pepsi');
  });
  it('rejects invented proper nouns that could be real people', () => {
    const v = checkMnemonic('Mars shakes hands with Albert in a lab.', notes);
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toContain('Albert');
  });
  it('allows a term the learner wrote themselves', () => {
    expect(checkMnemonic('Blood cells race through tunnels.', 'red blood cells').ok).toBe(true);
    expect(checkMnemonic('Blood cells race through tunnels.', 'planets').ok).toBe(false);
  });
  it('does not flag words that merely contain a blocked term', () => {
    expect(checkMnemonic('A question mark sits on a classic sofa.', '').ok).toBe(true);
  });
  it('sanitises control characters and length', () => {
    expect(sanitizeUserText('a\u0007b\r\nc', 10)).toBe('ab\nc');
    expect(sanitizeUserText('x'.repeat(50), 10)).toHaveLength(10);
  });
  it('passes every starter-deck mnemonic', () => {
    for (const deck of STARTER_DECKS)
      for (const item of deck.items) {
        const v = checkMnemonic(item.scene, `${item.cue} ${item.answer}`);
        expect(v.reasons, `${deck.id}: ${item.scene}`).toEqual([]);
      }
  });
});

describe('palace persistence', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  it('round-trips a palace through storage', () => {
    const store = new MemoryStore();
    let palace = createPalace(PLANETS, [{ memoryId: 'planets:0', label: 'table', pose: { p: [0, 1, -1], q: [0, 0, 0, 1] } }], now);
    palace = recordReview(palace, 'planets:0', 'good', now);
    expect(savePalace(store, palace)).toBe(true);
    const loaded = loadPalace(store);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.palace).toEqual(palace);
  });
  it('reports corrupt data instead of crashing', () => {
    const store = new MemoryStore();
    store.setItem(STORAGE_KEY, '{"version":1,"id":3}');
    expect(loadPalace(store).status).toBe('corrupt');
    store.setItem(STORAGE_KEY, 'not json');
    expect(loadPalace(store).status).toBe('corrupt');
  });
  it('survives storage that throws (private mode / quota)', () => {
    const broken = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('quota'); },
      removeItem() {},
    };
    expect(loadPalace(broken).status).toBe('empty');
    expect(savePalace(broken, createPalace(PLANETS, [], now))).toBe(false);
  });
  it('validates every starter deck against the schema', () => {
    for (const d of STARTER_DECKS) expect(DeckSchema.safeParse(d).success).toBe(true);
  });
});
