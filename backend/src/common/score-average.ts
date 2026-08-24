/**
 * Simple mean of a raw AI-scored dimension map (e.g. a Sentence or
 * Paragraph submission's per-dimension scores — grammar/vocabulary/
 * context/etc, each 0-100), rounded to the nearest whole point.
 *
 * Shared so every consumer that derives a single "the score for this
 * word cycle" number from one of these dimension maps — MasteryService's
 * sentenceScore/paragraphScore, LearningProfileService's rolling
 * avgSentenceScore/avgParagraphScore (Correction & Completion Spec §6:
 * "connect all available learning signals") — agrees on the same number
 * for the same input, rather than each computing its own average and
 * silently drifting apart if one changes.
 */
export function averageScoreDimensions(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
