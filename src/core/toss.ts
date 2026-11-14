/**
 * Grab-and-toss recall rating. The learner grabs a memory and flicks it UP if
 * they recalled it, or pushes it DOWN if they didn't. Classification uses the
 * hand's release velocity, so it needs no pose classifier and behaves the same
 * with real hands, controllers, or the emulator.
 */
import type { Vec3 } from './types.js';

export const TOSS = {
  /** Vertical speed (m/s) that counts as a deliberate flick. */
  flickSpeed: 0.75,
  /** A flick must be mostly vertical: |vy| / |v| at least this. */
  verticality: 0.55,
  /** Window of samples used to estimate release velocity (seconds). */
  window: 0.12,
} as const;

export type TossResult = 'up' | 'down' | 'none';

export interface PoseSample {
  t: number; // seconds
  p: Vec3;
}

/**
 * Least-squares velocity over the last `window` seconds of samples. Robust to
 * single-frame jitter from hand tracking, unlike a two-point difference.
 */
export function releaseVelocity(samples: PoseSample[], window: number = TOSS.window): Vec3 {
  if (samples.length < 2) return [0, 0, 0];
  const tEnd = samples[samples.length - 1].t;
  const recent = samples.filter((s) => tEnd - s.t <= window);
  const pts = recent.length >= 2 ? recent : samples.slice(-2);
  const n = pts.length;
  const tMean = pts.reduce((a, s) => a + s.t, 0) / n;
  let denom = 0;
  const num: Vec3 = [0, 0, 0];
  const mean: Vec3 = [0, 0, 0];
  for (const s of pts) for (let k = 0; k < 3; k++) mean[k] += s.p[k] / n;
  for (const s of pts) {
    const dt = s.t - tMean;
    denom += dt * dt;
    for (let k = 0; k < 3; k++) num[k] += dt * (s.p[k] - mean[k]);
  }
  if (denom < 1e-9) return [0, 0, 0];
  return [num[0] / denom, num[1] / denom, num[2] / denom];
}

export function classifyToss(v: Vec3): TossResult {
  const speed = Math.hypot(v[0], v[1], v[2]);
  if (speed < 1e-6) return 'none';
  if (Math.abs(v[1]) < TOSS.flickSpeed) return 'none';
  if (Math.abs(v[1]) / speed < TOSS.verticality) return 'none';
  return v[1] > 0 ? 'up' : 'down';
}

/**
 * Turn a toss into an FSRS rating. Using a hint before a successful recall
 * downgrades it to "hard" — effort is information the scheduler should get.
 */
export function rateToss(result: TossResult, usedHint: boolean): 'again' | 'hard' | 'good' | null {
  if (result === 'none') return null;
  if (result === 'down') return 'again';
  return usedHint ? 'hard' : 'good';
}

/** Fixed-size ring buffer of pose samples; allocation-free after construction. */
export class SampleRing {
  private readonly buf: PoseSample[];
  private head = 0;
  private size = 0;

  constructor(private readonly capacity = 24) {
    this.buf = Array.from({ length: capacity }, () => ({ t: 0, p: [0, 0, 0] as Vec3 }));
  }

  push(t: number, x: number, y: number, z: number): void {
    const s = this.buf[this.head];
    s.t = t;
    s.p[0] = x;
    s.p[1] = y;
    s.p[2] = z;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  clear(): void {
    this.size = 0;
    this.head = 0;
  }

  /** Samples oldest → newest (allocates; call only on release). */
  toArray(): PoseSample[] {
    const out: PoseSample[] = [];
    for (let i = 0; i < this.size; i++) {
      const s = this.buf[(this.head - this.size + i + this.capacity) % this.capacity];
      out.push({ t: s.t, p: [s.p[0], s.p[1], s.p[2]] });
    }
    return out;
  }
}
