import {
  BadRequestException,
  ConflictException,
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
import {
  ARCADE_COUNTS_TOWARD_DAILY_STREAK,
  WORD_DUEL_CONFIG,
  WORD_DUEL_TIEBREAK_DESCRIPTION,
} from '../config/arcade.config';

/** Client-safe view of the opponent's progress — score only, never their
 * current word or answers (spec §6/§8). */
export interface WordDuelOpponentView {
  correctCount: number;
  totalXp: number;
}

/** Client-safe view of this player's current word — a letter-by-letter
 * display hint, never the target word itself (spec §6/§8). Clues reveal
 * automatically over time (see WORD_DUEL_CONFIG.CLUE_INTERVAL_SECONDS),
 * unlike ScrambleQuest's on-demand hints. */
export interface WordDuelCurrentWordView {
  displayHint: string;
  cluesRevealed: number;
  maxClues: number;
}

export interface WordDuelResultView {
  winnerId: string | null;
  /** null on a genuine draw — never inferred from winnerId being null,
   * since a null winnerId always implies a draw once status is
   * COMPLETED, but this makes the two states unambiguous to a client
   * that doesn't want to duplicate that inference. */
  youWon: boolean | null;
  tieBreakReason: string | null;
}

export interface WordDuelStateView {
  matchId: string;
  status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  /** ISO timestamp — server-authoritative match deadline. null while
   * WAITING (no opponent yet, so no clock is running). */
  matchEndsAt: string | null;
  wordsTotal: number;
  /** This player's own position — players progress independently
   * through the match's shared wordIds (spec §6). */
  wordIndex: number;
  /** null once WAITING, once COMPLETED/ABANDONED, or once this player
   * has exhausted every word in the match's bank before the clock ran
   * out (they just wait for the match to end). */
  current: WordDuelCurrentWordView | null;
  currentStreak: number;
  longestStreak: number;
  correctCount: number;
  totalXp: number;
  /** null only while WAITING (no opponent has joined yet). */
  opponent: WordDuelOpponentView | null;
  /** null until status is COMPLETED. */
  result: WordDuelResultView | null;
}

export interface WordDuelAnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  xpAwarded: number;
  currentStreak: number;
  longestStreak: number;
  state: WordDuelStateView;
}

type WordDuelPlayerStateRow = Prisma.WordDuelPlayerStateGetPayload<Record<string, never>>;
type WordDuelPlayerStateWithAnswers = Prisma.WordDuelPlayerStateGetPayload<{
  include: { answers: true };
}>;

/**
 * Word Duel (spec §6): a two-player real-time match. Unlike ScrambleQuest
 * and Complete It, there is no ArcadeGameSession here at all — a match
 * has no single "owner" (schema comment above WordDuelMatch), so it's
 * modeled with its own tables and its own service.
 *
 * No WebSocket gateway yet — see the note in this file's accompanying
 * commit/PR. This service is the transport-agnostic core (matchmaking,
 * scoring, lifecycle); a REST controller fronts it for now. Everything
 * here is written so a future gateway can call the exact same methods.
 *
 * Matchmaking is DB-backed rather than an in-memory queue (spec §3's
 * "reuse existing infrastructure" ethos, same reasoning ArcadeChallengeService's
 * doc comment gives for reusing WordsService): a WAITING WordDuelMatch
 * IS the queue entry, survives a server restart, and needs no separate
 * presence system. Claiming a WAITING match (becoming player 2) uses the
 * same compare-and-swap pattern as every other Arcade CAS guard in this
 * codebase (QuestsService.claimStageTransition, ArcadeGameSession's
 * currentIndex claim): `updateMany` gated on status still being WAITING,
 * so two players racing to join the same match can't both succeed.
 */
@Injectable()
export class WordDuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ArcadeChallengeService,
    private readonly rewardEngine: RewardEngineService,
    private readonly progression: ProgressionService,
  ) {}

  /**
   * Joins matchmaking: resumes an in-progress match (WAITING or ACTIVE)
   * if this player already has one, claims a waiting opponent's match if
   * one is available, or starts a fresh WAITING match otherwise. A stale
   * WAITING match (this player's own, past MATCHMAKING_TIMEOUT_SECONDS
   * with no opponent) is abandoned first, mirroring ScrambleQuestService.
   * start()'s stale-session handling exactly.
   */
  async joinQueue(userId: string): Promise<WordDuelStateView> {
    const existing = await this.prisma.wordDuelPlayerState.findFirst({
      where: { userId, match: { status: { in: ['WAITING', 'ACTIVE'] } } },
    });

    if (existing) {
      const match = await this.prisma.wordDuelMatch.findUniqueOrThrow({
        where: { id: existing.matchId },
      });
      if (match.status === 'ACTIVE') {
        return this.buildStateView(existing.id);
      }
      if (!this.isStaleWaitingMatch(match.createdAt)) {
        return this.buildStateView(existing.id);
      }
      await this.prisma.wordDuelMatch.updateMany({
        where: { id: match.id, status: 'WAITING' },
        data: { status: 'ABANDONED' },
      });
      // Falls through to matchmaking below with a clean slate.
    }

    // Try to claim a waiting opponent's match — a few bounded attempts
    // so losing one race (someone else claimed the same candidate first)
    // doesn't give up immediately.
    for (let attempt = 0; attempt < 3; attempt++) {
      const cutoff = new Date(Date.now() - WORD_DUEL_CONFIG.MATCHMAKING_TIMEOUT_SECONDS * 1000);
      const candidate = await this.prisma.wordDuelMatch.findFirst({
        where: { status: 'WAITING', createdAt: { gte: cutoff }, players: { none: { userId } } },
        orderBy: { createdAt: 'asc' },
      });
      if (!candidate) break;

      const now = new Date();
      const endsAt = new Date(now.getTime() + WORD_DUEL_CONFIG.MATCH_DURATION_MINUTES * 60_000);
      const claimed = await this.prisma.wordDuelMatch.updateMany({
        where: { id: candidate.id, status: 'WAITING' },
        data: { status: 'ACTIVE', startedAt: now, endsAt },
      });
      if (claimed.count === 0) continue; // lost the race — try the next candidate

      const playerState = await this.prisma.wordDuelPlayerState.create({
        data: { matchId: candidate.id, userId },
      });
      return this.buildStateView(playerState.id);
    }

    // No opponent available right now — become player 1 of a fresh match.
    const picked = await this.challenges.pickChallenges(userId, WORD_DUEL_CONFIG.WORDS_PER_MATCH);
    if (picked.length === 0) {
      throw new BadRequestException('No words are available for Word Duel right now.');
    }
    const match = await this.prisma.wordDuelMatch.create({
      data: { wordIds: picked.map((c) => c.word.id) },
    });
    const playerState = await this.prisma.wordDuelPlayerState.create({
      data: { matchId: match.id, userId },
    });
    return this.buildStateView(playerState.id);
  }

  /** Refreshes this player's view without submitting anything — what a
   * polling client calls to pick up the opponent joining, clues
   * revealing over time, or the match ending. */
  async getState(userId: string, matchId: string): Promise<WordDuelStateView> {
    const playerState = await this.prisma.wordDuelPlayerState.findFirst({
      where: { matchId, userId },
    });
    if (!playerState) throw new NotFoundException('Word Duel match not found');
    return this.buildStateView(playerState.id);
  }

  async submitAnswer(
    userId: string,
    matchId: string,
    rawAnswer: string,
  ): Promise<WordDuelAnswerResult> {
    const playerState = await this.loadActivePlayerState(userId, matchId);
    const word = await this.currentWord(playerState);

    // Server-authoritative timing (spec §6/§11) — always computed from
    // the server-recorded currentWordStartedAt, never a client-reported
    // elapsed time. There is no per-word timeout here (see
    // WORD_TIME_REFERENCE_SECONDS's doc comment) — only the match-wide
    // endsAt cuts a player off, checked by finalizeIfNeeded below.
    const responseTimeMs = Date.now() - playerState.currentWordStartedAt.getTime();
    const isCorrect = normalizeAnswer(rawAnswer) === word.normalizedWord;

    const streakBefore = playerState.currentStreak;
    const streakAfter = nextStreak(streakBefore, { isCorrect, timedOut: false });
    const newLongestStreak = Math.max(playerState.longestStreak, streakAfter);

    let reward = { baseXp: 0, speedModifier: 1, hintModifier: 1, streakModifier: 1, finalXp: 0 };
    if (isCorrect) {
      reward = this.rewardEngine.calculate({
        difficulty: word.baseDifficulty,
        responseTimeMs,
        timeLimitMs: WORD_DUEL_CONFIG.WORD_TIME_REFERENCE_SECONDS * 1000,
        // Word Duel's clues are audit-only, not a scoring input —
        // WordDuelAnswer has no hintModifier column at all (unlike
        // ArcadeAnswer), which is the schema's own signal that clues
        // shown over time were never meant to cost XP here; the
        // competitive pressure of racing an opponent is the "penalty".
        hintsUsed: 0,
        streakBefore,
      });
    }

    const maxClues = this.maxCluesFor(word.word);
    const cluesRevealed = this.computeCluesRevealed(playerState.currentWordStartedAt, maxClues);
    const wordIndex = playerState.currentIndex;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      try {
        await tx.wordDuelAnswer.create({
          data: {
            matchId,
            playerStateId: playerState.id,
            wordIndex,
            wordId: word.id,
            submittedAnswer: rawAnswer,
            isCorrect,
            cluesRevealed,
            baseXp: reward.baseXp,
            speedModifier: reward.speedModifier,
            streakModifier: reward.streakModifier,
            finalXpAwarded: reward.finalXp,
            streakBefore,
            streakAfter,
            responseTimeMs,
          },
        });
      } catch (err) {
        // @@unique([playerStateId, wordIndex]) — the idempotency guard
        // (spec §9/§11), same pattern as ArcadeAnswer's.
        if (isUniqueConstraintError(err)) {
          throw new ConflictException('This word was already answered');
        }
        throw err;
      }

      // Claim the player's own advance — before the XP award — so a
      // race loser (double-tap, retried request) aborts cleanly instead
      // of double-awarding. Defense in depth alongside the unique
      // constraint above.
      const claimed = await tx.wordDuelPlayerState.updateMany({
        where: { id: playerState.id, currentIndex: wordIndex },
        data: {
          currentIndex: { increment: 1 },
          currentStreak: streakAfter,
          longestStreak: newLongestStreak,
          totalXp: { increment: reward.finalXp },
          ...(isCorrect ? { correctCount: { increment: 1 } } : {}),
          currentWordStartedAt: new Date(),
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
          'ARCADE_WORD_DUEL_ANSWER',
          'arcade',
          `${matchId}:${playerState.id}:${wordIndex}`,
          tx,
        );
      }
    });

    await this.finalizeIfNeeded(matchId);
    const state = await this.buildStateView(playerState.id);

    return {
      isCorrect,
      correctAnswer: word.word,
      xpAwarded: reward.finalXp,
      currentStreak: streakAfter,
      longestStreak: newLongestStreak,
      state,
    };
  }

  private isStaleWaitingMatch(createdAt: Date): boolean {
    const cutoffMs = Date.now() - WORD_DUEL_CONFIG.MATCHMAKING_TIMEOUT_SECONDS * 1000;
    return createdAt.getTime() < cutoffMs;
  }

  private async loadActivePlayerState(
    userId: string,
    matchId: string,
  ): Promise<WordDuelPlayerStateRow> {
    const playerState = await this.prisma.wordDuelPlayerState.findFirst({
      where: { matchId, userId },
    });
    if (!playerState) throw new NotFoundException('Word Duel match not found');

    const match = await this.prisma.wordDuelMatch.findUniqueOrThrow({ where: { id: matchId } });
    if (match.status !== 'ACTIVE') {
      throw new BadRequestException('This Word Duel match is not active');
    }
    if (playerState.currentIndex >= match.wordIds.length) {
      throw new BadRequestException('You have already answered every word in this match');
    }
    return playerState;
  }

  private async currentWord(playerState: Pick<WordDuelPlayerStateRow, 'matchId' | 'currentIndex'>) {
    const match = await this.prisma.wordDuelMatch.findUniqueOrThrow({
      where: { id: playerState.matchId },
    });
    const wordId = match.wordIds[playerState.currentIndex];
    return this.prisma.word.findUniqueOrThrow({ where: { id: wordId } });
  }

  /** A clue can never reveal the word's final letter — same reasoning as
   * ScrambleQuestService.maxHintsFor: a "clue" that fully solves the
   * word isn't really a clue. */
  private maxCluesFor(word: string): number {
    return Math.min(WORD_DUEL_CONFIG.MAX_CLUES_PER_WORD, Math.max(0, word.length - 1));
  }

  private computeCluesRevealed(currentWordStartedAt: Date, maxClues: number): number {
    const elapsedMs = Date.now() - currentWordStartedAt.getTime();
    const revealed = Math.floor(elapsedMs / (WORD_DUEL_CONFIG.CLUE_INTERVAL_SECONDS * 1000));
    return Math.max(0, Math.min(maxClues, revealed));
  }

  private buildDisplayHint(word: string, cluesRevealed: number): string {
    return Array.from({ length: word.length }, (_, i) =>
      i < cluesRevealed ? word[i].toUpperCase() : '_',
    ).join(' ');
  }

  /**
   * Ends an ACTIVE match once either its server-authoritative deadline
   * has passed or both players have exhausted the word bank — whichever
   * comes first. CAS-guarded (status still ACTIVE) so two players
   * polling/answering at the same moment can't both resolve and award
   * the result twice.
   */
  private async finalizeIfNeeded(matchId: string): Promise<void> {
    const match = await this.prisma.wordDuelMatch.findUnique({
      where: { id: matchId },
      include: { players: { include: { answers: { orderBy: { answeredAt: 'asc' } } } } },
    });
    if (!match || match.status !== 'ACTIVE') return;

    const expired = match.endsAt !== null && Date.now() >= match.endsAt.getTime();
    const bothExhausted =
      match.players.length === 2 &&
      match.players.every((p) => p.currentIndex >= match.wordIds.length);
    if (!expired && !bothExhausted) return;

    const claimed = await this.prisma.wordDuelMatch.updateMany({
      where: { id: matchId, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (claimed.count === 0) return; // someone else already finalized it

    const [a, b] = match.players;
    const resolved =
      a && b
        ? this.resolveWinner(a, b, match.startedAt ?? match.createdAt)
        : { winnerId: null, tieBreakReason: null };

    await this.prisma.wordDuelMatch.update({
      where: { id: matchId },
      data: { winnerId: resolved.winnerId, tieBreakReason: resolved.tieBreakReason },
    });

    // Daily-activity streak counts once, on match completion (both
    // participants) — same "counts once, on completion" semantics as
    // ScrambleQuestService/CompleteItService's session-complete check.
    if (a && b && ARCADE_COUNTS_TOWARD_DAILY_STREAK) {
      await this.progression.recordDailyActivity(a.userId);
      await this.progression.recordDailyActivity(b.userId);
    }
  }

  /**
   * WORD_DUEL_TIEBREAK_DESCRIPTION ('most_correct_answers_then_earliest_
   * final_score'): most correct answers wins outright; if tied, whoever
   * reached their own final total XP earliest wins — a countback on
   * time, not on the size of that final total. "Reached their final
   * total" is the timestamp of their last correct answer (the last
   * moment their total actually changed); a player with zero correct
   * answers never changed their total from its starting value of 0, so
   * they're deemed to have "reached" it at the match's own start.
   */
  private resolveWinner(
    a: WordDuelPlayerStateWithAnswers,
    b: WordDuelPlayerStateWithAnswers,
    matchStartedAt: Date,
  ): { winnerId: string | null; tieBreakReason: string | null } {
    if (a.correctCount !== b.correctCount) {
      return {
        winnerId: a.correctCount > b.correctCount ? a.userId : b.userId,
        tieBreakReason: null,
      };
    }

    const aReachedAt = this.reachedFinalTotalAt(a, matchStartedAt);
    const bReachedAt = this.reachedFinalTotalAt(b, matchStartedAt);

    if (aReachedAt.getTime() === bReachedAt.getTime()) {
      return { winnerId: null, tieBreakReason: WORD_DUEL_TIEBREAK_DESCRIPTION };
    }
    return {
      winnerId: aReachedAt.getTime() < bReachedAt.getTime() ? a.userId : b.userId,
      tieBreakReason: WORD_DUEL_TIEBREAK_DESCRIPTION,
    };
  }

  private reachedFinalTotalAt(player: WordDuelPlayerStateWithAnswers, matchStartedAt: Date): Date {
    const corrects = player.answers.filter((a) => a.isCorrect);
    if (corrects.length === 0) return matchStartedAt;
    return corrects[corrects.length - 1].answeredAt;
  }

  private async buildStateView(playerStateId: string): Promise<WordDuelStateView> {
    let playerState = await this.prisma.wordDuelPlayerState.findUniqueOrThrow({
      where: { id: playerStateId },
      include: { match: { include: { players: true } } },
    });

    if (
      playerState.match.status === 'WAITING' &&
      this.isStaleWaitingMatch(playerState.match.createdAt)
    ) {
      await this.prisma.wordDuelMatch.updateMany({
        where: { id: playerState.matchId, status: 'WAITING' },
        data: { status: 'ABANDONED' },
      });
    } else {
      await this.finalizeIfNeeded(playerState.matchId);
    }

    // Re-fetch — either branch above may have changed match.status.
    playerState = await this.prisma.wordDuelPlayerState.findUniqueOrThrow({
      where: { id: playerStateId },
      include: { match: { include: { players: true } } },
    });

    const opponentRow = playerState.match.players.find((p) => p.id !== playerState.id) ?? null;

    let current: WordDuelCurrentWordView | null = null;
    if (
      playerState.match.status === 'ACTIVE' &&
      playerState.currentIndex < playerState.match.wordIds.length
    ) {
      const word = await this.prisma.word.findUniqueOrThrow({
        where: { id: playerState.match.wordIds[playerState.currentIndex] },
      });
      const maxClues = this.maxCluesFor(word.word);
      const cluesRevealed = this.computeCluesRevealed(playerState.currentWordStartedAt, maxClues);
      current = {
        displayHint: this.buildDisplayHint(word.word, cluesRevealed),
        cluesRevealed,
        maxClues,
      };
    }

    let result: WordDuelResultView | null = null;
    if (playerState.match.status === 'COMPLETED') {
      const winnerId = playerState.match.winnerId;
      result = {
        winnerId,
        youWon: winnerId === null ? null : winnerId === playerState.userId,
        tieBreakReason: playerState.match.tieBreakReason,
      };
    }

    return {
      matchId: playerState.matchId,
      status: playerState.match.status,
      matchEndsAt: playerState.match.endsAt?.toISOString() ?? null,
      wordsTotal: playerState.match.wordIds.length,
      wordIndex: playerState.currentIndex,
      current,
      currentStreak: playerState.currentStreak,
      longestStreak: playerState.longestStreak,
      correctCount: playerState.correctCount,
      totalXp: playerState.totalXp,
      opponent: opponentRow
        ? { correctCount: opponentRow.correctCount, totalXp: opponentRow.totalXp }
        : null,
      result,
    };
  }
}
