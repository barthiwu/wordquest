import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  rankCandidatesForSelection,
  type MasteryForRanking,
  type PlayerSelectionContext,
  type RankableWord,
} from './word-ranking';

/**
 * Word selection for a Quest. Generating the actual letter-omission
 * challenge for a selected word is NOT this service's job — that's
 * omission-engine.ts, called directly by QuestsService.
 *
 * pickWordsForQuest is the Adaptive Word Selection engine (V1 Remaining
 * Systems Spec §3) — replaces the old pure-random pick. Pipeline:
 *   eligible pool (active, not MASTERED)
 *     -> player profile + per-word Mastery history
 *     -> rankCandidatesForSelection (review-due, forgetting curve, CEFR
 *        proximity, category variety, category performance, difficulty
 *        fit — see word-ranking.ts)
 *     -> a light randomized sample from the top of the ranking, so the
 *        selection isn't perfectly deterministic run to run.
 */
@Injectable()
export class WordsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Picks `count` words for a quest, ranked by the Adaptive Word
   * Selection engine.
   *
   * `excludeWordIds` (V21 §3: "prevent unnecessary repetition") — the
   * caller's own word IDs already reserved in some other unresolved
   * attempt (e.g. an in-progress Daily Quest word not yet answered when
   * a different quest window's pick runs, or a Boss Battle group being
   * created for a player who also has a quest in flight) — words that
   * would otherwise be eligible for a completely independent reason
   * (not MASTERED, not yet reviewed) but shouldn't be handed out a
   * second time while the first instance is still unresolved.
   */
  async pickWordsForQuest(
    userId: string,
    count: number,
    excludeWordIds: string[] = [],
  ): Promise<string[]> {
    const masteries = await this.prisma.mastery.findMany({
      where: { userId },
      select: {
        wordId: true,
        currentLevel: true,
        lastReviewedAt: true,
        nextReviewDueAt: true,
        timesPresented: true,
        timesCorrect: true,
        timesIncorrect: true,
        word: { select: { category: true } },
      },
    });

    const masteredWordIds = masteries
      .filter((m: { currentLevel: string }) => m.currentLevel === 'MASTERED')
      .map((m: { wordId: string }) => m.wordId);

    let pool: RankableWord[] = await this.fetchActivePool([...masteredWordIds, ...excludeWordIds]);

    // Progressively relax the exclusions rather than ever returning an
    // empty quest — repetition beats a dead end, same reasoning as the
    // original MASTERED-only fallback below, just applied one step at a
    // time: first try honoring in-flight exclusion, then fall back to
    // allowing an in-flight repeat if that's truly the only way to fill
    // the quest, then (unchanged from before) fall back to the full
    // active pool once literally everything is mastered.
    if (pool.length === 0 && excludeWordIds.length > 0) {
      pool = await this.fetchActivePool(masteredWordIds);
    }
    if (pool.length === 0) {
      pool = await this.fetchActivePool([]);
    }

    if (pool.length <= count) {
      return pool.map((w) => w.id);
    }

    const ctx = await this.buildSelectionContext(userId, masteries);
    const ranked = rankCandidatesForSelection(pool, ctx);

    // Sample from the top slice of the ranking rather than taking it
    // strictly in order — keeps the strongest candidates dominant while
    // avoiding a perfectly deterministic "always the same word first"
    // feel. Slice size scales with `count` so a single-word quest still
    // has a handful of near-top candidates to vary between.
    const topSliceSize = Math.min(ranked.length, Math.max(count * 4, 8));
    return this.sample(ranked.slice(0, topSliceSize), count).map((w) => w.id);
  }

  private async fetchActivePool(excludeIds: string[]): Promise<RankableWord[]> {
    return this.prisma.word.findMany({
      where: { isActive: true, ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}) },
      select: {
        id: true,
        cefrLevel: true,
        category: true,
        difficultyScore: true,
        baseDifficulty: true,
      },
    });
  }

  private async buildSelectionContext(
    userId: string,
    masteries: Array<{
      wordId: string;
      currentLevel: string;
      lastReviewedAt: Date | null;
      nextReviewDueAt: Date | null;
      timesPresented: number;
      timesCorrect: number;
      timesIncorrect: number;
      word: { category: string | null };
    }>,
  ): Promise<PlayerSelectionContext> {
    const [profile, progression] = await Promise.all([
      this.prisma.learningProfile.findUnique({
        where: { userId },
        select: { currentDifficulty: true },
      }),
      this.prisma.userProgression.findUnique({
        where: { userId },
        select: { estimatedCefrLevel: true },
      }),
    ]);

    const masteryByWordId = new Map<string, MasteryForRanking>();
    const masteredCountByCategory = new Map<string, number>();
    // Raw presented/incorrect totals per category, across every attempt at
    // any mastery level — the input to the categoryPerformanceByCategory
    // weakness rate below. Kept separate from masteredCountByCategory,
    // which only counts fully-MASTERED words (a variety signal, not a
    // performance one).
    const categoryTotals = new Map<string, { presented: number; incorrect: number }>();
    for (const m of masteries) {
      masteryByWordId.set(m.wordId, {
        currentLevel: m.currentLevel as MasteryForRanking['currentLevel'],
        lastReviewedAt: m.lastReviewedAt,
        nextReviewDueAt: m.nextReviewDueAt,
        timesPresented: m.timesPresented,
        timesCorrect: m.timesCorrect,
        timesIncorrect: m.timesIncorrect,
      });
      if (m.currentLevel === 'MASTERED' && m.word.category) {
        masteredCountByCategory.set(
          m.word.category,
          (masteredCountByCategory.get(m.word.category) ?? 0) + 1,
        );
      }
      if (m.word.category) {
        const totals = categoryTotals.get(m.word.category) ?? { presented: 0, incorrect: 0 };
        totals.presented += m.timesPresented ?? 0;
        totals.incorrect += m.timesIncorrect ?? 0;
        categoryTotals.set(m.word.category, totals);
      }
    }

    // Guarded on a minimum sample size, same reasoning as struggleWeight's
    // per-word guard — a category with only 1-2 attempts shouldn't swing
    // selection on noise. Categories under the threshold are simply
    // omitted (neutral, not penalized) rather than defaulted to 0.
    const MIN_CATEGORY_SAMPLE = 3;
    const categoryPerformanceByCategory = new Map<string, number>();
    for (const [category, totals] of categoryTotals) {
      if (totals.presented >= MIN_CATEGORY_SAMPLE) {
        categoryPerformanceByCategory.set(category, totals.incorrect / totals.presented);
      }
    }

    return {
      currentDifficulty: profile?.currentDifficulty ?? 'BEGINNER',
      estimatedCefrLevel: progression?.estimatedCefrLevel ?? null,
      masteryByWordId,
      masteredCountByCategory,
      categoryPerformanceByCategory,
    };
  }

  private sample<T>(items: T[], count: number): T[] {
    return this.shuffle(items).slice(0, count);
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
