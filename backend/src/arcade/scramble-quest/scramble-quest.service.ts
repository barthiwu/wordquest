import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressionService } from '../../progression/progression.service';
import { isUniqueConstraintError } from '../../common/prisma-errors';
import { ArcadeChallengeService } from '../challenge.service';
import { RewardEngineService } from '../reward-engine.service';
import { nextStreak } from '../types';
import { normalizeAnswer } from '../answer-normalization';
import { ARCADE_COUNTS_TOWARD_DAILY_STREAK, SCRAMBLE_QUEST_CONFIG } from '../config/arcade.config';
import { hintRevealOrder, scrambleWord } from './scramble.util';

/** Client-safe view of the player's current ScrambleQuest word — the
 * scrambled letters, never the target word (spec §5/§8). */
export interface ScrambleQuestChallengeView {
  sessionId: string;
  wordIndex: number;
  wordsTotal: number;
  scrambledLetters: string;
  wordLength: number;
  /** Always shown under the puzzle, not gated behind a hint — Barth,
   * Sept 2026 design review: "the word is supposed to have the
   * dictionary meaning under it". */
  definition: string;
  /** Optional, player-initiated reveal (a "Synonyms" card the mobile
   * screen shows behind a toggle) — included here unconditionally since
   * showing it is purely a client-side choice with no server-tracked
   * state and, per Barth, must never affect XP the way the letter-reveal
   * Hint button does. */
  synonyms: string[];
  timeLimitSeconds: number;
  /** ISO timestamp — server-authoritative deadline for this word. Render
   * a countdown from it; never decide anything about timing client-side
   * (spec §10/§11). */
  deadlineAt: string;
  hintsRemaining: number;
  maxHints: number;
  /** Hints already spent on this word, so a resumed/re-fetched challenge
   * (app relaunch mid-word) shows the same revealed letters instead of
   * "forgetting" them. */
  revealedLetters: { position: number; letter: string }[];
  currentStreak: number;
  longestStreak: number;
}

export interface ScrambleQuestHintResult {
  position: number;
  letter: string;
  hintsRemaining: number;
}

/** A completed word's meaning, surfaced only after it's been answered —
 * never while it's still the active puzzle (spec convention shared with
 * DailyQuest's UnderstandingContent: don't give the answer away before
 * the player has actually guessed it). */
export interface ScrambleQuestWordMeaning {
  definition: string;
  partOfSpeech: string;
  synonyms: string[];
}

export interface ScrambleQuestAnswerResult {
  isCorrect: boolean;
  timedOut: boolean;
  correctAnswer: string;
  xpAwarded: number;
  currentStreak: number;
  longestStreak: number;
  sessionComplete: boolean;
  totalXpAwarded: number;
  correctCount: number;
  wordsTotal: number;
  nextChallenge: ScrambleQuestChallengeView | null;
  /** This word's definition/part-of-speech/synonyms — populated once
   * it's been answered (correct, wrong, or timed out). The client
   * shows it behind an opt-in "Meaning & synonyms" card, not
   * automatically. */
  meaning: ScrambleQuestWordMeaning;
}

type ArcadeGameSessionRow = Prisma.ArcadeGameSessionGetPayload<Record<string, never>>;

/**
 * ScrambleQuest (spec §5): timed word unscrambling. One
 * ArcadeGameSession per play-through, its full word sequence picked once
 * at start via ArcadeChallengeService (spec §8) and stored on
 * wordIds/wordsTotal. All correctness, timing, hint-count, and streak
 * decisions are made here from server-held state only — nothing here
 * ever trusts a client-submitted hint count, elapsed time, or
 * correctness flag (spec §11).
 */
@Injectable()
export class ScrambleQuestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ArcadeChallengeService,
    private readonly rewardEngine: RewardEngineService,
    private readonly progression: ProgressionService,
  ) {}

  /**
   * Starts a new session, or resumes one already in progress (an app
   * relaunch mid-session) as long as the current word's server-side
   * timer hasn't already run out. A resumable-but-expired session is
   * abandoned first, never left ACTIVE forever with no way to progress.
   */
  async start(userId: string): Promise<ScrambleQuestChallengeView> {
    const existing = await this.prisma.arcadeGameSession.findFirst({
      where: { userId, game: 'SCRAMBLE_QUEST', status: 'ACTIVE' },
    });

    if (existing) {
      const deadlineMs =
        existing.currentWordStartedAt.getTime() + SCRAMBLE_QUEST_CONFIG.TIMER_SECONDS * 1000;
      if (Date.now() < deadlineMs) {
        return this.buildChallengeView(existing);
      }
      await this.prisma.arcadeGameSession.update({
        where: { id: existing.id },
        data: { status: 'ABANDONED', endedAt: new Date() },
      });
    }

    const picked = await this.challenges.pickChallenges(
      userId,
      SCRAMBLE_QUEST_CONFIG.WORDS_PER_SESSION,
      [],
      SCRAMBLE_QUEST_CONFIG.MIN_WORD_LENGTH,
    );
    if (picked.length === 0) {
      throw new BadRequestException('No words are available for ScrambleQuest right now.');
    }

    const session = await this.prisma.arcadeGameSession.create({
      data: {
        userId,
        game: 'SCRAMBLE_QUEST',
        wordsTotal: picked.length,
        wordIds: picked.map((c) => c.word.id),
      },
    });

    return this.buildChallengeView(session);
  }

  /**
   * Reveals the next letter (left to right) of the current word. Up to
   * SCRAMBLE_QUEST_CONFIG.MAX_HINTS_PER_WORD, capped further so a hint
   * can never reveal the word's very last letter (spec doesn't require
   * this, but a hint that fully solves the word isn't really a hint).
   */
  async requestHint(userId: string, sessionId: string): Promise<ScrambleQuestHintResult> {
    const session = await this.loadActiveSession(userId, sessionId);
    const word = await this.currentWord(session);
    const maxHintsForWord = this.maxHintsFor(word.word);

    if (session.currentWordHintsUsed >= maxHintsForWord) {
      throw new BadRequestException(`No hints remaining (max ${maxHintsForWord}).`);
    }

    // Compare-and-swap on the exact hint count just read — a race loser
    // (double-tap, or two requests in flight) can't both succeed and
    // silently grant an extra hint.
    const claimed = await this.prisma.arcadeGameSession.updateMany({
      where: { id: sessionId, currentWordHintsUsed: session.currentWordHintsUsed },
      data: { currentWordHintsUsed: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This hint was already requested');
    }

    // The Nth hint reveals a randomized (but deterministic-per-session)
    // position, not simply the Nth letter — see hintRevealOrder().
    const hintsUsedNow = session.currentWordHintsUsed + 1;
    const revealOrder = hintRevealOrder(word.word, `${session.id}:${session.currentIndex}:hints`);
    const position = revealOrder[session.currentWordHintsUsed];
    return {
      position,
      letter: word.word[position],
      hintsRemaining: maxHintsForWord - hintsUsedNow,
    };
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    rawAnswer: string,
  ): Promise<ScrambleQuestAnswerResult> {
    const session = await this.loadActiveSession(userId, sessionId);
    const word = await this.currentWord(session);

    // Server-authoritative timing (spec §10/§11) — always computed from
    // the server-recorded currentWordStartedAt, never a client-reported
    // elapsed time.
    const responseTimeMs = Date.now() - session.currentWordStartedAt.getTime();
    const timeLimitMs = SCRAMBLE_QUEST_CONFIG.TIMER_SECONDS * 1000;
    const timedOut = responseTimeMs > timeLimitMs;
    const isCorrect = !timedOut && normalizeAnswer(rawAnswer) === word.normalizedWord;

    const streakBefore = session.currentStreak;
    const streakAfter = nextStreak(streakBefore, { isCorrect, timedOut });
    const newLongestStreak = Math.max(session.longestStreak, streakAfter);

    let reward = { baseXp: 0, speedModifier: 1, hintModifier: 1, streakModifier: 1, finalXp: 0 };
    if (isCorrect) {
      reward = this.rewardEngine.calculate({
        difficulty: word.baseDifficulty,
        responseTimeMs,
        timeLimitMs,
        hintsUsed: session.currentWordHintsUsed,
        streakBefore,
      });
    }

    const wordIndex = session.currentIndex;
    const isLastWord = wordIndex + 1 >= session.wordsTotal;

    const { correctCount } = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        try {
          await tx.arcadeAnswer.create({
            data: {
              sessionId,
              wordIndex,
              wordId: word.id,
              submittedAnswer: rawAnswer,
              isCorrect,
              hintsUsed: session.currentWordHintsUsed,
              timedOut,
              baseXp: reward.baseXp,
              speedModifier: reward.speedModifier,
              hintModifier: reward.hintModifier,
              streakModifier: reward.streakModifier,
              finalXpAwarded: reward.finalXp,
              streakBefore,
              streakAfter,
              responseTimeMs,
            },
          });
        } catch (err) {
          // @@unique([sessionId, wordIndex]) — the idempotency/duplicate-
          // submission guard (spec §9/§11): a retried or racing second
          // submission for the same word never reaches the award below.
          if (isUniqueConstraintError(err)) {
            throw new ConflictException('This word was already answered');
          }
          throw err;
        }

        // Claim the session's advance — before the XP award — so a race
        // loser aborts cleanly instead of double-awarding. The unique
        // constraint above already catches this in practice; this is
        // defense in depth, mirroring QuestsService.claimStageTransition.
        const claimed = await tx.arcadeGameSession.updateMany({
          where: { id: sessionId, currentIndex: wordIndex },
          data: {
            currentIndex: { increment: 1 },
            currentStreak: streakAfter,
            longestStreak: newLongestStreak,
            totalXpAwarded: { increment: reward.finalXp },
            currentWordStartedAt: new Date(),
            currentWordHintsUsed: 0,
            ...(isLastWord ? { status: 'COMPLETED' as const, endedAt: new Date() } : {}),
          },
        });
        if (claimed.count === 0) {
          throw new ConflictException('This word was already answered');
        }

        if (isCorrect) {
          // ProgressionService is the ONLY writer of account XP (spec §3)
          // — reference ties this award back to the exact answer for
          // auditing, same convention as QUEST_ANSWER/QUEST_COMPLETION.
          await this.progression.awardXp(
            userId,
            reward.finalXp,
            'ARCADE_SCRAMBLE_QUEST_ANSWER',
            'arcade',
            `${sessionId}:${wordIndex}`,
            tx,
          );
        }

        const correctSoFar = await tx.arcadeAnswer.count({ where: { sessionId, isCorrect: true } });

        // Daily-activity streak counts once, on full session completion —
        // matching Daily Quest's own semantics (recordDailyActivity fires
        // on QUEST_COMPLETION, not on every answer) so a trivial partial
        // session can't farm the streak. 2026-09 decision: Arcade play
        // DOES count (ARCADE_COUNTS_TOWARD_DAILY_STREAK).
        if (isLastWord && ARCADE_COUNTS_TOWARD_DAILY_STREAK) {
          await this.progression.recordDailyActivity(userId, tx);
        }

        return { correctCount: correctSoFar };
      },
    );

    let nextChallenge: ScrambleQuestChallengeView | null = null;
    if (!isLastWord) {
      const refreshed = await this.prisma.arcadeGameSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      nextChallenge = await this.buildChallengeView(refreshed);
    }

    return {
      isCorrect,
      timedOut,
      correctAnswer: word.word,
      xpAwarded: reward.finalXp,
      currentStreak: streakAfter,
      longestStreak: newLongestStreak,
      sessionComplete: isLastWord,
      totalXpAwarded: session.totalXpAwarded + reward.finalXp,
      correctCount,
      wordsTotal: session.wordsTotal,
      nextChallenge,
      meaning: {
        definition: word.definition,
        partOfSpeech: word.partOfSpeech,
        synonyms: word.synonyms,
      },
    };
  }

  private async loadActiveSession(
    userId: string,
    sessionId: string,
  ): Promise<ArcadeGameSessionRow> {
    const session = await this.prisma.arcadeGameSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('ScrambleQuest session not found');
    if (session.userId !== userId) throw new ForbiddenException('Not your ScrambleQuest session');
    if (session.game !== 'SCRAMBLE_QUEST') {
      throw new BadRequestException('This session is not a ScrambleQuest session');
    }
    if (session.status !== 'ACTIVE') {
      throw new BadRequestException('This ScrambleQuest session has already ended');
    }
    return session;
  }

  private currentWord(session: Pick<ArcadeGameSessionRow, 'wordIds' | 'currentIndex'>) {
    const wordId = session.wordIds[session.currentIndex];
    return this.prisma.word.findUniqueOrThrow({ where: { id: wordId } });
  }

  /** A hint can never reveal the word's final letter — leaves at least
   * one letter for the player to actually solve. */
  private maxHintsFor(word: string): number {
    return Math.min(SCRAMBLE_QUEST_CONFIG.MAX_HINTS_PER_WORD, Math.max(0, word.length - 1));
  }

  private async buildChallengeView(
    session: ArcadeGameSessionRow,
  ): Promise<ScrambleQuestChallengeView> {
    const word = await this.currentWord(session);
    const maxHintsForWord = this.maxHintsFor(word.word);
    const revealOrder = hintRevealOrder(word.word, `${session.id}:${session.currentIndex}:hints`);
    const revealedLetters = revealOrder.slice(0, session.currentWordHintsUsed).map((position) => ({
      position,
      letter: word.word[position],
    }));

    return {
      sessionId: session.id,
      wordIndex: session.currentIndex,
      wordsTotal: session.wordsTotal,
      scrambledLetters: scrambleWord(word.word, `${session.id}:${session.currentIndex}`),
      wordLength: word.word.length,
      definition: word.definition,
      synonyms: word.synonyms,
      timeLimitSeconds: SCRAMBLE_QUEST_CONFIG.TIMER_SECONDS,
      deadlineAt: new Date(
        session.currentWordStartedAt.getTime() + SCRAMBLE_QUEST_CONFIG.TIMER_SECONDS * 1000,
      ).toISOString(),
      hintsRemaining: maxHintsForWord - session.currentWordHintsUsed,
      maxHints: maxHintsForWord,
      revealedLetters,
      currentStreak: session.currentStreak,
      longestStreak: session.longestStreak,
    };
  }
}
