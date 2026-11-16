/**
 * SampleRing.push runs every frame while a memory is held (src/xr/recall-system.ts),
 * so it must not allocate: at 72-90 fps garbage turns into GC pauses in the headset.
 *
 * Measured with V8's own heap counter around a forced GC. A control that
 * allocates one small object per call proves the measurement can see garbage.
 */
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SampleRing } from '../src/core/toss.js';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

const CALLS = 20_000;

/** Heap bytes retained+garbage across CALLS calls of fn, after a warm-up so JIT code is not counted. */
function bytesDuring(fn: (i: number) => void): number {
  for (let i = 0; i < CALLS; i++) fn(i); // warm up and let the JIT settle
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < CALLS; i++) fn(i);
  return process.memoryUsage().heapUsed - before;
}

describe('per-frame helpers allocate nothing', () => {
  it('the measurement sees a small allocation per call (control)', () => {
    const keep: { t: number; p: number[] }[] = [];
    const bytes = bytesDuring((i) => {
      const s = { t: i, p: [i, i, i] };
      if (i % 1000 === 0) keep.push(s);
    });
    expect(bytes).toBeGreaterThan(CALLS * 16);
  });

  it('SampleRing.push reuses its samples', () => {
    const ring = new SampleRing(48);
    const bytes = bytesDuring((i) => ring.push(i / 90, i * 0.001, 1.2 + i * 0.0005, -0.4));
    // Under a byte per call: a single object per call would be 16+ bytes each.
    expect(bytes).toBeLessThan(CALLS);
    const last = ring.toArray().pop()!;
    expect(last.t).toBeCloseTo((CALLS - 1) / 90);
  });
});
