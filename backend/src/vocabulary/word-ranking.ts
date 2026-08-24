import { gameplayRules } from '../config/gameplay-rules';
import { computeForgettingRisk, isReviewDue, type MasteryLevelName } from './review-schedule';

export interface RankableWord {
  id: string;
  cefrLevel: string | null;
  category: string | null;
  difficultyScore: number | null;
  baseDifficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}

export interface MasteryForRanking {
  currentLevel: MasteryLevelName;
  lastReviewedAt: Date | null;
  nextReviewDueAt: Date | null;
  /**
   * Struggle-rate history for this word (how often the player has
   * gotten it wrong across every past presentation) — a PERFORMANCE
   * signal that pulls a word the player struggles with back into
   * rotation sooner, not a recency/repetition-avoidance signal. Avoiding
   * an immediate repeat of a word already in an unresolved attempt right
   * now is handled separately, upstream, by WordsService.
   * pickWordsForQuest's `excludeWordIds` (V21 §3) — this field alone
   * previously stood in for "previous encounters" in an earlier pass's
   * doc comment, which overstated what it covers.
   */
  timesPresented: number;
  timesCorrect: number;
  timesIncorrect: number;
}

export interface PlayerSelectionContext {
  /** From LearningProfile.currentDifficulty, or a BEGINNER default for a brand-new player. */
  currentDifficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  /** UserProgression.estimatedCefrLevel — the rolling evidence-based estimate, may be null early on. */
  estimatedCefrLevel: string | null;
  /** wordId -> Mastery row, only for words the player has SOME history with; absent = never presented. */
  masteryByWordId: Map<string, MasteryForRanking>;
  /** category -> how many of the player's mastered words are in it — used to favor under-explored categories. */
  masteredCountByCategory: Map<string, number>;
  /**
   * category -> the player's incorrect rate (0-1) across every attempt in
   * that category, at any mastery level — the "Category performance"
   * signal (V20 Beta Release Checklist §3), distinct from
   * masteredCountByCategory's variety signal above: a category can be
   * under-mastered but high-accuracy (still developing, not struggling),
   * or well-explored but error-prone (a real weak spot). Absent entries
   * mean not enough attempts yet to judge — see MIN_CATEGORY_SAMPLE.
   */
  categoryPerformanceByCategory: Map<string, number>;
}

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DIFFICULTY_TO_CEFR_MIDPOINT: Record<string, number> = {
  BEGINNER: 1, // ~A2
  INTERMEDIATE: 3, // ~B2
  ADVANCED: 5, // ~C2
};

/**
 * The Adaptive Word Selection ranking (V1 Remaining Systems Spec §3):
 * scores each candidate word by review-due status, forgetting risk, CEFR
 * proximity to the player, category variety, and difficulty-score fit,
 * then heavily deprioritizes (but doesn't exclude) STRONG words so they
 * still resurface for spaced review. Pure function — no DB/randomness —
 * so it's exactly reproducible and easy to unit test; `pickWordsForQuest`
 * layers a light randomized sample on top of the sorted result.
 */
export function scoreWordForSelection(
  word: RankableWord,
  ctx: PlayerSelectionContext,
  now: Date = new Date(),
): number {
  const weights = gameplayRules.adaptiveSelection;
  const mastery = ctx.masteryByWordId.get(word.id) ?? null;
  let score = 0;

  // Review scheduling is the primary driver — a word due for review (or
  // never presented, which is trivially "not yet reviewed") ranks above
  // one that was just seen.
  if (!mastery || isReviewDue(mastery.nextReviewDueAt, now)) {
    score += weights.reviewDueWeight;
  }

  if (mastery) {
    score +=
      computeForgettingRisk(mastery.lastReviewedAt, mastery.nextReviewDueAt, now) *
      weights.forgettingRiskWeight;
  }

  // CEFR proximity — how close word.cefrLevel is to the player's current
  // difficulty/estimated level. Unenriched words (cefrLevel null) get a
  // neutral (zero) contribution rather than being penalized — content
  // richness gaps shouldn't make a word unselectable.
  const playerCefrIndex =
    CEFR_ORDER.indexOf(ctx.estimatedCefrLevel ?? '') >= 0
      ? CEFR_ORDER.indexOf(ctx.estimatedCefrLevel as string)
      : DIFFICULTY_TO_CEFR_MIDPOINT[ctx.currentDifficulty];
  const wordCefrIndex = word.cefrLevel ? CEFR_ORDER.indexOf(word.cefrLevel) : -1;
  if (wordCefrIndex >= 0) {
    const distance = Math.abs(wordCefrIndex - playerCefrIndex);
    score += Math.max(0, 1 - distance / CEFR_ORDER.length) * weights.cefrProximityWeight;
  }

  // Category variety — favor categories the player has mastered fewer
  // words in, so the selection doesn't camp on one theme.
  if (word.category) {
    const masteredInCategory = ctx.masteredCountByCategory.get(word.category) ?? 0;
    const totalMastered = Array.from(ctx.masteredCountByCategory.values()).reduce(
      (a, b) => a + b,
      0,
    );
    const varietyBonus = totalMastered === 0 ? 1 : 1 - masteredInCategory / (totalMastered + 1);
    score += varietyBonus * weights.categoryVarietyWeight;
  }

  // Category performance — a category the player is currently weak in
  // (measured across every attempt in it, any mastery level) resurfaces
  // more, independent of the variety bonus above.
  if (word.category) {
    const categoryWeakness = ctx.categoryPerformanceByCategory.get(word.category);
    if (categoryWeakness != null) {
      score += categoryWeakness * weights.categoryPerformanceWeight;
    }
  }

  // Difficulty-score fit — prefer words near the player's current tier.
  if (word.difficultyScore != null) {
    const targetScore = { BEGINNER: 25, INTERMEDIATE: 55, ADVANCED: 85 }[ctx.currentDifficulty];
    const distance = Math.abs(word.difficultyScore - targetScore) / 100;
    score += Math.max(0, 1 - distance) * weights.difficultyScoreWeight;
  }

  if (mastery?.currentLevel === 'STRONG') {
    score -= weights.strongWordPenalty;
  }

  // Previous encounters (V19 Stabilization Spec §3) — a word the player
  // has gotten wrong more often than not should resurface more, on top
  // of (not instead of) the spaced-repetition review-due signal above.
  // Guarded on a minimum sample size so one unlucky miss on a brand-new
  // word doesn't outweigh actual review-due timing.
  if (mastery && mastery.timesPresented >= 2) {
    const incorrectRate = mastery.timesIncorrect / mastery.timesPresented;
    score += incorrectRate * weights.struggleWeight;
  }

  return score;
}

/** Sorts candidates best-first. Ties broken by id for determinism in tests — pickWordsForQuest adds real randomness on top when sampling. */
export function rankCandidatesForSelection(
  candidates: RankableWord[],
  ctx: PlayerSelectionContext,
  now: Date = new Date(),
): RankableWord[] {
  return [...candidates].sort((a, b) => {
    const diff = scoreWordForSelection(b, ctx, now) - scoreWordForSelection(a, ctx, now);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}
