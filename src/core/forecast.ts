/**
 * Forgetting curves from the same FSRS model that schedules reviews: what the
 * model expects you to retain if you meet a fact once, versus recalling it
 * each time it comes due. A model's forecast, not a measurement of a person.
 */
import { newCard, retrievability, review } from './scheduler.js';

export interface CurvePoint {
  day: number;
  once: number;
  spaced: number;
}

export function forgettingCurves(days = 60, stepDays = 0.5, start = new Date('2026-01-01T09:00:00Z')): { points: CurvePoint[]; reviews: number[] } {
  const DAY = 86_400_000;
  // Both begin the same way: learned, then recalled once ten minutes later.
  let base = review(newCard(start), 'good', start);
  base = review(base, 'good', new Date(base.due));
  const once = base;
  let spaced = base;
  const points: CurvePoint[] = [];
  const reviews: number[] = [];
  for (let d = 0; d <= days + 1e-9; d += stepDays) {
    const at = new Date(start.getTime() + d * DAY);
    while (new Date(spaced.due).getTime() <= at.getTime() && d > 0) {
      const due = new Date(spaced.due);
      reviews.push((due.getTime() - start.getTime()) / DAY);
      spaced = review(spaced, 'good', due);
    }
    points.push({ day: d, once: Number(retrievability(once, at)), spaced: Number(retrievability(spaced, at)) });
  }
  return { points, reviews };
}
