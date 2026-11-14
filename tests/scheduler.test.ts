import { describe, expect, it } from 'vitest';
import { PLANETS } from '../src/core/decks.js';
import { createPalace, recordReview } from '../src/core/palace.js';
import { dueIds, mastery, nextDue, review, newCard, streak } from '../src/core/scheduler.js';

const t0 = new Date('2026-11-14T10:00:00Z');
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);
const DAY = 86_400_000;

describe('scheduler', () => {
  it('treats every new card as due immediately', () => {
    const palace = createPalace(PLANETS, [], t0);
    expect(dueIds(palace, t0)).toHaveLength(8);
  });

  it('pushes a remembered card out further than a forgotten one', () => {
    const c = newCard(t0);
    const good = review(c, 'good', t0);
    const again = review(c, 'again', t0);
    expect(new Date(good.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
  });

  it('grows intervals with repeated success', () => {
    let c = newCard(t0);
    let now = t0;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      c = review(c, 'good', now);
      const due = new Date(c.due);
      intervals.push(due.getTime() - now.getTime());
      now = due;
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it('treats hard as between again and good', () => {
    let c = newCard(t0);
    c = review(c, 'good', t0);
    const later = new Date(c.due);
    const hard = new Date(review(c, 'hard', later).due).getTime();
    const good = new Date(review(c, 'good', later).due).getTime();
    const again = new Date(review(c, 'again', later).due).getTime();
    expect(hard).toBeGreaterThanOrEqual(again);
    expect(hard).toBeLessThanOrEqual(good);
  });

  it('is deterministic (no fuzz)', () => {
    const a = review(newCard(t0), 'good', t0);
    const b = review(newCard(t0), 'good', t0);
    expect(a).toEqual(b);
  });

  it('removes reviewed cards from the due list until they are due again', () => {
    let palace = createPalace(PLANETS, [], t0);
    palace = recordReview(palace, 'planets:0', 'good', t0);
    expect(dueIds(palace, t0)).not.toContain('planets:0');
    expect(nextDue(palace)?.getTime()).toBe(t0.getTime());
    expect(palace.history).toHaveLength(1);
  });

  it('ignores reviews for unknown memories', () => {
    const palace = createPalace(PLANETS, [], t0);
    expect(recordReview(palace, 'nope', 'good', t0)).toBe(palace);
  });

  it('reports mastery only once cards are stable', () => {
    let palace = createPalace(PLANETS, [], t0);
    expect(mastery(palace)).toBe(0);
    let now = t0;
    for (let round = 0; round < 4; round++) {
      for (const item of PLANETS.items) palace = recordReview(palace, item.id, 'good', now);
      now = plus(now, 10 * DAY);
    }
    expect(mastery(palace)).toBe(1);
  });
});

describe('streak', () => {
  const at = (d: Date) => ({ memoryId: 'x', at: d.toISOString(), rating: 'good' as const });
  it('counts consecutive days ending today', () => {
    const h = [at(plus(t0, -2 * DAY)), at(plus(t0, -DAY)), at(t0)];
    expect(streak(h, t0)).toBe(3);
  });
  it('survives until a full day is missed', () => {
    expect(streak([at(plus(t0, -DAY))], t0)).toBe(1);
    expect(streak([at(plus(t0, -2 * DAY))], t0)).toBe(0);
  });
  it('is 0 with no history', () => {
    expect(streak([], t0)).toBe(0);
  });
});
