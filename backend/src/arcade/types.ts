import { Word, WordDifficulty } from '@prisma/client';

/** Which Arcade game a session/match belongs to. Mirrors the Prisma
 * ArcadeGame enum — kept as a separate TS type only so game modules
 * don't need to import @prisma/client just for this. */
export type ArcadeGameKind = 'SCRAMBLE_QUEST' | 'WORD_DUEL' | 'COMPLETE_IT';

/**
 * A full, server-side-only vocabulary challenge — includes the answer
 * (`word.word`) and everything needed to build any of the three games'
 * presentations. NEVER serialize this directly into an API response;
 * spec §8: "Do not send the full challenge object to clients when it
 * contains the answer." Each game builds its own client-safe view (see
 * scramble-quest/, complete-it/, word-duel/ presentation builders) from
 * this.
 */
export interface ArcadeChallenge {
  word: Word;
  difficulty: WordDifficulty;
}

/**
 * The result of a completed answer, independent of which game produced
 * it — the shape every game's answer-handling code converges on before
 * calling RewardEngineService and persisting an audit row.
 */
export interface ArcadeAnswerOutcome {
  isCorrect: boolean;
  hintsUsed: number;
  responseTimeMs: number;
  timedOut: boolean;
}

/** Streak transition after one answer (spec §4: correct extends it,
 * wrong/timeout resets it to 0). Pure, no side effects — callers persist
 * the before/after pair themselves as part of that answer's audit row. */
export function nextStreak(
  currentStreak: number,
  outcome: Pick<ArcadeAnswerOutcome, 'isCorrect' | 'timedOut'>,
): number {
  if (!outcome.isCorrect || outcome.timedOut) return 0;
  return currentStreak + 1;
}
