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

/**
 * What applyMasteryGate actually gates on — deliberately NOT the same
 * shape as SkillAreaScores (which stays a display DTO with a numeric
 * guessScore). The guess dimension of the gate is a one-time pass, not
 * a threshold on a number: see applyMasteryGate's doc comment.
 */
interface MasteryGateInputs {
  hasGuessedCorrectly: boolean;
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

export interface MasteryListItem extends SkillAreaScores {
  wordId: string;
  word: string;
  currentLevel: MasteryLevel;
  masteryScore: number;
  timesPresented: number;
  timesCorrect: number;
  timesIncorrect: number;
  lastPresentedAt: Date | null;
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
 *    any of the three skill areas changes. Guess is a one-time pass: the
 *    first correct guess ever (`timesCorrect > 0`) satisfies it forever
 *    — re-guessing a word already met is trivial (you've seen the
 *    omission pattern before), so it isn't something a player can
 *    action beyond that first success, and it must not gate mastery
 *    behind a moving average they have no real way to move. Sentence
 *    and paragraph must each be >= the threshold (75), but the score
 *    STORED for each is a high-water mark — a later attempt that scores
 *    lower never overwrites a better one already on file (Speaking/
 *    Pronunciation stay removed from the gate entirely, Correction &
 *    Completion Spec §2). Once all three are satisfied, MASTERED is
 *    permanent for that word — nothing (a later guess miss, a weaker
 *    rewrite) ever takes it away again; only the guess-streak ladder
 *    above it continues to move on ordinary NEW..STRONG traffic.
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
    // A miss demotes by one rung, same as before -- EXCEPT down from
    // MASTERED, which is now permanent (see class doc comment): a word
    // that's already cleared the gate keeps its level regardless of a
    // later guess miss.
    const streakLevel = isCorrect
      ? this.levelForStreak(newStreak)
      : currentLevel === 'MASTERED'
        ? currentLevel
        : this.demote(currentLevel);
    const newGuessScore = this.computeGuessScore(existing?.guessScore ?? 0, isCorrect);
    // The guess dimension of the MASTERED gate: a one-time pass, not the
    // rolling guessScore above (which stays purely informational/display
    // now) — satisfied the moment the player has ever gotten this word's
    // guess right, including right now.
    const hasGuessedCorrectly = (existing?.timesCorrect ?? 0) > 0 || isCorrect;

    const now = new Date();
    // A correct guess is positive evidence, so re-check the MASTERED gate
    // — the other two areas only ever get evidence from a Daily Quest
    // word cycle (or Practice), so this can only actually complete
    // mastery for a word that's already cleared them. A miss never
    // promotes (streakLevel already reflects the demotion, if any).
    const newLevel = isCorrect
      ? this.applyMasteryGate(streakLevel, {
          hasGuessedCorrectly,
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

    // MASTERED is permanent now (see class doc comment), so there is no
    // "just demoted from MASTERED" case any more — a word only ever
    // joins masteredWordsCount, never leaves it once it has.
    const justMastered = newLevel === 'MASTERED' && !wasAlreadyMastered;

    let masteredWordsCount: number;

    if (justMastered) {
      masteredWordsCount = await this.onWordMastered(userId, wordId, db);
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
   * guess-streak ladder already has it. The stored sentence/paragraph
   * scores are each a high-water mark for the same reason — a weaker
   * rewrite later doesn't erase a stronger one already on file, it just
   * doesn't move the number. That's why this reads `existing` before
   * computing them, even though it isn't gating anything by itself.
   */
  async evaluateWordCycleCompletion(
    userId: string,
    wordId: string,
    sentenceScores: Record<string, number>,
    paragraphScores: Record<string, number>,
    db: Db = this.prisma,
  ): Promise<{ masteredViaSkillCheck: boolean }> {
    const existing = await db.mastery.findUnique({ where: { userId_wordId: { userId, wordId } } });
    const wasAlreadyMastered = existing?.currentLevel === 'MASTERED';
    const currentLevel: MasteryLevel = existing?.currentLevel ?? 'NEW';

    const sentenceScore = Math.max(existing?.sentenceScore ?? 0, averageScoreDimensions(sentenceScores));
    const paragraphScore = Math.max(existing?.paragraphScore ?? 0, averageScoreDimensions(paragraphScores));
    const hasGuessedCorrectly = (existing?.timesCorrect ?? 0) > 0;

    const newLevel = this.applyMasteryGate(currentLevel, {
      hasGuessedCorrectly,
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
   * Practice-mode counterpart to evaluateWordCycleCompletion, for the
   * Profile "My Words" review flow (Correction & Completion Spec
   * follow-up: "just a way to improve mastery... no XP or rewards").
   * Unlike evaluateWordCycleCompletion -- which always receives BOTH
   * skill areas at once from a just-finished Daily Quest word cycle and
   * overwrites both fields -- practice reviews one area at a time, so
   * this updates ONLY the given area and leaves the other exactly where
   * it was. Reuses the same MASTERED gate and onWordMastered path
   * (masteredWordsCount, Journey/CEFR-eligibility re-check, achievements)
   * so a word mastered via practice counts exactly like one mastered via
   * a live quest -- the only thing genuinely different about practice is
   * that nothing here ever calls ProgressionService.awardXp.
   *
   * Returns both `attemptScore` (this submission's own composite, for
   * feedback on exactly what the player just wrote) and `bestScore`
   * (what actually got stored — the higher of this attempt and whatever
   * was on file already). They differ only when a player re-practices a
   * word and writes something weaker than their best on record; the
   * stored score never moves backward.
   */
  async recordSkillAreaPractice(
    userId: string,
    wordId: string,
    area: 'sentence' | 'paragraph',
    scores: Record<string, number>,
    db: Db = this.prisma,
  ): Promise<{ attemptScore: number; bestScore: number; level: MasteryLevel; justMastered: boolean }> {
    const attemptScore = averageScoreDimensions(scores);

    const existing = await db.mastery.findUnique({ where: { userId_wordId: { userId, wordId } } });
    const wasAlreadyMastered = existing?.currentLevel === 'MASTERED';
    const currentLevel: MasteryLevel = existing?.currentLevel ?? 'NEW';

    const hasGuessedCorrectly = (existing?.timesCorrect ?? 0) > 0;
    const existingSentenceScore = existing?.sentenceScore ?? 0;
    const existingParagraphScore = existing?.paragraphScore ?? 0;
    const bestScore =
      area === 'sentence'
        ? Math.max(existingSentenceScore, attemptScore)
        : Math.max(existingParagraphScore, attemptScore);
    const sentenceScore = area === 'sentence' ? bestScore : existingSentenceScore;
    const paragraphScore = area === 'paragraph' ? bestScore : existingParagraphScore;

    const newLevel = this.applyMasteryGate(currentLevel, { hasGuessedCorrectly, sentenceScore, paragraphScore });

    const now = new Date();
    const areaUpdate = area === 'sentence' ? { sentenceScore } : { paragraphScore };

    await db.mastery.upsert({
      where: { userId_wordId: { userId, wordId } },
      create: {
        userId,
        wordId,
        currentLevel: newLevel,
        masteryScore: existing?.masteryScore ?? 0,
        timesPresented: existing?.timesPresented ?? 0,
        timesCorrect: existing?.timesCorrect ?? 0,
        timesIncorrect: existing?.timesIncorrect ?? 0,
        guessScore: existing?.guessScore ?? 0,
        sentenceScore,
        paragraphScore,
        lastReviewedAt: now,
        nextReviewDueAt: nextReviewDueAt(newLevel, now),
        masteredAt: newLevel === 'MASTERED' ? now : null,
      },
      update: {
        currentLevel: newLevel,
        ...areaUpdate,
        lastReviewedAt: now,
        nextReviewDueAt: nextReviewDueAt(newLevel, now),
        ...(newLevel === 'MASTERED' && !wasAlreadyMastered ? { masteredAt: now } : {}),
      },
    });

    const justMastered = newLevel === 'MASTERED' && !wasAlreadyMastered;
    if (justMastered) {
      const masteredWordsCount = await this.onWordMastered(userId, wordId, db);
      await this.achievements.checkDiscoveryAndMastery(userId, masteredWordsCount, db);
    }

    return { attemptScore, bestScore, level: newLevel, justMastered };
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
   * Every word the player has ever been presented with, together with
   * their current mastery on it — the "words I've guessed, and can I
   * improve on them" view requested for the Profile tab. Only words
   * with an actual Mastery row (i.e. presented at least once) show up
   * here; the full 500-word vocabulary a player hasn't touched yet
   * isn't "theirs" to review. Most-recently-presented first, so a
   * player picking this up mid-session sees what they were just
   * working on before older words.
   */
  async listForUser(userId: string): Promise<MasteryListItem[]> {
    const rows = await this.prisma.mastery.findMany({
      where: { userId },
      orderBy: [{ lastPresentedAt: 'desc' }],
      include: { word: { select: { word: true } } },
    });

    return rows.map((row) => ({
      wordId: row.wordId,
      word: row.word.word,
      currentLevel: row.currentLevel as MasteryLevel,
      masteryScore: row.masteryScore,
      guessScore: row.guessScore,
      sentenceScore: row.sentenceScore,
      paragraphScore: row.paragraphScore,
      timesPresented: row.timesPresented,
      timesCorrect: row.timesCorrect,
      timesIncorrect: row.timesIncorrect,
      lastPresentedAt: row.lastPresentedAt,
      masteredAt: row.masteredAt,
      nextReviewDueAt: row.nextReviewDueAt,
    }));
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
   * The single MASTERED gate (Correction & Completion Spec §2, amended):
   * promotes to MASTERED only when the guess dimension has EVER been
   * passed (`hasGuessedCorrectly` — a one-time pass, not a threshold)
   * AND both sentenceScore and paragraphScore are at or above
   * skillAreaMasteryThresholdPercent — otherwise returns `fallbackLevel`
   * unchanged. Deliberately one-directional (only ever upgrades to
   * MASTERED, never downgrades away from it): once a word clears this
   * gate it stays MASTERED for good — see recordAnswer, which no longer
   * demotes a MASTERED word on a later guess miss either.
   */
  private applyMasteryGate(fallbackLevel: MasteryLevel, inputs: MasteryGateInputs): MasteryLevel {
    const { skillAreaMasteryThresholdPercent } = gameplayRules.mastery;
    const allAreasClear =
      inputs.hasGuessedCorrectly &&
      inputs.sentenceScore >= skillAreaMasteryThresholdPercent &&
      inputs.paragraphScore >= skillAreaMasteryThresholdPercent;
    return allAreasClear ? 'MASTERED' : fallbackLevel;
  }

  /**
   * guessScore — a recency-weighted accuracy estimate for this word's
   * Guess stage, kept purely for display/analytics now (Skill Radar,
   * Passport, Practice's read-only Guess line). It no longer gates
   * MASTERED (see applyMasteryGate) — guess mastery is a one-time pass,
   * since re-guessing a word already met is trivial rather than a real
   * test. An EMA rather than a flat lifetime average so a player who
   * struggled with a word long ago but has since gotten it right
   * repeatedly isn't held back by history; response-speed/hint-dependency
   * are tracked cross-word on LearningProfile instead of folded in here,
   * so this stays a clean, single-signal per-word score.
   */
  private computeGuessScore(currentGuessScore: number, isCorrect: boolean): number {
    const target = isCorrect ? 100 : 0;
    const smoothing = 0.3; // how much a single new answer moves the average
    return Math.round(
      this.clamp(currentGuessScore + (target - currentGuessScore) * smoothing, 0, 100),
    );
  }

  /**
   * Re-derives MASTERED purely from what's already stored on the row —
   * no new evidence comes in here, unlike recordAnswer/
   * evaluateWordCycleCompletion/recordSkillAreaPractice. Exists for the
   * one-time backfill after the Sept 2026 gate change (Correction &
   * Completion Spec amendment: guess went from a guessScore threshold to
   * a one-time pass; sentence/paragraph went from overwrite to a
   * high-water mark) — a word sitting on data that already satisfies the
   * NEW gate, but was evaluated under the OLD one, would otherwise sit
   * un-promoted until its next live interaction. See
   * scripts/backfill-mastery-gate.ts, the only caller. Promotion-only,
   * same as applyMasteryGate itself — can never demote anything, and is
   * a no-op on a word that's already MASTERED or doesn't yet qualify.
   */
  async recheckGate(userId: string, wordId: string, db: Db = this.prisma): Promise<{ justMastered: boolean }> {
    const existing = await db.mastery.findUnique({ where: { userId_wordId: { userId, wordId } } });
    if (!existing || existing.currentLevel === 'MASTERED') return { justMastered: false };

    const hasGuessedCorrectly = existing.timesCorrect > 0;
    const newLevel = this.applyMasteryGate(existing.currentLevel as MasteryLevel, {
      hasGuessedCorrectly,
      sentenceScore: existing.sentenceScore,
      paragraphScore: existing.paragraphScore,
    });
    if (newLevel !== 'MASTERED') return { justMastered: false };

    const now = new Date();
    await db.mastery.update({
      where: { userId_wordId: { userId, wordId } },
      data: { currentLevel: 'MASTERED', masteredAt: now },
    });

    const masteredWordsCount = await this.onWordMastered(userId, wordId, db);
    await this.achievements.checkDiscoveryAndMastery(userId, masteredWordsCount, db);

    return { justMastered: true };
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
