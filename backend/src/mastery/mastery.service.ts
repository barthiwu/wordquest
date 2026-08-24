import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { AchievementService } from '../achievement/achievement.service';
import { AliService } from '../ali/ali.service';
import { gameplayRules } from '../config/gameplay-rules';
import { nextReviewDueAt } from '../vocabulary/review-schedule';
import { averageScoreDimensions } from '../common/score-average';

export type MasteryLevel = 'NEW' | 'RECOGNIZING' | 'RECALLING' | 'STRONG' | 'MASTERED';

const LEVEL_LADDER: MasteryLevel[] = ['NEW', 'RECOGNIZING', 'RECALLING', 'STRONG', 'MASTERED'];

/** Either the real PrismaService or the `tx` handle inside a $transaction callback — same query surface either way. */
type Db = PrismaService | Prisma.TransactionClient;

export interface RecordAnswerResult {
  level: MasteryLevel;
  justMastered: boolean;
}

export interface SkillAreaScores {
  guessScore: number;
  sentenceScore: number;
  paragraphScore: number;
}

export interface MasteryDetail extends SkillAreaScores {
  wordId: string;
  currentLevel: MasteryLevel;
  masteryScore: number;
  timesPresented: number;
  timesCorrect: number;
  timesIncorrect: number;
  currentCorrectStreak: number;
  lastPresentedAt: Date | null;
  lastCorrectAt: Date | null;
  masteredAt: Date | null;
  nextReviewDueAt: Date | null;
}

/**
 * Owns the (user, word) Mastery relationship — Vocabulary Engine spec §4
 * (PlayerWordMastery) and §16 (NEW → RECOGNIZING → RECALLING → STRONG
 * ladder), PLUS the single MASTERED gate (V1 Remaining Systems Spec §4:
 * "the Mastery Engine becomes the single source of truth").
 *
 * Two things are deliberately separate now:
 *  - `currentLevel` NEW..STRONG is driven by the player's own
 *    consecutive-correct GUESS streak on that word (unchanged from
 *    before) — a display/progress ladder, not a reward gate.
 *  - MASTERED is a single gate, checked by `applyMasteryGate` every time
 *    any of the three skill-area scores changes: guessScore, sentenceScore,
 *    paragraphScore must ALL be >= the threshold (75) at once (Correction
 *    & Completion Spec §2: Speaking/Pronunciation removed from the gate
 *    entirely in V1). A streak alone can never cross it — Boss Battle and
 *    Word in the Wild answers (binary correct/incorrect only) feed
 *    guessScore same as any other guess, but the other two areas only
 *    ever get evidence from a completed Daily Quest word cycle
 *    (Sentence/Paragraph stages), so in practice only that full cycle can
 *    complete mastery — exactly what the spec asks for.
 *
 * recordAnswer/evaluateWordCycleCompletion take an optional trailing `db`
 * for the same reason ProgressionService's methods do — pass the `tx`
 * from a `prisma.$transaction(async (tx) => ...)` callback when this
 * needs to be atomic with the XP award / attempt update happening
 * alongside it.
 */
@Injectable()
export class MasteryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProgressionService,
    private readonly achievements: AchievementService,
    private readonly ali: AliService,
  ) {}

  async recordAnswer(
    userId: string,
    wordId: string,
    isCorrect: boolean,
    db: Db = this.prisma,
  ): Promise<RecordAnswerResult> {
    const { scoreDeltaCorrect, scoreDeltaIncorrect } = gameplayRules.mastery;

    const existing = await db.mastery.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    const wasAlreadyMastered = existing?.currentLevel === 'MASTERED';
    const currentScore = existing?.masteryScore ?? 0;
    const currentStreak = existing?.currentCorrectStreak ?? 0;
    const currentLevel: MasteryLevel = existing?.currentLevel ?? 'NEW';

    const newStreak = isCorrect ? currentStreak + 1 : 0;
    const newScore = this.clamp(
      currentScore + (isCorrect ? scoreDeltaCorrect : scoreDeltaIncorrect),
      0,
      100,
    );
    // NEW..STRONG only — levelForStreak never returns MASTERED anymore.
    // A miss demotes by one rung, same as before, including down from a
    // MASTERED reached via the skill-area gate (see class doc comment).
    const streakLevel = isCorrect ? this.levelForStreak(newStreak) : this.demote(currentLevel);
    const newGuessScore = this.computeGuessScore(existing?.guessScore ?? 0, isCorrect);

    const now = new Date();
    // A correct guess is positive evidence, so re-check the MASTERED gate
    // with the freshly-updated guessScore — the other four areas only
    // ever get evidence from a Daily Quest word cycle, so this can only
    // actually complete mastery for a word that's already cleared them.
    // A miss never promotes (streakLevel already reflects the demotion).
    const newLevel = isCorrect
      ? this.applyMasteryGate(streakLevel, {
          guessScore: newGuessScore,
          sentenceScore: existing?.sentenceScore ?? 0,
          paragraphScore: existing?.paragraphScore ?? 0,
        })
      : streakLevel;

    await db.mastery.upsert({
      where: { userId_wordId: { userId, wordId } },
      create: {
        userId,
        wordId,
        currentLevel: newLevel,
        timesPresented: 1,
        timesCorrect: isCorrect ? 1 : 0,
        timesIncorrect: isCorrect ? 0 : 1,
        masteryScore: newScore,
        currentCorrectStreak: newStreak,
        guessScore: newGuessScore,
        lastPresentedAt: now,
        lastCorrectAt: isCorrect ? now : null,
        lastReviewedAt: now,
        nextReviewDueAt: nextReviewDueAt(newLevel, now),
        masteredAt: newLevel === 'MASTERED' ? now : null,
      },
      update: {
        currentLevel: newLevel,
        timesPresented: { increment: 1 },
        timesCorrect: { increment: isCorrect ? 1 : 0 },
        timesIncorrect: { increment: isCorrect ? 0 : 1 },
        masteryScore: newScore,
        currentCorrectStreak: newStreak,
        guessScore: newGuessScore,
        lastPresentedAt: now,
        lastReviewedAt: now,
        nextReviewDueAt: nextReviewDueAt(newLevel, now),
        ...(isCorrect ? { lastCorrectAt: now } : {}),
        ...(newLevel === 'MASTERED' && !wasAlreadyMastered ? { masteredAt: now } : {}),
      },
    });

    const justMastered = newLevel === 'MASTERED' && !wasAlreadyMastered;
    const justDemotedFromMastered = wasAlreadyMastered && newLevel !== 'MASTERED';

    let masteredWordsCount: number;

    if (justMastered) {
      masteredWordsCount = await this.onWordMastered(userId, wordId, db);
    } else if (justDemotedFromMastered) {
      // Keeps masteredWordsCount an honest "currently mastered" count,
      // not "ever mastered" — a word that's since been missed enough to
      // fall out of MASTERED shouldn't still count toward it. No Journey
      // check needed here — Journey only ever advances forward, and a
      // decrement can never newly satisfy a threshold, only move away
      // from one.
      const updated = await db.userProgression.update({
        where: { userId },
        data: { masteredWordsCount: { decrement: 1 } },
      });
      masteredWordsCount = updated.masteredWordsCount;
    } else {
      const current = await db.userProgression.findUniqueOrThrow({
        where: { userId },
        select: { masteredWordsCount: true },
      });
      masteredWordsCount = current.masteredWordsCount;
    }

    // Discovery/Mastery achievement thresholds can be crossed by ANY
    // answer, not just a mastery transition (e.g. "Getting Started" —
    // 10 total guesses — has nothing to do with mastering a word).
    await this.achievements.checkDiscoveryAndMastery(userId, masteredWordsCount, db);

    return { level: newLevel, justMastered };
  }

  /**
   * Updates the two AI-scored skill areas from a completed Daily Quest
   * word cycle (Sentence/Paragraph), then re-checks the single MASTERED
   * gate (Correction & Completion Spec §2).
   *
   * Only ever promotes, never demotes — a so-so cycle isn't evidence the
   * player has gotten WORSE at a word they may already be doing fine on
   * via repeated guessing; it just leaves the level exactly where the
   * guess-streak ladder already has it.
   */
  async evaluateWordCycleCompletion(
    userId: string,
    wordId: string,
    sentenceScores: Record<string, number>,
    paragraphScores: Record<string, number>,
    db: Db = this.prisma,
  ): Promise<{ masteredViaSkillCheck: boolean }> {
    const sentenceScore = averageScoreDimensions(sentenceScores);
    const paragraphScore = averageScoreDimensions(paragraphScores);

    const existing = await db.mastery.findUnique({ where: { userId_wordId: { userId, wordId } } });
    const wasAlreadyMastered = existing?.currentLevel === 'MASTERED';
    const currentLevel: MasteryLevel = existing?.currentLevel ?? 'NEW';

    const newLevel = this.applyMasteryGate(currentLevel, {
      guessScore: existing?.guessScore ?? 0,
      sentenceScore,
      paragraphScore,
    });

    const now = new Date();
    await db.mastery.upsert({
      where: { userId_wordId: { userId, wordId } },
      create: {
        userId,
        wordId,
        currentLevel: newLevel,
        masteryScore: existing?.masteryScore ?? 0,
        timesPresented: 1,
        timesCorrect: 0,
        timesIncorrect: 0,
        sentenceScore,
        paragraphScore,
        lastPresentedAt: now,
        lastReviewedAt: now,
        nextReviewDueAt: nextReviewDueAt(newLevel, now),
        masteredAt: newLevel === 'MASTERED' ? now : null,
      },
      update: {
        currentLevel: newLevel,
        sentenceScore,
        paragraphScore,
        lastReviewedAt: now,
        nextReviewDueAt: nextReviewDueAt(newLevel, now),
        ...(newLevel === 'MASTERED' && !wasAlreadyMastered ? { masteredAt: now } : {}),
      },
    });

    const masteredViaSkillCheck = newLevel === 'MASTERED' && !wasAlreadyMastered;
    if (masteredViaSkillCheck) {
      const masteredWordsCount = await this.onWordMastered(userId, wordId, db);
      await this.achievements.checkDiscoveryAndMastery(userId, masteredWordsCount, db);
    }

    return { masteredViaSkillCheck };
  }

  /**
   * The omission engine needs the player's current level on THIS word
   * before it can generate a challenge (spec: "Backend reads word
   * difficulty + player's mastery" happens before "Omission Engine
   * generates challenge"). QuestsService goes through here rather than
   * reading Mastery off Prisma directly, same as it does for recordAnswer.
   */
  async getLevel(userId: string, wordId: string): Promise<MasteryLevel> {
    const existing = await this.prisma.mastery.findUnique({
      where: { userId_wordId: { userId, wordId } },
      select: { currentLevel: true },
    });
    return (existing?.currentLevel as MasteryLevel | undefined) ?? 'NEW';
  }

  /**
   * Spec v2 §19: GET /users/me/words/:wordId/mastery. The full picture
   * for one word — not just the level getLevel() returns — for a player
   * checking their own progress on a specific word directly, rather
   * than only ever seeing it folded into an aggregate like Skill Radar.
   */
  async getDetail(userId: string, wordId: string): Promise<MasteryDetail> {
    const existing = await this.prisma.mastery.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    if (!existing) {
      return {
        wordId,
        currentLevel: 'NEW',
        masteryScore: 0,
        timesPresented: 0,
        timesCorrect: 0,
        timesIncorrect: 0,
        currentCorrectStreak: 0,
        guessScore: 0,
        sentenceScore: 0,
        paragraphScore: 0,
        lastPresentedAt: null,
        lastCorrectAt: null,
        masteredAt: null,
        nextReviewDueAt: null,
      };
    }

    return {
      wordId,
      currentLevel: existing.currentLevel as MasteryLevel,
      masteryScore: existing.masteryScore,
      timesPresented: existing.timesPresented,
      timesCorrect: existing.timesCorrect,
      timesIncorrect: existing.timesIncorrect,
      currentCorrectStreak: existing.currentCorrectStreak,
      guessScore: existing.guessScore,
      sentenceScore: existing.sentenceScore,
      paragraphScore: existing.paragraphScore,
      lastPresentedAt: existing.lastPresentedAt,
      lastCorrectAt: existing.lastCorrectAt,
      masteredAt: existing.masteredAt,
      nextReviewDueAt: existing.nextReviewDueAt,
    };
  }

  /** NEW..STRONG only — see the class doc comment for why MASTERED is never returned here. */
  private levelForStreak(streak: number): MasteryLevel {
    const { streakForStrong, streakForRecalling, streakForRecognizing } = gameplayRules.mastery;
    if (streak >= streakForStrong) return 'STRONG';
    if (streak >= streakForRecalling) return 'RECALLING';
    if (streak >= streakForRecognizing) return 'RECOGNIZING';
    return 'NEW';
  }

  /**
   * The single MASTERED gate (Correction & Completion Spec §2): promotes
   * to MASTERED only when every one of the three skill areas is at or
   * above skillAreaMasteryThresholdPercent — otherwise returns
   * `fallbackLevel` unchanged. Deliberately one-directional (only ever
   * upgrades to MASTERED, never downgrades away from it) — demotion off
   * MASTERED is handled separately, by a guess miss's ordinary
   * one-rung demote().
   */
  private applyMasteryGate(fallbackLevel: MasteryLevel, scores: SkillAreaScores): MasteryLevel {
    const { skillAreaMasteryThresholdPercent } = gameplayRules.mastery;
    const allAreasClear = [scores.guessScore, scores.sentenceScore, scores.paragraphScore].every(
      (score) => score >= skillAreaMasteryThresholdPercent,
    );
    return allAreasClear ? 'MASTERED' : fallbackLevel;
  }

  /**
   * guessScore (one of the five MASTERED-gate areas) — a recency-weighted
   * accuracy estimate for this word's Guess stage specifically. An EMA
   * rather than a flat lifetime average so a player who struggled with a
   * word long ago but has since gotten it right repeatedly isn't held
   * back by history; response-speed/hint-dependency are tracked
   * cross-word on LearningProfile instead of folded in here, so this
   * stays a clean, single-signal per-word score.
   */
  private computeGuessScore(currentGuessScore: number, isCorrect: boolean): number {
    const target = isCorrect ? 100 : 0;
    const smoothing = 0.3; // how much a single new answer moves the average
    return Math.round(
      this.clamp(currentGuessScore + (target - currentGuessScore) * smoothing, 0, 100),
    );
  }

  /**
   * Shared by both paths to MASTERED (the streak-based one in
   * recordAnswer, and the skill-area one in evaluateWordCycleCompletion)
   * — masteredWordsCount, Journey/CEFR re-checks, and the ALI reaction
   * are the same regardless of which path got a word here.
   */
  private async onWordMastered(userId: string, wordId: string, db: Db): Promise<number> {
    const updated = await db.userProgression.update({
      where: { userId },
      data: { masteredWordsCount: { increment: 1 } },
    });
    // masteredWordsCount just went up — the only direction that can
    // newly clear a Journey gate whose Level side was already satisfied
    // (see ProgressionService.checkJourneyAdvancement).
    await this.progression.checkJourneyAdvancement(
      userId,
      updated.level,
      updated.journeyStage,
      updated.masteredWordsCount,
      db,
    );
    // checkJourneyAdvancement only re-checks CEFR when the Journey stage
    // itself just advanced — masteredWordsCount can cross the CEFR
    // gate's 100-word condition without that happening (e.g. the player
    // is already well past City), so this needs its own call.
    await this.progression.checkCefrEligibility(userId, db);

    const word = await db.word.findUnique({ where: { id: wordId }, select: { word: true } });
    this.ali.reactFireAndForget(userId, {
      type: 'MASTERY_EVENT',
      journeyStage: updated.journeyStage,
      context: { wordMastered: word?.word, totalMastered: updated.masteredWordsCount },
    });

    return updated.masteredWordsCount;
  }

  private demote(level: MasteryLevel): MasteryLevel {
    const index = LEVEL_LADDER.indexOf(level);
    return LEVEL_LADDER[Math.max(0, index - 1)];
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
