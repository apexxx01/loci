/**
 * Spaced-repetition scheduling. Deterministic FSRS (no fuzz) so the same
 * history always produces the same schedule — the AI never decides when you
 * review, the maths does.
 */
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import type { Palace, ReviewEvent, StoredCard } from './types.js';

const engine = fsrs({ enable_fuzz: false, request_retention: 0.9 });

export type RecallRating = ReviewEvent['rating'];

const RATING: Record<RecallRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

export function toStored(card: Card): StoredCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    last_review: card.last_review?.toISOString(),
  };
}

export function fromStored(s: StoredCard): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    learning_steps: s.learning_steps,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card;
}

export function newCard(now: Date): StoredCard {
  return toStored(createEmptyCard(now));
}

/** Apply one review, returning the updated card. Pure. */
export function review(card: StoredCard, rating: RecallRating, now: Date): StoredCard {
  return toStored(engine.next(fromStored(card), now, RATING[rating]).card);
}

/** Memory ids due at `now`, most overdue first. New cards count as due. */
export function dueIds(palace: Palace, now: Date): string[] {
  return Object.entries(palace.cards)
    .filter(([, c]) => new Date(c.due).getTime() <= now.getTime())
    .sort(([, a], [, b]) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .map(([id]) => id);
}

/** Next due time across the palace, or null if the palace is empty. */
export function nextDue(palace: Palace): Date | null {
  let min = Infinity;
  for (const c of Object.values(palace.cards)) min = Math.min(min, new Date(c.due).getTime());
  return Number.isFinite(min) ? new Date(min) : null;
}

/**
 * Mastery in [0,1]: share of cards that have graduated to Review state with a
 * stability of at least `days`. Drives how brightly the palace glows.
 */
export function mastery(palace: Palace, days = 3): number {
  const cards = Object.values(palace.cards);
  if (!cards.length) return 0;
  const strong = cards.filter((c) => c.state === 2 && c.stability >= days).length;
  return strong / cards.length;
}

/** Retrievability today, the FSRS estimate that you'd recall a card right now. */
export function retrievability(card: StoredCard, now: Date): number {
  if (card.state === 0) return 0;
  return engine.retrievability(fromStored(card), now);
}

const DAY = 86_400_000;
const dayKey = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / DAY);

/** Consecutive local days (ending today or yesterday) with at least one review. */
export function streak(history: ReviewEvent[], now: Date): number {
  if (!history.length) return 0;
  const days = new Set(history.map((e) => dayKey(new Date(e.at))));
  let day = dayKey(now);
  if (!days.has(day)) day -= 1; // a streak survives until you miss a full day
  let count = 0;
  while (days.has(day)) {
    count++;
    day--;
  }
  return count;
}
