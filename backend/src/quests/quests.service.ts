import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WordStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../vocabulary/words.service';
import { MasteryService, type MasteryLevel } from '../mastery/mastery.service';
import { ProgressionService } from '../progression/progression.service';
import { AchievementService } from '../achievement/achievement.service';
import {
  SentenceEvaluationService,
  type SentenceScores,
} from '../sentence/sentence-evaluation.service';
import {
  ParagraphEvaluationService,
  type ParagraphScores,
} from '../paragraph/paragraph-evaluation.service';
import {
  WordInTheWildService,
  type MissionView,
} from '../word-in-the-wild/word-in-the-wild.service';
import { generateOmissionChallenge } from '../vocabulary/omission-engine';
import { gameplayRules, computeGuessXp } from '../config/gameplay-rules';
import { LearningProfileService } from '../learning-profile/learning-profile.service';
import { averageScoreDimensions } from '../common/score-average';
import { AliService } from '../ali/ali.service';
import { quickAliReaction } from '../ali/ali-quick-reactions';

/** Either the real PrismaService or the `tx` handle inside a $transaction callback — same query surface either way. */
type Db = PrismaService | Prisma.TransactionClient;

export interface ChallengeView {
  questAttemptId: string;
  wordIndex: number;
  wordCount: number;
  /** e.g. "C O M P _ S S I O N" — the blanked word to reconstruct. */
  displayPattern: string;
  /** Zero-based indexes into the word that are blanked — lets the client place input boxes without re-parsing displayPattern. */
  missingIndexes: number[];
  wordLength: number;
  /** The contextual clue shown alongside the blanked word (spec §13). exampleSentence is deliberately NOT sent here — it usually contains the word itself, which would give the answer away. */
  definition: string;
  partOfSpeech: string;
}

export interface QuestCatalogEntry {
  key: string;
  title: string;
  description: string;
  windowStartHour: number | null;
  windowEndHour: number | null;
}

export interface UnderstandingContent {
  word: string;
  definition: string;
  partOfSpeech: string;
  pronunciation: string | null;
  phoneticRepresentation: string | null;
  synonyms: string[];
  exampleSentence: string;
}

export interface AnswerResult {
  isCorrect: boolean;
  /** True when the 2-minute Guess timer had already expired — isCorrect is meaningless in this case, the answer was never evaluated. */
  timedOut: boolean;
  correctAnswer: string;
  xpAwarded: number;
  masteryLevel: MasteryLevel;
  /** Non-null only when isCorrect — the Understanding stage content the player now transitions to (spec §3.10: Guess -> Understanding, not straight to quest completion). */
  understanding: UnderstandingContent | null;
  /**
   * A lightweight, non-AI canned reaction (V21 §6) reacting to this
   * specific correct/wrong answer — distinct from AliService's
   * AI-generated milestone reactions, kept cost-flat regardless of guess
   * volume (see ali-quick-reactions.ts). Null only when timedOut, since
   * no answer was actually evaluated in that case.
   */
  aliQuickReaction: string | null;
}

export interface HintResult {
  hint: string | null;
  hintsUsed: number;
  hintsRemaining: number;
}

export interface SynonymResult {
  synonym: string | null;
  synonymsUsed: number;
  synonymsRemaining: number;
}

export interface LetterRevealResult {
  displayPattern: string;
  missingIndexes: number[];
  lettersRevealed: number;
}

export interface SentenceResult {
  scores: SentenceScores;
  xpAwarded: number;
  whatWentWell: string;
  whatNeedsImprovement: string;
  betterVersion: string | null;
  nextAction: string;
}

export interface ParagraphResult {
  scores: ParagraphScores;
  xpAwarded: number;
  estimatedProficiency: string;
  whatWentWell: string;
  whatNeedsImprovement: string;
  suggestedRevision: string | null;
  nextAction: string;
}

export interface WordCompletionResult {
  xpAwarded: number;
  glyphAwarded: number;
  correctCount: number;
  totalCount: number;
  /** True exactly once, the call after which the player's 3-word Initial Calibration finished — client should surface the recommendation. */
  calibrationJustCompleted: boolean;
}

/**
 * Orchestrates the Quest Engine flow from §31 and the Vocabulary Engine
 * spec's engineering objective (§23): select word → read word difficulty
 * + player mastery → omission engine generates challenge → present →
 * evaluate → record attempt → update mastery → award XP → continue.
 *
 * This service never touches XP/Glyph/streak fields directly — it always
 * goes through ProgressionService, and never touches Mastery fields
 * directly — it always goes through MasteryService. That's the whole
 * point of those services existing.
 */
@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly words: WordsService,
    private readonly mastery: MasteryService,
    private readonly progression: ProgressionService,
    private readonly achievements: AchievementService,
    private readonly sentenceEvaluation: SentenceEvaluationService,
    private readonly paragraphEvaluation: ParagraphEvaluationService,
    private readonly wordInTheWild: WordInTheWildService,
    private readonly learningProfile: LearningProfileService,
    private readonly ali: AliService,
  ) {}

  /**
   * The catalog for the Quest tab — window hours included so the client
   * can show accurate lock state without hardcoding a copy of the seed
   * data. Doesn't include per-user status (in-progress/completed-today);
   * the client learns that by attempting to start, same as the gating
   * logic in startTimedQuest itself.
   */
  async listQuests(): Promise<QuestCatalogEntry[]> {
    const quests = await this.prisma.quest.findMany({
      where: { isActive: true },
      orderBy: { windowStartHour: 'asc' },
    });
    return quests.map(
      (q: {
        key: string;
        title: string;
        description: string;
        windowStartHour: number | null;
        windowEndHour: number | null;
      }) => ({
        key: q.key,
        title: q.title,
        description: q.description,
        windowStartHour: q.windowStartHour,
        windowEndHour: q.windowEndHour,
      }),
    );
  }

  /**
   * Resumes an in-progress attempt for this quest, or starts a new one —
   * gated by the player's own local time (spec: quests unlock at a
   * player-local hour, never a ceiling, never re-locked once unlocked).
   *
   * Gating order matters: an already-in-progress attempt always resumes
   * regardless of the current hour or date — once started, a quest is
   * never taken away mid-play. Only a genuinely NEW attempt is gated.
   */
  async startTimedQuest(
    userId: string,
    questKey: string,
    localDate: string,
    localHour: number,
  ): Promise<ChallengeView> {
    const quest = await this.prisma.quest.findUnique({ where: { key: questKey } });
    if (!quest || !quest.isActive) {
      throw new NotFoundException(`${questKey} is not currently available`);
    }

    const inProgress = await this.prisma.questAttempt.findFirst({
      where: { userId, questId: quest.id, status: 'IN_PROGRESS' },
    });
    if (inProgress) {
      return this.buildChallengeView(
        inProgress.id,
        userId,
        inProgress.wordIds,
        inProgress.currentIndex,
      );
    }

    const completedToday = await this.prisma.questAttempt.findFirst({
      where: { userId, questId: quest.id, status: 'COMPLETED', localDate },
    });
    if (completedToday) {
      throw new BadRequestException(`You've already completed today's ${quest.title}.`);
    }

    if (quest.windowStartHour !== null && localHour < quest.windowStartHour) {
      throw new BadRequestException(
        `${quest.title} unlocks at ${String(quest.windowStartHour).padStart(2, '0')}:00.`,
      );
    }

    // V21 §3 "prevent unnecessary repetition": the SAME-quest in-progress
    // case is already handled above (`inProgress`, checked by questId) —
    // this covers a DIFFERENT quest window (e.g. noon-quest) picking a
    // word the player already has pending in an unrelated in-progress
    // attempt (e.g. morning-quest, still unanswered).
    const otherInProgress = await this.prisma.questAttempt.findMany({
      where: { userId, status: 'IN_PROGRESS' },
      select: { wordIds: true },
    });
    const excludeWordIds = otherInProgress.flatMap((a) => a.wordIds);

    const attempt = await this.prisma.questAttempt.create({
      data: {
        userId,
        questId: quest.id,
        localDate,
        wordIds: await this.words.pickWordsForQuest(
          userId,
          quest.wordCount || gameplayRules.quest.defaultWordCount,
          excludeWordIds,
        ),
        guessStartedAt: new Date(), // the 2-minute Guess timer starts now, server-side — never trust a client-reported start time
      },
    });

    return this.buildChallengeView(attempt.id, userId, attempt.wordIds, attempt.currentIndex);
  }

  async submitAnswer(
    userId: string,
    questAttemptId: string,
    rawAnswer: string,
  ): Promise<AnswerResult> {
    const attempt = await this.prisma.questAttempt.findUnique({ where: { id: questAttemptId } });
    if (!attempt) throw new NotFoundException('Quest attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException('Not your quest attempt');
    if (attempt.status !== 'IN_PROGRESS')
      throw new BadRequestException('Quest attempt is not in progress');
    if (attempt.wordStage !== 'GUESSING') {
      throw new BadRequestException('This word is not currently at the Guess stage');
    }

    const wordId = attempt.wordIds[attempt.currentIndex];
    const word = await this.prisma.word.findUniqueOrThrow({ where: { id: wordId } });

    // Server-authoritative 2-minute Guess timer (V1 Final Systems Spec
    // §3.3) — elapsed time is always computed from the server-recorded
    // guessStartedAt, never a client-reported value.
    const elapsedSeconds = attempt.guessStartedAt
      ? (Date.now() - attempt.guessStartedAt.getTime()) / 1000
      : Infinity; // no recorded start (shouldn't happen for a real attempt) is treated as already-expired, not as "unlimited time"

    if (elapsedSeconds > gameplayRules.guessStage.timerSeconds) {
      await this.prisma.questAttempt.update({
        where: { id: attempt.id },
        data: { status: 'ABANDONED' },
      });
      return {
        isCorrect: false,
        timedOut: true,
        correctAnswer: word.word,
        xpAwarded: 0,
        masteryLevel: await this.mastery.getLevel(userId, wordId),
        understanding: null,
        aliQuickReaction: null,
      };
    }

    // Compare against the precomputed normalizedWord (spec §19: case-
    // insensitive, whitespace-normalized), not the raw display word.
    const isCorrect = this.normalize(rawAnswer) === word.normalizedWord;

    if (!isCorrect) {
      // "Unlimited attempts until timeout" (spec §3.3) — a wrong guess
      // never ends the attempt or advances the word; it only accrues the
      // wrong-attempt penalty for whenever the player DOES get it right.
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.challengeAttempt.create({
          data: {
            userId,
            questAttemptId: attempt.id,
            wordId,
            challengeType: 'LETTER_OMISSION',
            displayPattern: attempt.currentDisplayPattern,
            missingIndexes: attempt.currentMissingIndexes,
            submittedAnswer: rawAnswer,
            isCorrect: false,
            xpAwarded: 0,
          },
        });
        await tx.questAttempt.update({
          where: { id: attempt.id },
          data: { wrongAttempts: { increment: 1 } },
        });
      });

      return {
        isCorrect: false,
        timedOut: false,
        correctAnswer: word.word,
        xpAwarded: 0,
        masteryLevel: await this.mastery.getLevel(userId, wordId),
        understanding: null,
        aliQuickReaction: quickAliReaction(false),
      };
    }

    const answerXp = computeGuessXp({
      elapsedSeconds,
      wrongAttempts: attempt.wrongAttempts,
      hintsUsed: attempt.hintsUsed,
      synonymsUsed: attempt.synonymsUsed,
      lettersRevealed: attempt.lettersRevealed,
    });

    // A correct Guess transitions to Understanding — it does NOT
    // complete the quest attempt (spec §3.10's state machine). Word
    // completion, the quest-completion bonus, streak recording, and the
    // Independent-Learning/Consistency achievement checks all move to
    // wherever the word actually finishes its full stage sequence
    // (Optional Wild -> WORD_COMPLETE), not here.
    const { masteryLevel } = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Claim first — before any mastery/XP/challenge-attempt side
        // effects — so a race loser aborts cleanly instead of duplicating
        // an award.
        await this.claimStageTransition(tx, attempt.id, 'GUESSING', {
          wordStage: 'UNDERSTANDING',
          xpAwarded: { increment: answerXp },
        });

        const { level: masteryLevel } = await this.mastery.recordAnswer(
          userId,
          wordId,
          isCorrect,
          tx,
        );

        await this.progression.awardXp(userId, answerXp, 'QUEST_ANSWER', 'quests', attempt.id, tx);

        await tx.challengeAttempt.create({
          data: {
            userId,
            questAttemptId: attempt.id,
            wordId,
            challengeType: 'LETTER_OMISSION',
            // Records exactly what was shown, not a freshly regenerated
            // pattern — the omission engine is intentionally non-
            // deterministic, so those would very likely differ (spec §17).
            displayPattern: attempt.currentDisplayPattern,
            missingIndexes: attempt.currentMissingIndexes,
            submittedAnswer: rawAnswer,
            isCorrect,
            xpAwarded: answerXp,
          },
        });

        return { masteryLevel };
      },
    );

    return {
      isCorrect: true,
      timedOut: false,
      correctAnswer: word.word,
      xpAwarded: answerXp,
      masteryLevel,
      understanding: {
        word: word.word,
        definition: word.definition,
        partOfSpeech: word.partOfSpeech,
        pronunciation: word.pronunciation,
        phoneticRepresentation: word.phoneticRepresentation,
        synonyms: word.synonyms,
        exampleSentence: word.exampleSentence,
      },
      aliQuickReaction: quickAliReaction(true),
    };
  }

  /** Understanding is a read/acknowledge stage, not a scored one (spec §3.10) — this just advances Understanding -> Sentence. */
  async acknowledgeUnderstanding(
    userId: string,
    questAttemptId: string,
  ): Promise<{ wordStage: string }> {
    const attempt = await this.loadInProgressAttempt(userId, questAttemptId, 'UNDERSTANDING');
    await this.prisma.questAttempt.update({
      where: { id: attempt.id },
      data: { wordStage: 'SENTENCE' },
    });
    return { wordStage: 'SENTENCE' };
  }

  /**
   * Sentence stage (spec §3.4): one AI evaluation call, 5 independent
   * dimension scores, up to 1,250 XP. Advances Sentence -> Paragraph on
   * completion — like Guess, this is scored and stage-advancing but
   * still does not complete the whole quest attempt.
   */
  async submitSentence(
    userId: string,
    questAttemptId: string,
    sentence: string,
  ): Promise<SentenceResult> {
    const attempt = await this.loadInProgressAttempt(userId, questAttemptId, 'SENTENCE');
    const word = await this.prisma.word.findUniqueOrThrow({
      where: { id: attempt.wordIds[attempt.currentIndex] },
    });

    const evaluation = await this.sentenceEvaluation.evaluate(
      word.word,
      word.definition,
      word.partOfSpeech,
      sentence,
    );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.claimStageTransition(tx, attempt.id, 'SENTENCE', {
        wordStage: 'PARAGRAPH',
        sentenceText: sentence,
        sentenceScores: evaluation.scores as unknown as Prisma.InputJsonValue,
        sentenceXpAwarded: evaluation.xpAwarded,
        xpAwarded: { increment: evaluation.xpAwarded },
      });

      await this.progression.awardXp(
        userId,
        evaluation.xpAwarded,
        'SENTENCE_STAGE',
        'quests',
        attempt.id,
        tx,
      );

      // Sentence quality is one of the five V19 Stabilization Spec §13
      // CEFR inputs — recompute the blended estimate here too, not only
      // after Paragraph (see updateUnifiedCefrEstimate's doc comment).
      await this.progression.updateUnifiedCefrEstimate(userId, tx);
    });

    return {
      scores: evaluation.scores,
      xpAwarded: evaluation.xpAwarded,
      whatWentWell: evaluation.whatWentWell,
      whatNeedsImprovement: evaluation.whatNeedsImprovement,
      betterVersion: evaluation.betterVersion,
      nextAction: evaluation.nextAction,
    };
  }

  /**
   * Paragraph stage (spec §3.5): 30-100 words, 5 AI-scored dimensions,
   * up to 1,750 XP. The word-count requirement is enforced server-side
   * BEFORE calling the AI — rejecting invalid input fast and for free,
   * rather than spending a real API call scoring something that was
   * never going to be accepted. Advances Paragraph -> Optional Wild —
   * the last scored stage before the word can complete (Speaking/
   * Pronunciation removed from V1 — Correction & Completion Spec §2).
   */
  async submitParagraph(
    userId: string,
    questAttemptId: string,
    paragraph: string,
  ): Promise<ParagraphResult> {
    const attempt = await this.loadInProgressAttempt(userId, questAttemptId, 'PARAGRAPH');

    const wordCount = this.countWords(paragraph);
    if (wordCount < 30 || wordCount > 100) {
      throw new BadRequestException(`Paragraph must be 30-100 words (got ${wordCount}).`);
    }

    const word = await this.prisma.word.findUniqueOrThrow({
      where: { id: attempt.wordIds[attempt.currentIndex] },
    });

    const evaluation = await this.paragraphEvaluation.evaluate(
      word.word,
      word.definition,
      word.partOfSpeech,
      paragraph,
    );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.claimStageTransition(tx, attempt.id, 'PARAGRAPH', {
        wordStage: 'OPTIONAL_WILD',
        paragraphText: paragraph,
        paragraphScores: evaluation.scores as unknown as Prisma.InputJsonValue,
        paragraphEstimatedProficiency: evaluation.estimatedProficiency,
        paragraphXpAwarded: evaluation.xpAwarded,
        xpAwarded: { increment: evaluation.xpAwarded },
      });

      await this.progression.awardXp(
        userId,
        evaluation.xpAwarded,
        'PARAGRAPH_STAGE',
        'quests',
        attempt.id,
        tx,
      );

      // The permanent CEFR evidence trail (V1 Remaining Systems Spec
      // §16/§28: CEFR history, not just a single rolling estimate) — this
      // submission's own raw AI judgment, kept independently of the
      // blended estimate below.
      await tx.cefrAssessment.create({
        data: {
          userId,
          source: 'PARAGRAPH_SUBMISSION',
          level: evaluation.estimatedProficiency,
          confidence: evaluation.confidence,
          dimensions: evaluation.scores as unknown as Prisma.InputJsonValue,
        },
      });

      // Recomputes the official rolling CEFR estimate from ALL five V19
      // Stabilization Spec §13 inputs (Vocabulary growth, Writing
      // ability, Sentence quality, Paragraph quality, Grammar/context
      // performance) — see ProgressionService.updateUnifiedCefrEstimate's
      // doc comment. Also called from submitSentence, since Sentence
      // quality is one of the five inputs and shouldn't only move the
      // needle when a Paragraph happens to follow it.
      await this.progression.updateUnifiedCefrEstimate(userId, tx);
    });

    return {
      scores: evaluation.scores,
      xpAwarded: evaluation.xpAwarded,
      estimatedProficiency: evaluation.estimatedProficiency,
      whatWentWell: evaluation.whatWentWell,
      whatNeedsImprovement: evaluation.whatNeedsImprovement,
      suggestedRevision: evaluation.suggestedRevision,
      nextAction: evaluation.nextAction,
    };
  }

  /**
   * Ties Word in the Wild's mission creation to THIS quest's specific
   * word (spec §3.7/§3.10: Optional Wild is a stage of a specific word,
   * not the freely-searched-any-word flow WordInTheWildService also
   * still supports as a standalone feature). Reuses createMission()
   * exactly as it already works — including its own daily cap, mission-
   * reuse, and reward logic — just supplying the word from the attempt
   * instead of letting the player pick one.
   */
  async createOptionalWildMission(userId: string, questAttemptId: string): Promise<MissionView> {
    const attempt = await this.loadInProgressAttempt(userId, questAttemptId, 'OPTIONAL_WILD');
    return this.wordInTheWild.createMission(userId, attempt.wordIds[attempt.currentIndex]);
  }

  /**
   * Optional Wild is skippable (spec §3.7: "optional application
   * activity") — this transitions Optional Wild -> Word Complete either
   * way, whether the player submitted Word in the Wild evidence for
   * this word or skipped it. This is where the quest attempt actually
   * completes: the quest.baseXp/baseGlyphs completion bonus, streak
   * recording, and the Consistency/Independent-Learning achievement
   * checks all moved here from the old Guess-stage completion logic
   * (see submitAnswer's doc comment) — a correct Guess is no longer
   * "the whole quest," this is.
   */
  async completeWord(userId: string, questAttemptId: string): Promise<WordCompletionResult> {
    const attempt = await this.loadInProgressAttempt(userId, questAttemptId, 'OPTIONAL_WILD');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const quest = await tx.quest.findUniqueOrThrow({ where: { id: attempt.questId } });
      const correctCount = await tx.challengeAttempt.count({
        where: { questAttemptId: attempt.id, isCorrect: true },
      });

      // Claim the completion first — before any award/streak/achievement
      // side effects — so a race loser (two concurrent completeWord calls
      // for the same attempt) aborts cleanly instead of double-awarding.
      await this.claimStageTransition(tx, attempt.id, 'OPTIONAL_WILD', {
        status: 'COMPLETED',
        wordStage: 'WORD_COMPLETE',
        completedAt: new Date(),
        xpAwarded: { increment: quest.baseXp },
        glyphAwarded: { increment: quest.baseGlyphs },
      });

      await this.progression.awardXp(
        userId,
        quest.baseXp,
        'QUEST_COMPLETION',
        'quests',
        attempt.id,
        tx,
      );
      await this.progression.awardGlyphs(
        userId,
        quest.baseGlyphs,
        'QUEST_COMPLETION',
        'quests',
        attempt.id,
        tx,
      );
      const { currentStreak } = await this.progression.recordDailyActivity(userId, tx);

      // Checked AFTER the attempt's own status is written to COMPLETED
      // above — checkIndependentLearning walks the player's most recent
      // completed QuestAttempt rows to measure the current independent
      // streak, and this quest wouldn't be in that window yet (or would
      // wrongly end the streak instead of extending it) if it ran before
      // this quest's own completion was persisted.
      await this.achievements.checkConsistency(userId, currentStreak, tx);
      await this.achievements.checkIndependentLearning(userId, tx);

      // The skill-area path to MASTERED (Correction & Completion Spec
      // §2) — evaluated only now that the full word cycle is genuinely
      // finished, using whatever Sentence/Paragraph actually scored.
      // Empty/missing score objects (a stage that was somehow skipped)
      // safely fail evaluateWordCycleCompletion's own "did every
      // dimension clear 75%" check rather than needing a separate guard
      // here.
      const wordId = attempt.wordIds[attempt.currentIndex];
      const sentenceScores = (attempt.sentenceScores as Record<string, number> | null) ?? {};
      const paragraphScores = (attempt.paragraphScores as Record<string, number> | null) ?? {};
      await this.mastery.evaluateWordCycleCompletion(
        userId,
        wordId,
        sentenceScores,
        paragraphScores,
        tx,
      );

      // Adaptive AI Learning Engine (V1 Remaining Systems Spec §1) — every
      // completed word feeds the rolling performance aggregates and, for
      // the first 3 words, the Initial Calibration flow. Guess-stage
      // signal is read straight off the counters this same attempt
      // already recorded — a clean guess is zero wrong attempts, elapsed
      // time is measured from the challenge's own start instant.
      // Sentence/Paragraph scores reuse the exact same per-cycle average
      // Mastery just computed above (Correction & Completion Spec §6:
      // "connect all available learning signals" — previously these two
      // AI-scored stages never reached the Learning Profile at all).
      const elapsedSeconds = attempt.guessStartedAt
        ? Math.max(0, (Date.now() - attempt.guessStartedAt.getTime()) / 1000)
        : 0;
      const { calibrationJustCompleted } = await this.learningProfile.recordWordCompletion(
        userId,
        {
          cleanGuess: attempt.wrongAttempts === 0,
          hintsUsed: attempt.hintsUsed,
          maxHints: gameplayRules.guessStage.maxHints,
          elapsedSeconds,
          sentenceScore: averageScoreDimensions(sentenceScores),
          paragraphScore: averageScoreDimensions(paragraphScores),
        },
        tx,
      );

      // V20 Beta Release Checklist §10: ALI must react to Quest
      // completion. This is the quest's actual completion point (the
      // attempt is marked COMPLETED above) — every other authoritative
      // event (Mastery, Journey, Achievements, Boss Battle) already
      // fires ALI from its own service; Quest completion was the one
      // gap, since QuestsService never held an AliService reference
      // before.
      const wordRow = await tx.word.findUnique({ where: { id: wordId }, select: { word: true } });
      const progressionRow = await tx.userProgression.findUnique({
        where: { userId },
        select: { journeyStage: true },
      });
      this.ali.reactFireAndForget(userId, {
        type: 'QUEST_COMPLETION',
        journeyStage: progressionRow?.journeyStage ?? 0,
        context: {
          word: wordRow?.word,
          xpAwarded: quest.baseXp,
          glyphAwarded: quest.baseGlyphs,
          currentStreak,
        },
      });

      return {
        xpAwarded: quest.baseXp,
        glyphAwarded: quest.baseGlyphs,
        correctCount,
        totalCount: attempt.wordIds.length,
        calibrationJustCompleted,
      };
    });
  }

  /**
   * "Hint" reveals one of the word's relatedWords (spec §3.3 lists hint
   * as a distinct affordance from the definition already shown upfront
   * in ChallengeView, and from Synonym below). Not every word has
   * relatedWords populated — that's a content-completeness gap, not a
   * bug — so a hint can genuinely be unavailable; when it is, nothing
   * is charged, since charging a penalty for an empty hint would be
   * unfair.
   */
  async requestHint(userId: string, questAttemptId: string): Promise<HintResult> {
    const attempt = await this.loadInProgressAttempt(userId, questAttemptId, 'GUESSING');
    const { maxHints } = gameplayRules.guessStage;
    if (attempt.hintsUsed >= maxHints) {
      throw new BadRequestException(`No hints remaining (max ${maxHints}).`);
    }

    const word = await this.prisma.word.findUniqueOrThrow({
      where: { id: attempt.wordIds[attempt.currentIndex] },
      select: { relatedWords: true },
    });

    if (word.relatedWords.length === 0) {
      return {
        hint: null,
        hintsUsed: attempt.hintsUsed,
        hintsRemaining: maxHints - attempt.hintsUsed,
      };
    }

    const hint = word.relatedWords[attempt.hintsUsed % word.relatedWords.length];
    const updated = await this.prisma.questAttempt.update({
      where: { id: attempt.id },
      data: { hintsUsed: { increment: 1 } },
    });

    return { hint, hintsUsed: updated.hintsUsed, hintsRemaining: maxHints - updated.hintsUsed };
  }

  /** Reveals one of the word's synonyms, cycling through if requested more than once. Same "unavailable content isn't charged" rule as requestHint. */
  async requestSynonym(userId: string, questAttemptId: string): Promise<SynonymResult> {
    const attempt = await this.loadInProgressAttempt(userId, questAttemptId, 'GUESSING');
    const { maxSynonyms } = gameplayRules.guessStage;
    if (attempt.synonymsUsed >= maxSynonyms) {
      throw new BadRequestException(`No synonyms remaining (max ${maxSynonyms}).`);
    }

    const word = await this.prisma.word.findUniqueOrThrow({
      where: { id: attempt.wordIds[attempt.currentIndex] },
      select: { synonyms: true },
    });

    if (word.synonyms.length === 0) {
      return {
        synonym: null,
        synonymsUsed: attempt.synonymsUsed,
        synonymsRemaining: maxSynonyms - attempt.synonymsUsed,
      };
    }

    const synonym = word.synonyms[attempt.synonymsUsed % word.synonyms.length];
    const updated = await this.prisma.questAttempt.update({
      where: { id: attempt.id },
      data: { synonymsUsed: { increment: 1 } },
    });

    return {
      synonym,
      synonymsUsed: updated.synonymsUsed,
      synonymsRemaining: maxSynonyms - updated.synonymsUsed,
    };
  }

  /**
   * Reveals exactly one more of the currently-blanked letters, chosen as
   * the lowest remaining missing index (deterministic — not random — so
   * repeated requests behave predictably and are easy to test). Bounded
   * naturally by how many letters are still blanked; no separate
   * configured maximum the way hints/synonyms have one.
   */
  async requestLetterReveal(userId: string, questAttemptId: string): Promise<LetterRevealResult> {
    const attempt = await this.loadInProgressAttempt(userId, questAttemptId, 'GUESSING');

    if (attempt.currentMissingIndexes.length === 0) {
      throw new BadRequestException('No blanked letters remain to reveal.');
    }

    const word = await this.prisma.word.findUniqueOrThrow({
      where: { id: attempt.wordIds[attempt.currentIndex] },
      select: { normalizedWord: true },
    });

    const sortedMissing = [...attempt.currentMissingIndexes].sort((a, b) => a - b);
    const indexToReveal = sortedMissing[0];
    const remainingMissing = sortedMissing.slice(1);

    const patternChars = (attempt.currentDisplayPattern ?? '').split(' ');
    patternChars[indexToReveal] = word.normalizedWord[indexToReveal].toUpperCase();
    const newDisplayPattern = patternChars.join(' ');

    const updated = await this.prisma.questAttempt.update({
      where: { id: attempt.id },
      data: {
        lettersRevealed: { increment: 1 },
        currentDisplayPattern: newDisplayPattern,
        currentMissingIndexes: remainingMissing,
      },
    });

    return {
      displayPattern: updated.currentDisplayPattern!,
      missingIndexes: updated.currentMissingIndexes,
      lettersRevealed: updated.lettersRevealed,
    };
  }

  /**
   * Atomically claims a QuestAttempt's stage transition. `loadInProgressAttempt`
   * (and submitAnswer's inline equivalent) reads and validates the
   * attempt's current stage OUTSIDE any transaction, so two concurrent
   * requests for the same attempt/stage can both pass that check before
   * either writes — without this, both would go on to award XP/Glyphs
   * and advance the stage, a duplicate award (V19 Stabilization Spec §9:
   * "Race condition protection. Duplicate reward prevention."). This is
   * the real guard: a conditional `updateMany` gated on the attempt
   * still being at `fromStage`, mirroring the same compare-and-swap
   * pattern BossBattleService.finalizeGroupIfNeeded already uses for its
   * own duplicate-reward protection. Call this FIRST, before any
   * award/side-effect calls, inside the same transaction — only the
   * caller whose claim actually matched a row (count === 1) should go on
   * to do anything further; the loser gets a clean 409 instead of a
   * duplicate award.
   */
  private async claimStageTransition(
    tx: Prisma.TransactionClient,
    attemptId: string,
    fromStage: WordStage,
    data: Prisma.QuestAttemptUpdateManyMutationInput,
  ): Promise<void> {
    const claimed = await tx.questAttempt.updateMany({
      where: { id: attemptId, wordStage: fromStage, status: 'IN_PROGRESS' },
      data,
    });
    if (claimed.count === 0) {
      throw new ConflictException('This quest step was already submitted');
    }
  }

  private async loadInProgressAttempt(
    userId: string,
    questAttemptId: string,
    requiredStage?: string,
  ) {
    const attempt = await this.prisma.questAttempt.findUnique({ where: { id: questAttemptId } });
    if (!attempt) throw new NotFoundException('Quest attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException('Not your quest attempt');
    if (attempt.status !== 'IN_PROGRESS')
      throw new BadRequestException('Quest attempt is not in progress');
    if (requiredStage && attempt.wordStage !== requiredStage) {
      throw new BadRequestException(`This word is not currently at the ${requiredStage} stage`);
    }
    return attempt;
  }

  /**
   * Builds the challenge for wordIds[wordIndex] AND persists it onto the
   * QuestAttempt as the pending challenge, so submitAnswer can later
   * record what was actually shown (see the comment on
   * QuestAttempt.currentDisplayPattern in schema.prisma). Accepts an
   * optional `db` so a call from inside submitAnswer's transaction stays
   * part of that same transaction, rather than opening a second one.
   */
  private async buildChallengeView(
    questAttemptId: string,
    userId: string,
    wordIds: string[],
    wordIndex: number,
    db: Db = this.prisma,
  ): Promise<ChallengeView> {
    const wordId = wordIds[wordIndex];
    const word = await db.word.findUniqueOrThrow({ where: { id: wordId } });
    const masteryLevel = await this.mastery.getLevel(userId, wordId);

    const challenge = generateOmissionChallenge({
      word: word.word,
      baseDifficulty: word.baseDifficulty,
      masteryLevel,
    });

    await db.questAttempt.update({
      where: { id: questAttemptId },
      data: {
        currentDisplayPattern: challenge.displayPattern,
        currentMissingIndexes: challenge.missingIndexes,
      },
    });

    return {
      questAttemptId,
      wordIndex,
      wordCount: wordIds.length,
      displayPattern: challenge.displayPattern,
      missingIndexes: challenge.missingIndexes,
      wordLength: word.length,
      definition: word.definition,
      partOfSpeech: word.partOfSpeech,
    };
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private countWords(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
  }
}
