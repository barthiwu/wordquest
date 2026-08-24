import { gameplayRules } from '../config/gameplay-rules';

export type MasteryLevelName = 'NEW' | 'RECOGNIZING' | 'RECALLING' | 'STRONG' | 'MASTERED';

/**
 * Lightweight spaced-repetition scheduling (V1 Remaining Systems Spec §3's
 * "review schedule" / "forgetting curve" selection factors) — not a full
 * SM-2 implementation, just level-based intervals that get shorter for a
 * word the player barely knows and longer once it's well-established.
 */

/** The next review date for a word just reviewed at `reviewedAt`, given its current mastery level. */
export function nextReviewDueAt(level: MasteryLevelName, reviewedAt: Date = new Date()): Date {
  const days = gameplayRules.adaptiveSelection.reviewIntervalDaysByLevel[level];
  return new Date(reviewedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * A simple 0-1 "probability the player has forgotten this by now" estimate
 * — 0 right after review, rising linearly, capped at 1 once well past the
 * scheduled due date. Computed live from the two timestamps rather than
 * trusted as a static stored value, since the whole point is that it
 * changes every day even with no new activity.
 */
export function computeForgettingRisk(
  lastReviewedAt: Date | null,
  reviewDueAt: Date | null,
  now: Date = new Date(),
): number {
  if (!lastReviewedAt || !reviewDueAt) return 0; // never reviewed — not "forgotten," just not evidenced yet
  const totalInterval = reviewDueAt.getTime() - lastReviewedAt.getTime();
  if (totalInterval <= 0) return 1;
  const elapsed = now.getTime() - lastReviewedAt.getTime();
  // Risk reaches 0.6 exactly at the due date (still probably fine, worth
  // resurfacing), then keeps climbing toward 1 the longer it's overdue.
  const fractionOfInterval = elapsed / totalInterval;
  const risk = fractionOfInterval * 0.6 + Math.max(0, fractionOfInterval - 1) * 0.4;
  return Math.min(1, Math.max(0, risk));
}

/** True once `now` has reached the scheduled review date — the primary "needs review" signal for Adaptive Word Selection. */
export function isReviewDue(reviewDueAt: Date | null, now: Date = new Date()): boolean {
  return reviewDueAt !== null && now >= reviewDueAt;
}
