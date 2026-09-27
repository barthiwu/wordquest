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
import { ARCADE_COUNTS_TOWARD_DAILY_STREAK, COMPLETE_IT_CONFIG } from '../config/arcade.config';
import { blankSentence, isCompleteItSentenceUsable } from './complete-it.util';
import { renderWord } from '../../vocabulary/english-variant';
import { resolveEnglishVariant } from '../../vocabulary/resolve-english-variant';

/** Client-safe view of the player's current Complete It word — the
 * word's own example sentence with the target word blanked out, never
 * the target word itself (spec §5/§8). */
export interface CompleteItChallengeView {
  sessionId: string;
  wordIndex: number;
  wordsTotal: number;
  sentenceWithBlank: string;
  definition: string;
  partOfSpeech: string;
  wordLength: number;
  timeLimitSeconds: number;
  /** ISO timestamp — server-authoritative deadline for this word. Render
   * a countdown from it; never decide anything about timing client-side
   * (spec §10/§11). */
  deadlineAt: string;
  currentStreak: number;
  longestStreak: number;
}

export interface CompleteItAnswerResult {
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
  nextChallenge: CompleteItChallengeView | null;
}

type ArcadeGameSessionRow = Prisma.ArcadeGameSessionGetPayload<Record<string, never>>;

/**
 * Complete It (spec §5 sibling of ScrambleQuest): the player sees the
 * word's own example sentence with the target word blanked out, plus
 * its definition and part of speech, and types the missing word.
 * Shares ArcadeGameSession/ArcadeAnswer with ScrambleQuest (schema
 * comment: "ScrambleQuest or Complete It") — same session lifecycle,
 * same [sessionId, wordIndex] idempotency guard, same reward formula.
 * COMPLETE_IT_CONFIG.HINTS_ENABLED is false (2026-09 decision), so
 * there's no hint endpoint at all here — currentWordHintsUsed always
 * stays 0, which also means the hint modifier is always 1 (no penalty
 * ever applies).
 *
 * TIMER_SECONDS wasn't in the spec's own Complete It config (only
 * HINTS_ENABLED/WORDS_PER_SESSION were) even though the shared
 * speedModifierFor doc comment says it applies "identically" to all
 * three games — added here as the same kind of 2026-09 product
 * decision ScrambleQuest's own timer already was, slightly longer
 * since Complete It gives no letters at all up front, only sentence
 * context (see arcade.config.ts).
 */
@Injectable()
export class CompleteItService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ArcadeChallengeService,
    private readonly rewardEngine: RewardEngineService,
    private readonly progression: ProgressionService,
  ) {}

  /**
   * Starts a new session, or resumes one already in progress as long as
   * the current word's server-side timer hasn't already run out (same
   * pattern as ScrambleQuestService.start). The word pool is filtered
   * to sentences that both contain their own word AND read like a real
   * sentence — see isCompleteItSentenceUsable's doc comment — so
   * buildChallengeView never has to handle the "couldn't blank it"
   * case mid-session, and players never land on an unwinnable fragment.
   */
  async start(userId: string): Promise<CompleteItChallengeView> {
    const existing = await this.prisma.arcadeGameSession.findFirst({
      where: { userId, game: 'COMPLETE_IT', status: 'ACTIVE' },
    });

    const variant = await resolveEnglishVariant(this.prisma, userId);

    if (existing) {
      const deadlineMs =
        existing.currentWordStartedAt.getTime() + COMPLETE_IT_CONFIG.TIMER_SECONDS * 1000;
      if (Date.now() < deadlineMs) {
        return this.buildChallengeView(existing, variant);
      }
      await this.prisma.arcadeGameSession.update({
        where: { id: existing.id },
        data: { status: 'ABANDONED', endedAt: new Date() },
      });
    }

    // The quality filter (isCompleteItSentenceUsable) is passed straight
    // into pickChallenges rather than applied after the fact -- it
    // rejects a meaningful fraction of the corpus (see complete-it.util
    // .ts's doc comment), so pickChallenges over-fetches and backfills
    // internally until it actually has WORDS_PER_SESSION usable words
    // (or the eligible pool runs out). Filtering after a single fixed-
    // size pick, the old approach, is what let sessions quietly ship
    // far fewer words than WORDS_PER_SESSION whenever the pick happened
    // to land on a lot of weak sentences.
    const blankable = await this.challenges.pickChallenges(
      userId,
      COMPLETE_IT_CONFIG.WORDS_PER_SESSION,
      [],
      COMPLETE_IT_CONFIG.MIN_WORD_LENGTH,
      (c) => isCompleteItSentenceUsable(c.word.exampleSentence, c.word.word),
    );
    if (blankable.length === 0) {
      throw new BadRequestException('No words are available for Complete It right now.');
    }

    const session = await this.prisma.arcadeGameSession.create({
      data: {
        userId,
        game: 'COMPLETE_IT',
        wordsTotal: blankable.length,
        wordIds: blankable.map((c) => c.word.id),
      },
    });

    return this.buildChallengeView(session, variant);
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    rawAnswer: string,
  ): Promise<CompleteItAnswerResult> {
    const session = await this.loadActiveSession(userId, sessionId);
    const word = await this.currentWord(session);
    const variant = await resolveEnglishVariant(this.prisma, userId);
    const rendered = renderWord(word, variant);

    // Server-authoritative timing (spec §10/§11) — always computed from
    // the server-recorded currentWordStartedAt, never a client-reported
    // elapsed time.
    const responseTimeMs = Date.now() - session.currentWordStartedAt.getTime();
    const timeLimitMs = COMPLETE_IT_CONFIG.TIMER_SECONDS * 1000;
    const timedOut = responseTimeMs > timeLimitMs;
    // Compared against the RENDERED (variant-aware) normalized form, not
    // word.normalizedWord directly -- a US-preference player who typed
    // "color" must be marked correct for a word whose UK-authored
    // answer is "colour" (2026-09 fairness feature).
    const isCorrect = !timedOut && normalizeAnswer(rawAnswer) === rendered.normalizedText;

    const streakBefore = session.currentStreak;
    const streakAfter = nextStreak(streakBefore, { isCorrect, timedOut });
    const newLongestStreak = Math.max(session.longestStreak, streakAfter);

    let reward = { baseXp: 0, speedModifier: 1, hintModifier: 1, streakModifier: 1, finalXp: 0 };
    if (isCorrect) {
      reward = this.rewardEngine.calculate({
        difficulty: word.baseDifficulty,
        responseTimeMs,
        timeLimitMs,
        hintsUsed: 0, // Complete It never offers hints — COMPLETE_IT_CONFIG.HINTS_ENABLED is false
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
              hintsUsed: 0,
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
        // loser aborts cleanly instead of double-awarding (defense in
        // depth alongside the unique constraint above, mirroring
        // QuestsService.claimStageTransition / ScrambleQuestService).
        const claimed = await tx.arcadeGameSession.updateMany({
          where: { id: sessionId, currentIndex: wordIndex },
          data: {
            currentIndex: { increment: 1 },
            currentStreak: streakAfter,
            longestStreak: newLongestStreak,
            totalXpAwarded: { increment: reward.finalXp },
            currentWordStartedAt: new Date(),
            ...(isLastWord ? { status: 'COMPLETED' as const, endedAt: new Date() } : {}),
          },
        });
        if (claimed.count === 0) {
          throw new ConflictException('This word was already answered');
        }

        if (isCorrect) {
          // ProgressionService is the ONLY writer of account XP (spec §3).
          await this.progression.awardXp(
            userId,
            reward.finalXp,
            'ARCADE_COMPLETE_IT_ANSWER',
            'arcade',
            `${sessionId}:${wordIndex}`,
            tx,
          );
        }

        const correctSoFar = await tx.arcadeAnswer.count({ where: { sessionId, isCorrect: true } });

        // Daily-activity streak counts once, on full session completion —
        // same semantics as ScrambleQuestService/Daily Quest.
        if (isLastWord && ARCADE_COUNTS_TOWARD_DAILY_STREAK) {
          await this.progression.recordDailyActivity(userId, tx);
        }

        return { correctCount: correctSoFar };
      },
    );

    let nextChallenge: CompleteItChallengeView | null = null;
    if (!isLastWord) {
      const refreshed = await this.prisma.arcadeGameSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      nextChallenge = await this.buildChallengeView(refreshed, variant);
    }

    return {
      isCorrect,
      timedOut,
      correctAnswer: rendered.text,
      xpAwarded: reward.finalXp,
      currentStreak: streakAfter,
      longestStreak: newLongestStreak,
      sessionComplete: isLastWord,
      totalXpAwarded: session.totalXpAwarded + reward.finalXp,
      correctCount,
      wordsTotal: session.wordsTotal,
      nextChallenge,
    };
  }

  private async loadActiveSession(
    userId: string,
    sessionId: string,
  ): Promise<ArcadeGameSessionRow> {
    const session = await this.prisma.arcadeGameSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Complete It session not found');
    if (session.userId !== userId) throw new ForbiddenException('Not your Complete It session');
    if (session.game !== 'COMPLETE_IT') {
      throw new BadRequestException('This session is not a Complete It session');
    }
    if (session.status !== 'ACTIVE') {
      throw new BadRequestException('This Complete It session has already ended');
    }
    return session;
  }

  private currentWord(session: Pick<ArcadeGameSessionRow, 'wordIds' | 'currentIndex'>) {
    const wordId = session.wordIds[session.currentIndex];
    return this.prisma.word.findUniqueOrThrow({ where: { id: wordId } });
  }

  private async buildChallengeView(
    session: ArcadeGameSessionRow,
    variant: 'US' | 'UK' | null,
  ): Promise<CompleteItChallengeView> {
    const word = await this.currentWord(session);
    const rendered = renderWord(word, variant);
    // Guaranteed found:true — start() only ever puts blankable words
    // into wordIds (checked against the UK original; toUsSentence never
    // changes word count, see isCompleteItSentenceUsable's own note in
    // start(), so this holds for the rendered variant too). If this
    // were ever false it'd mean a data change happened after the
    // session started, which nothing in this app does; falling back to
    // the unblanked sentence would leak the answer, so this
    // deliberately does NOT have a silent fallback.
    const { sentenceWithBlank } = blankSentence(rendered.sentence, rendered.text);

    return {
      sessionId: session.id,
      wordIndex: session.currentIndex,
      wordsTotal: session.wordsTotal,
      sentenceWithBlank,
      definition: word.definition,
      partOfSpeech: word.partOfSpeech,
      // The rendered variant's own length, not word.word.length -- the
      // blank has to match what's actually on screen (e.g. "colour"
      // blanks to 6 underscores but its US form "color" blanks to 5).
      wordLength: rendered.text.length,
      timeLimitSeconds: COMPLETE_IT_CONFIG.TIMER_SECONDS,
      deadlineAt: new Date(
        session.currentWordStartedAt.getTime() + COMPLETE_IT_CONFIG.TIMER_SECONDS * 1000,
      ).toISOString(),
      currentStreak: session.currentStreak,
      longestStreak: session.longestStreak,
    };
  }
}
