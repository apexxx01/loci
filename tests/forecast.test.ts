import { describe, expect, it } from 'vitest';
import { forgettingCurves } from '../src/core/forecast.js';

describe('forgetting curves', () => {
  const { points, reviews } = forgettingCurves(60, 1);
  it('decays when a fact is met once', () => {
    expect(points[0].once).toBeGreaterThan(0.9);
    expect(points[60].once).toBeLessThan(points[10].once);
    expect(points[60].once).toBeLessThan(0.75);
  });
  it('stays high when recalled on schedule, with widening gaps', () => {
    expect(points[60].spaced).toBeGreaterThan(points[60].once + 0.1);
    expect(Math.min(...points.map((p) => p.spaced))).toBeGreaterThan(0.85);
    expect(reviews.length).toBeGreaterThanOrEqual(2);
    for (let i = 2; i < reviews.length; i++) expect(reviews[i] - reviews[i - 1]).toBeGreaterThan(reviews[i - 1] - reviews[i - 2]);
  });
});
