import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WordDifficulty } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { gameplayRules } from '../config/gameplay-rules';

type Db = PrismaService | Prisma.TransactionClient;

export interface WordCompletionSignal {
  /** True if the Guess stage was answered correctly on the first try (no wrong attempts). */
  cleanGuess: boolean;
  hintsUsed: number;
  maxHints: number;
  elapsedSeconds: number;
  /**
   * 0-100 average across this word cycle's AI-scored Sentence-stage
   * dimensions — same scale, same averaging, as Mastery.sentenceScore
   * (Correction & Completion Spec §6: "expand calibration beyond
   * guessing", "connect all available learning signals").
   */
  sentenceScore: number;
  /** 0-100 average across this word cycle's AI-scored Paragraph-stage dimensions — same scale as Mastery.paragraphScore. */
  paragraphScore: number;
}

export interface LearningProfileView {
  calibrated: boolean;
  calibrationWordsCompleted: number;
  currentDifficulty: WordDifficulty;
  recommendedDifficulty: WordDifficulty | null;
  recommendedDifficultyAcceptedAt: Date | null;
  initialCefrEstimate: string | null;
  weaknessAreas: string[];
  avgGuessAccuracy: number;
  avgSentenceScore: number;
  avgParagraphScore: number;
  avgResponseSpeedMs: number;
  hintDependencyRate: number;
  learningConsistency: number;
}

/**
 * The Adaptive AI Learning Engine's Player Learning Profile (V1 Remaining
 * Systems Spec §1) — one row per player, continuously updated from every
 * Daily Quest word completion. Per-word detail (weak/strong words,
 * mastery, review schedule) already lives on Mastery; this is the
 * cross-word aggregate plus the one-time Initial Calibration result.
 *
 * Initial Calibration: the first 3 Daily Quest words are treated as a
 * diagnostic — recordWordCompletion counts toward calibrationWordsCompleted,
 * and on the 3rd, computes a recommended difficulty and an initial CEFR
 * estimate from the rolling aggregates observed so far (Correction &
 * Completion Spec §6: this blends Guess, Sentence, AND Paragraph
 * performance, not guessing alone). The player may accept or reject the
 * recommendation (accept/rejectRecommendedDifficulty) — rejecting simply
 * leaves currentDifficulty unchanged.
 *
 * weaknessAreas is a separate, ongoing signal — recomputed from the
 * latest rolling aggregates on EVERY word completion, not just at
 * calibration, so it reflects the player's current weak spots rather
 * than a one-time snapshot from their first 3 words.
 */
@Injectable()
export class LearningProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<LearningProfileView> {
    const profile = await this.prisma.learningProfile.findUnique({ where: { userId } });
    return this.toView(profile);
  }

  /**
   * Called once per completed Daily Quest word (QuestsService.completeWord)
   * — updates the rolling performance aggregates and, during the first 3
   * words, drives calibration. Returns whether calibration just completed
   * on THIS call, so the caller can surface the recommendation immediately.
   */
  async recordWordCompletion(
    userId: string,
    signal: WordCompletionSignal,
    db: Db = this.prisma,
  ): Promise<{ calibrationJustCompleted: boolean }> {
    const existing = await db.learningProfile.findUnique({ where: { userId } });
    const wasCalibrated = existing?.calibrated ?? false;

    const newAvgGuessAccuracy = this.ema(
      existing?.avgGuessAccuracy ?? 0.5,
      signal.cleanGuess ? 1 : 0,
    );
    // Correction & Completion Spec §6 ("connect all available learning
    // signals"): Sentence/Paragraph are AI-scored the moment this word's
    // cycle completes, same as the Guess-stage signal above — these used
    // to be dropped entirely here, so calibration and weakness detection
    // only ever saw guessing. Default seed (50) is the neutral midpoint
    // of the 0-100 scale, matching avgGuessAccuracy's 0.5 seed.
    const newAvgSentenceScore = this.ema(existing?.avgSentenceScore ?? 50, signal.sentenceScore);
    const newAvgParagraphScore = this.ema(existing?.avgParagraphScore ?? 50, signal.paragraphScore);
    const hintDependency = signal.maxHints > 0 ? signal.hintsUsed / signal.maxHints : 0;
    const newHintDependencyRate = this.ema(existing?.hintDependencyRate ?? 0, hintDependency);
    const newAvgResponseSpeedMs = Math.round(
      this.ema(
        existing?.avgResponseSpeedMs ?? signal.elapsedSeconds * 1000,
        signal.elapsedSeconds * 1000,
      ),
    );
    // A crude but honest consistency signal: every genuine completion
    // nudges it toward 1; a real "did the player show up regularly"
    // measure lives on the streak system (ProgressionService) — this is
    // deliberately just "are they finishing what they start."
    const newLearningConsistency = this.ema(existing?.learningConsistency ?? 0.5, 1);

    const priorCalibrationCount = existing?.calibrationWordsCompleted ?? 0;
    const newCalibrationCount = wasCalibrated
      ? priorCalibrationCount
      : Math.min(3, priorCalibrationCount + 1);
    const calibrationJustCompleted = !wasCalibrated && newCalibrationCount === 3;

    const calibrationFields = calibrationJustCompleted
      ? this.computeCalibrationResult(
          newAvgGuessAccuracy,
          newAvgSentenceScore,
          newAvgParagraphScore,
          newHintDependencyRate,
        )
      : {};

    // Correction & Completion Spec §6 ("improve weakness detection"):
    // recomputed from the freshest rolling aggregates on every completed
    // word — not gated behind calibration — so a weakness that resolves
    // (or a new one that emerges) well after the player's first 3 words
    // still shows up here instead of freezing forever.
    const weaknessAreas = this.computeWeaknessAreas({
      avgGuessAccuracy: newAvgGuessAccuracy,
      avgSentenceScore: newAvgSentenceScore,
      avgParagraphScore: newAvgParagraphScore,
      hintDependencyRate: newHintDependencyRate,
    });

    if (calibrationJustCompleted) {
      // The CEFR evidence trail's very first entry for this player (V1
      // Remaining Systems Spec §16) — Initial Calibration's own estimate,
      // recorded the same way a Paragraph submission's is, so a brand-new
      // player already has one data point before they've written anything.
      await db.cefrAssessment.create({
        data: {
          userId,
          source: 'CALIBRATION',
          level: (calibrationFields as { initialCefrEstimate: string }).initialCefrEstimate,
          confidence: 0.5, // a 3-word sample is a rough starting estimate, not high-confidence evidence
          dimensions: {
            avgGuessAccuracy: newAvgGuessAccuracy,
            avgSentenceScore: newAvgSentenceScore,
            avgParagraphScore: newAvgParagraphScore,
            hintDependencyRate: newHintDependencyRate,
          },
        },
      });
    }

    await db.learningProfile.upsert({
      where: { userId },
      create: {
        userId,
        calibrationWordsCompleted: newCalibrationCount,
        avgGuessAccuracy: newAvgGuessAccuracy,
        avgSentenceScore: newAvgSentenceScore,
        avgParagraphScore: newAvgParagraphScore,
        avgResponseSpeedMs: newAvgResponseSpeedMs,
        hintDependencyRate: newHintDependencyRate,
        learningConsistency: newLearningConsistency,
        weaknessAreas,
        ...calibrationFields,
      },
      update: {
        calibrationWordsCompleted: newCalibrationCount,
        avgGuessAccuracy: newAvgGuessAccuracy,
        avgSentenceScore: newAvgSentenceScore,
        avgParagraphScore: newAvgParagraphScore,
        avgResponseSpeedMs: newAvgResponseSpeedMs,
        hintDependencyRate: newHintDependencyRate,
        learningConsistency: newLearningConsistency,
        weaknessAreas,
        ...calibrationFields,
      },
    });

    return { calibrationJustCompleted };
  }

  /** The player accepts the post-calibration (or any later) difficulty recommendation. */
  async acceptRecommendedDifficulty(userId: string): Promise<LearningProfileView> {
    const profile = await this.prisma.learningProfile.findUnique({ where: { userId } });
    if (!profile?.recommendedDifficulty) {
      throw new BadRequestException('There is no pending difficulty recommendation to accept.');
    }
    const updated = await this.prisma.learningProfile.update({
      where: { userId },
      data: {
        currentDifficulty: profile.recommendedDifficulty,
        recommendedDifficultyAcceptedAt: new Date(),
      },
    });
    return this.toView(updated);
  }

  /** The player rejects it — currentDifficulty is left exactly as it was. */
  async rejectRecommendedDifficulty(userId: string): Promise<LearningProfileView> {
    const profile = await this.prisma.learningProfile.findUnique({ where: { userId } });
    if (!profile?.recommendedDifficulty) {
      throw new BadRequestException('There is no pending difficulty recommendation to reject.');
    }
    const updated = await this.prisma.learningProfile.update({
      where: { userId },
      data: { recommendedDifficulty: null },
    });
    return this.toView(updated);
  }

  private computeCalibrationResult(
    avgGuessAccuracy: number,
    avgSentenceScore: number,
    avgParagraphScore: number,
    hintDependencyRate: number,
  ): {
    calibrated: true;
    recommendedDifficulty: WordDifficulty;
    initialCefrEstimate: string;
  } {
    // Correction & Completion Spec §6 ("expand calibration beyond
    // guessing"): the recommendation now blends all three Daily Quest
    // skill areas the player has touched by their 3rd word — Guess,
    // Sentence, and Paragraph — weighted equally, not raw guessing
    // accuracy alone. Heavy hint use still pulls the score down (leaning
    // on hints to get every guess right isn't the same signal as
    // genuinely knowing the word).
    const score =
      (avgGuessAccuracy + avgSentenceScore / 100 + avgParagraphScore / 100) / 3 -
      hintDependencyRate * 0.3;
    const recommendedDifficulty: WordDifficulty =
      score >= 0.75 ? 'ADVANCED' : score >= 0.45 ? 'INTERMEDIATE' : 'BEGINNER';
    const initialCefrEstimate = { BEGINNER: 'A2', INTERMEDIATE: 'B1', ADVANCED: 'B2' }[
      recommendedDifficulty
    ];

    return { calibrated: true, recommendedDifficulty, initialCefrEstimate };
  }

  /**
   * Correction & Completion Spec §6 ("improve weakness detection",
   * "connect all available learning signals"): every Daily Quest skill
   * area with real signal behind it — Guess (avgGuessAccuracy, the same
   * underlying accuracy the Skill Radar's Context dimension reads),
   * Sentence, and Paragraph — plus the purely behavioral hint-dependency
   * signal. Labels match the Skill Radar's own dimension names
   * (skills.controller.ts) so "context"/"sentence construction"/
   * "writing" mean the same thing everywhere in the product.
   */
  private computeWeaknessAreas(aggregates: {
    avgGuessAccuracy: number;
    avgSentenceScore: number;
    avgParagraphScore: number;
    hintDependencyRate: number;
  }): string[] {
    const { skillAreaWeaknessPercent, hintDependencyWeaknessRate } = gameplayRules.learningProfile;
    const areas: string[] = [];
    if (aggregates.avgGuessAccuracy * 100 < skillAreaWeaknessPercent) areas.push('context');
    if (aggregates.avgSentenceScore < skillAreaWeaknessPercent) areas.push('sentence construction');
    if (aggregates.avgParagraphScore < skillAreaWeaknessPercent) areas.push('writing');
    if (aggregates.hintDependencyRate > hintDependencyWeaknessRate) areas.push('hint dependency');
    return areas;
  }

  private ema(current: number, sample: number, smoothing = 0.25): number {
    return current + (sample - current) * smoothing;
  }

  private toView(
    profile: {
      calibrated: boolean;
      calibrationWordsCompleted: number;
      currentDifficulty: WordDifficulty;
      recommendedDifficulty: WordDifficulty | null;
      recommendedDifficultyAcceptedAt: Date | null;
      initialCefrEstimate: string | null;
      weaknessAreas: string[];
      avgGuessAccuracy: number | null;
      avgSentenceScore: number | null;
      avgParagraphScore: number | null;
      avgResponseSpeedMs: number | null;
      hintDependencyRate: number | null;
      learningConsistency: number | null;
    } | null,
  ): LearningProfileView {
    if (!profile) {
      return {
        calibrated: false,
        calibrationWordsCompleted: 0,
        currentDifficulty: 'BEGINNER',
        recommendedDifficulty: null,
        recommendedDifficultyAcceptedAt: null,
        initialCefrEstimate: null,
        weaknessAreas: [],
        avgGuessAccuracy: 0,
        avgSentenceScore: 0,
        avgParagraphScore: 0,
        avgResponseSpeedMs: 0,
        hintDependencyRate: 0,
        learningConsistency: 0,
      };
    }
    return {
      calibrated: profile.calibrated,
      calibrationWordsCompleted: profile.calibrationWordsCompleted,
      currentDifficulty: profile.currentDifficulty,
      recommendedDifficulty: profile.recommendedDifficulty,
      recommendedDifficultyAcceptedAt: profile.recommendedDifficultyAcceptedAt,
      initialCefrEstimate: profile.initialCefrEstimate,
      weaknessAreas: profile.weaknessAreas,
      avgGuessAccuracy: profile.avgGuessAccuracy ?? 0,
      avgSentenceScore: profile.avgSentenceScore ?? 0,
      avgParagraphScore: profile.avgParagraphScore ?? 0,
      avgResponseSpeedMs: profile.avgResponseSpeedMs ?? 0,
      hintDependencyRate: profile.hintDependencyRate ?? 0,
      learningConsistency: profile.learningConsistency ?? 0,
    };
  }
}
