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
import { ArcadeVersusService } from '../versus/versus.service';
import { ArcadePlayLimitService, type ArcadePlayNotice } from '../limits/play-limit.service';
import { RewardEngineService } from '../reward-engine.service';
import { nextStreak } from '../types';
import { ARCADE_COUNTS_TOWARD_DAILY_STREAK, HANGMAN_CONFIG } from '../config/arcade.config';
import { evaluateGuesses, isValidGuess, pickHintLetter } from './hangman.util';
import { renderWord } from '../../vocabulary/english-variant';
import { resolveEnglishVariant } from '../../vocabulary/resolve-english-variant';
import {
  AliService,
  type AliEvent,
  type AliDisplayMessage,
  toAliDisplayMessage,
} from '../../ali/ali.service';
import { quickAliReaction } from '../../ali/ali-quick-reactions';
import { quickAliExpression, type AliExpressionCue } from '../../ali/ali-expression';

/**
 * Client-safe view of the player's current Hangman word. Never carries the
 * word itself: `pattern` has '_' for every letter still hidden.
 */
export interface HangmanChallengeView {
  /** Present only on the response that started a new play: the player's
   * standing against the daily cap (and the 50/70/90/100 percent notice, if crossed). */
  playLimit?: ArcadePlayNotice;
  sessionId: string;
  wordIndex: number;
  wordsTotal: number;
  /** One character per letter of the word: the letter if found (or if the
   * character is not a letter, e.g. a hyphen), '_' otherwise. */
  pattern: string;
  wordLength: number;
  /** Every letter guessed on this word, in order. */
  guessedLetters: string[];
  /** The subset of guessedLetters that are not in the word. */
  wrongLetters: string[];
  wrongCount: number;
  /** Wrong guesses allowed before the man is hanged. */
  maxWrong: number;
  /** Always shown under the puzzle (the dictionary meaning). */
  definition: string;
  synonyms: string[];
  hintsRemaining: number;
  maxHints: number;
  currentStreak: number;
  longestStreak: number;
}

export interface HangmanWordMeaning {
  definition: string;
  partOfSpeech: string;
  synonyms: string[];
}

/** Everything the client needs once a word is finished (saved or hanged). */
export interface HangmanWordCompletion {
  outcome: 'WON' | 'LOST';
  correctAnswer: string;
  xpAwarded: number;
  currentStreak: number;
  longestStreak: number;
  sessionComplete: boolean;
  /** Set on the last word of a head-to-head play: that play now counts toward the daily cap. */
  playLimit?: ArcadePlayNotice;
  totalXpAwarded: number;
  /** Words solved so far this session. */
  correctCount: number;
  wordsTotal: number;
  nextChallenge: HangmanChallengeView | null;
  meaning: HangmanWordMeaning;
  /** Last word only -- see ScrambleQuestAnswerResult.streakReaction. */
  streakReaction: AliDisplayMessage | null;
  /** Last word only -- see ScrambleQuestAnswerResult.deferredAliReactions. */
  deferredAliReactions: AliDisplayMessage[];
  aliQuickReaction: string | null;
  aliQuickExpression: AliExpressionCue | null;
}

export interface HangmanGuessResult {
  letter: string;
  isHit: boolean;
  /** The current word's state after this guess. When the word just
   * finished this is its final state (a won word fully revealed, a lost
   * word showing what was found). */
  view: HangmanChallengeView;
  /** Non-null once the word has finished. */
  completion: HangmanWordCompletion | null;
}

export interface HangmanHintResult {
  letter: string;
  view: HangmanChallengeView;
}

type ArcadeGameSessionRow = Prisma.ArcadeGameSessionGetPayload<Record<string, never>>;

/**
 * Hangman: guess a hidden word one letter at a time. Each wrong letter adds
 * a body part to the man; the sixth hangs him and the word is lost, while
 * finding every letter saves him. One ArcadeGameSession is one run of
 * WORDS_PER_SESSION words, picked once at start. Every decision (is the
 * letter in the word, how many mistakes, did the player win) is made here
 * from the stored guess list -- the client only ever sends a letter.
 */
@Injectable()
export class HangmanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ArcadeChallengeService,
    private readonly rewardEngine: RewardEngineService,
    private readonly progression: ProgressionService,
    private readonly ali: AliService,
    private readonly versus: ArcadeVersusService,
    private readonly playLimit: ArcadePlayLimitService,
  ) {}

  /** Starts a new session, or resumes the one already in progress (an app
   * relaunch mid-run). Hangman has no countdown, so nothing expires. */
  async start(userId: string, versusMatchId?: string): Promise<HangmanChallengeView> {
    if (versusMatchId) return this.startVersus(userId, versusMatchId);
    const existing = await this.prisma.arcadeGameSession.findFirst({
      where: { userId, game: 'HANGMAN', status: 'ACTIVE', versusMatchId: null },
    });
    const variant = await resolveEnglishVariant(this.prisma, userId);
    if (existing) return this.buildChallengeView(existing, variant);

    await this.playLimit.assertCanPlay(userId, 'HANGMAN');

    const picked = await this.challenges.pickChallenges(
      userId,
      HANGMAN_CONFIG.WORDS_PER_SESSION,
      [],
      HANGMAN_CONFIG.MIN_WORD_LENGTH,
      HANGMAN_CONFIG.MAX_WORD_LENGTH,
    );
    if (picked.length === 0) {
      throw new BadRequestException('No words are available for Hangman right now.');
    }

    // Taken before the session exists, so a refused (raced) play never leaves a free session behind.
    const playLimit = await this.playLimit.consumePlay(userId, 'HANGMAN');
    const session = await this.prisma.arcadeGameSession.create({
      data: {
        userId,
        game: 'HANGMAN',
        wordsTotal: picked.length,
        wordIds: picked.map((c) => c.word.id),
      },
    });
    return { ...(await this.buildChallengeView(session, variant)), playLimit };
  }

  /**
   * Opens this player's half of a head-to-head match: the same session as a
   * solo play, but on the match's shared word list (picked by whichever
   * player starts first) and tied to the match. A relaunch resumes it.
   */
  private async startVersus(userId: string, versusMatchId: string) {
    const variant = await resolveEnglishVariant(this.prisma, userId);
    const resolved = await this.versus.resolveStart(userId, versusMatchId, 'HANGMAN', async () =>
      (
        await this.challenges.pickChallenges(
          userId,
          HANGMAN_CONFIG.WORDS_PER_SESSION,
          [],
          HANGMAN_CONFIG.MIN_WORD_LENGTH,
          HANGMAN_CONFIG.MAX_WORD_LENGTH,
        )
      ).map((c) => c.word.id),
    );
    if (resolved.existing) return this.buildChallengeView(resolved.existing, variant);

    // A head-to-head play is counted when it is finished (see submitAnswer),
    // so starting only checks that today's plays are not already used up.
    await this.playLimit.assertCanPlay(userId, 'HANGMAN');

    try {
      const session = await this.prisma.arcadeGameSession.create({
        data: {
          userId,
          game: 'HANGMAN',
          wordsTotal: resolved.wordIds.length,
          wordIds: resolved.wordIds,
          versusMatchId,
        },
      });
      return this.buildChallengeView(session, variant);
    } catch (err) {
      // A double-tap raced us: the other request already created it.
      if (!isUniqueConstraintError(err)) throw err;
      const existing = await this.prisma.arcadeGameSession.findUniqueOrThrow({
        where: { versusMatchId_userId: { versusMatchId, userId } },
      });
      return this.buildChallengeView(existing, variant);
    }
  }

  async requestHint(userId: string, sessionId: string): Promise<HangmanHintResult> {
    const session = await this.loadActiveSession(userId, sessionId);
    const word = await this.currentWord(session);
    const variant = await resolveEnglishVariant(this.prisma, userId);
    const rendered = renderWord(word, variant);

    if (session.currentWordHintsUsed >= HANGMAN_CONFIG.MAX_HINTS_PER_WORD) {
      throw new BadRequestException('No hints remaining.');
    }
    const letter = pickHintLetter(
      rendered.text,
      session.currentWordGuesses,
      `${session.id}:${session.currentIndex}:hint`,
    );
    if (!letter) throw new BadRequestException('A hint would give the word away.');

    // Compare-and-swap on the guess counter, so a double-tap cannot spend
    // two hints or squeeze a hint in between a guess and its result.
    const claimed = await this.prisma.arcadeGameSession.updateMany({
      where: {
        id: sessionId,
        currentIndex: session.currentIndex,
        currentWordGuessCount: session.currentWordGuessCount,
      },
      data: {
        currentWordGuesses: { push: letter },
        currentWordGuessCount: { increment: 1 },
        currentWordHintsUsed: { increment: 1 },
      },
    });
    if (claimed.count === 0) throw new ConflictException('That move was already made');

    const refreshed = await this.prisma.arcadeGameSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    return { letter, view: await this.buildChallengeView(refreshed, variant) };
  }

  async guessLetter(
    userId: string,
    sessionId: string,
    rawLetter: string,
  ): Promise<HangmanGuessResult> {
    if (!isValidGuess(rawLetter)) throw new BadRequestException('Guess a single letter A-Z.');
    const letter = rawLetter.toLowerCase();

    const session = await this.loadActiveSession(userId, sessionId);
    if (session.currentWordGuesses.includes(letter)) {
      throw new BadRequestException('You already guessed that letter.');
    }
    const word = await this.currentWord(session);
    const variant = await resolveEnglishVariant(this.prisma, userId);
    const rendered = renderWord(word, variant);

    const guesses = [...session.currentWordGuesses, letter];
    const state = evaluateGuesses(rendered.text, guesses, HANGMAN_CONFIG.MAX_WRONG_GUESSES);
    const isHit = !state.wrongLetters.includes(letter);

    // Mid-word: just record the guess.
    if (!state.won && !state.lost) {
      const claimed = await this.prisma.arcadeGameSession.updateMany({
        where: {
          id: sessionId,
          currentIndex: session.currentIndex,
          currentWordGuessCount: session.currentWordGuessCount,
        },
        data: {
          currentWordGuesses: { push: letter },
          currentWordGuessCount: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw new ConflictException('That move was already made');
      const refreshed = await this.prisma.arcadeGameSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      return {
        letter,
        isHit,
        view: await this.buildChallengeView(refreshed, variant),
        completion: null,
      };
    }

    // The word just finished: settle it.
    const completion = await this.completeWord(
      userId,
      session,
      word,
      rendered.text,
      guesses,
      state.won,
      state.wrongCount,
      variant,
    );
    const finalView = this.viewFromParts(
      session,
      rendered.text,
      word,
      guesses,
      completion.currentStreak,
      completion.longestStreak,
    );
    return { letter, isHit, view: finalView, completion };
  }

  private async completeWord(
    userId: string,
    session: ArcadeGameSessionRow,
    word: Prisma.WordGetPayload<Record<string, never>>,
    renderedText: string,
    guesses: string[],
    won: boolean,
    wrongCount: number,
    variant: 'US' | 'UK' | null,
  ): Promise<HangmanWordCompletion> {
    const sessionId = session.id;
    const responseTimeMs = Date.now() - session.currentWordStartedAt.getTime();
    const timeLimitMs = HANGMAN_CONFIG.TIME_REFERENCE_SECONDS * 1000;

    const streakBefore = session.currentStreak;
    const streakAfter = nextStreak(streakBefore, { isCorrect: won, timedOut: false });
    const newLongestStreak = Math.max(session.longestStreak, streakAfter);

    let reward = { baseXp: 0, speedModifier: 1, hintModifier: 1, streakModifier: 1, finalXp: 0 };
    if (won) {
      const base = this.rewardEngine.calculate({
        difficulty: word.baseDifficulty,
        responseTimeMs,
        timeLimitMs,
        hintsUsed: session.currentWordHintsUsed,
        streakBefore,
      });
      // Mistakes fold into the hint modifier column (both are "how much
      // help or error did this solve cost") and the product is rounded
      // once, same single-rounding rule as the shared engine.
      const mistakeModifier = Math.pow(HANGMAN_CONFIG.MISTAKE_PENALTY_PER_WRONG_GUESS, wrongCount);
      const hintModifier = base.hintModifier * mistakeModifier;
      reward = {
        baseXp: base.baseXp,
        speedModifier: base.speedModifier,
        hintModifier,
        streakModifier: base.streakModifier,
        finalXp: Math.round(base.baseXp * base.speedModifier * hintModifier * base.streakModifier),
      };
    }

    const aliQuickReaction = quickAliReaction(won);
    const aliQuickExpression = quickAliExpression(won);

    const wordIndex = session.currentIndex;
    const isLastWord = wordIndex + 1 >= session.wordsTotal;
    const aliEvents: AliEvent[] = [];

    const { correctCount } = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        try {
          await tx.arcadeAnswer.create({
            data: {
              sessionId,
              wordIndex,
              wordId: word.id,
              submittedAnswer: guesses.join(''),
              isCorrect: won,
              hintsUsed: session.currentWordHintsUsed,
              timedOut: false,
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
          if (isUniqueConstraintError(err)) {
            throw new ConflictException('This word was already finished');
          }
          throw err;
        }

        const claimed = await tx.arcadeGameSession.updateMany({
          where: {
            id: sessionId,
            currentIndex: wordIndex,
            currentWordGuessCount: session.currentWordGuessCount,
          },
          data: {
            currentIndex: { increment: 1 },
            currentStreak: streakAfter,
            longestStreak: newLongestStreak,
            totalXpAwarded: { increment: reward.finalXp },
            currentWordStartedAt: new Date(),
            currentWordHintsUsed: 0,
            currentWordGuesses: [],
            currentWordGuessCount: 0,
            ...(isLastWord ? { status: 'COMPLETED' as const, endedAt: new Date() } : {}),
          },
        });
        if (claimed.count === 0) throw new ConflictException('That move was already made');

        if (won) {
          await this.progression.awardXp(
            userId,
            reward.finalXp,
            'ARCADE_HANGMAN_ANSWER',
            'arcade',
            `${sessionId}:${wordIndex}`,
            tx,
          );
        }

        const solved = await tx.arcadeAnswer.count({ where: { sessionId, isCorrect: true } });

        if (isLastWord && ARCADE_COUNTS_TOWARD_DAILY_STREAK) {
          await this.progression.recordDailyActivity(userId, tx, aliEvents);
        }
        return { correctCount: solved };
      },
    );

    let nextChallenge: HangmanChallengeView | null = null;
    if (!isLastWord) {
      const refreshed = await this.prisma.arcadeGameSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      nextChallenge = await this.buildChallengeView(refreshed, variant);
    }

    let streakReaction: AliDisplayMessage | null = null;
    let deferredAliReactions: AliDisplayMessage[] = [];
    if (isLastWord) {
      await Promise.all(
        aliEvents.map(async (event) => {
          try {
            streakReaction = toAliDisplayMessage(await this.ali.react(userId, event));
          } catch {
            // Best-effort: an ALI failure never undoes committed progress.
          }
        }),
      );
      try {
        deferredAliReactions = await this.ali.listReactionsSince(
          userId,
          session.startedAt,
          AliService.DEFERRED_REACTION_EVENT_TYPES,
        );
      } catch {
        // The results screen just shows no recap this time.
      }
    }

    // A head-to-head play counts only once the player has played it to the
    // end: dropping out midway never uses up one of the day's plays. The
    // match is already committed, so this is recorded, never refused.
    let playLimit: ArcadePlayNotice | undefined;
    if (isLastWord && session.versusMatchId) {
      playLimit = await this.playLimit
        .consumePlay(userId, 'HANGMAN', { force: true })
        .catch(() => undefined);
    }

    return {
      outcome: won ? 'WON' : 'LOST',
      correctAnswer: renderedText,
      xpAwarded: reward.finalXp,
      currentStreak: streakAfter,
      longestStreak: newLongestStreak,
      sessionComplete: isLastWord,
      playLimit,
      totalXpAwarded: session.totalXpAwarded + reward.finalXp,
      correctCount,
      wordsTotal: session.wordsTotal,
      nextChallenge,
      meaning: {
        definition: word.definition,
        partOfSpeech: word.partOfSpeech,
        synonyms: word.synonyms,
      },
      streakReaction,
      deferredAliReactions,
      aliQuickReaction,
      aliQuickExpression,
    };
  }

  private async loadActiveSession(
    userId: string,
    sessionId: string,
  ): Promise<ArcadeGameSessionRow> {
    const session = await this.prisma.arcadeGameSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Hangman session not found');
    if (session.userId !== userId) throw new ForbiddenException('Not your Hangman session');
    if (session.game !== 'HANGMAN') {
      throw new BadRequestException('This session is not a Hangman session');
    }
    if (session.status !== 'ACTIVE') {
      throw new BadRequestException('This Hangman session has already ended');
    }
    return session;
  }

  private currentWord(session: Pick<ArcadeGameSessionRow, 'wordIds' | 'currentIndex'>) {
    return this.prisma.word.findUniqueOrThrow({
      where: { id: session.wordIds[session.currentIndex] },
    });
  }

  private async buildChallengeView(
    session: ArcadeGameSessionRow,
    variant: 'US' | 'UK' | null,
  ): Promise<HangmanChallengeView> {
    const word = await this.currentWord(session);
    const rendered = renderWord(word, variant);
    return this.viewFromParts(
      session,
      rendered.text,
      word,
      session.currentWordGuesses,
      session.currentStreak,
      session.longestStreak,
    );
  }

  private viewFromParts(
    session: ArcadeGameSessionRow,
    renderedText: string,
    word: Pick<Prisma.WordGetPayload<Record<string, never>>, 'definition' | 'synonyms'>,
    guesses: string[],
    currentStreak: number,
    longestStreak: number,
  ): HangmanChallengeView {
    const state = evaluateGuesses(renderedText, guesses, HANGMAN_CONFIG.MAX_WRONG_GUESSES);
    // Hints used: the session counter for an in-progress word; the count
    // is only needed to size "hintsRemaining", so for a just-finished
    // word (counter already reset) it simply reads as the full budget.
    const hintsUsed = Math.min(session.currentWordHintsUsed, HANGMAN_CONFIG.MAX_HINTS_PER_WORD);
    return {
      sessionId: session.id,
      wordIndex: session.currentIndex,
      wordsTotal: session.wordsTotal,
      pattern: state.pattern,
      wordLength: renderedText.length,
      guessedLetters: guesses,
      wrongLetters: state.wrongLetters,
      wrongCount: state.wrongCount,
      maxWrong: HANGMAN_CONFIG.MAX_WRONG_GUESSES,
      definition: word.definition,
      synonyms: word.synonyms,
      hintsRemaining: HANGMAN_CONFIG.MAX_HINTS_PER_WORD - hintsUsed,
      maxHints: HANGMAN_CONFIG.MAX_HINTS_PER_WORD,
      currentStreak,
      longestStreak,
    };
  }
}
