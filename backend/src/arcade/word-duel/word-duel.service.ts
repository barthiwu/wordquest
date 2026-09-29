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
import { renderWord } from '../../vocabulary/english-variant';
import { resolveEnglishVariant } from '../../vocabulary/resolve-english-variant';
import { blankSentence, isCompleteItSentenceUsable } from '../complete-it/complete-it.util';
import { shuffleIndexes } from '../scramble-quest/scramble.util';
import { FriendsService } from '../../friends/friends.service';
import { AliService, type AliDisplayMessage, type AliFeedMessage } from '../../ali/ali.service';
import { quickAliReaction } from '../../ali/ali-quick-reactions';
import { quickAliExpression, type AliExpressionCue } from '../../ali/ali-expression';

/** Client-safe view of the opponent's progress — score only, never their
 * current word or answers (spec §6/§8). Identity (userId/username/
 * avatarUrl) is populated as soon as an opponent has actually joined the
 * match (ACTIVE or COMPLETED) -- 2026-09-29, Barth: "display the username
 * of the two players facing off" while the duel is live, not just on the
 * post-match result. (Previously these three fields were withheld until
 * COMPLETED -- 2026-09 decision backing the avatar-tap "Profile / Add
 * Friend / Block" popup there; that popup still only appears on the
 * result screen, this just also surfaces the plain username live.) Still
 * always absent while WAITING (no opponent to identify yet). */
export interface WordDuelOpponentView {
  correctCount: number;
  totalXp: number;
  userId?: string;
  username?: string;
  avatarUrl?: string | null;
}

/** One of this player's current word's five clues, in fixed reveal
 * order (spec revision, 2026-09-30 Barth: "This makes it more like a
 * game, and less like an exam hall" -- supersedes the 2026-09-29
 * synonym+hint two-clue design):
 *   1. CATEGORY   -- the word's `category` field (e.g. "Nature").
 *   2. SYNONYM    -- the word's first recorded synonym.
 *   3. FIRST_LAST -- reveals the word's first and last letter (see
 *      `displayHint`); `text` is always null, same "the letters ARE the
 *      clue" shape HINT used to have.
 *   4. EXAMPLE    -- the word's own example sentence, with the target
 *      word itself blanked out (reused from Complete It's own
 *      `blankSentence`) so this clue gives context without just
 *      stating the answer.
 *   5. LETTERS    -- reveals LETTERS_CLUE_LETTER_FRACTION (60%) of the
 *      word's letters at once, chosen deterministically-at-random and
 *      always including the two positions FIRST_LAST already revealed
 *      (see `displayHint`); `text` is always null, same reasoning as
 *      FIRST_LAST.
 * `text` is null both for the two letter-reveal clues above (their
 * effect is `displayHint` changing instead) AND whenever a word
 * genuinely has no data for that slot (e.g. no synonym recorded, or no
 * category assigned) -- the client renders a "not available" fallback
 * for that case, same convention the old SYNONYM clue already used.
 * (ORIGIN/etymology briefly existed as a clue type in this file's
 * history and was removed 2026-09-29 -- the vocabulary corpus had zero
 * origin/etymology data for any word.) */
export interface WordDuelClueView {
  type: 'CATEGORY' | 'SYNONYM' | 'FIRST_LAST' | 'EXAMPLE' | 'LETTERS';
  text: string | null;
}

/** Client-safe view of this player's current word — a letter-by-letter
 * display hint, never the target word itself (spec §6/§8), plus the
 * word's meaning (always shown, never gated -- 2026-09-29, Barth: "The
 * meaning of the word is supposed to appear normally") and whichever of
 * its two clues this player has revealed so far. Clues are player-
 * triggered (WordDuelService.requestClue), not revealed automatically
 * over time — unlike the old behavior, matching ScrambleQuest's on-
 * demand hints/Quests' on-demand synonym reveal. */
export interface WordDuelCurrentWordView {
  /** The word's dictionary definition — always visible, not a clue
   * (2026-09-29 spec, still true). */
  meaning: string;
  /** The word's letter count — always visible alongside `meaning`, same
   * "shown when a new word drops, never gated behind a clue" treatment
   * (2026-09-30 spec: "total letters in the word would always show").
   * Matches `displayHint`'s own letter count (both derive from the same
   * variant-rendered word text). */
  wordLength: number;
  /** Underscore-blanked letter positions, space-separated; only changes
   * once the FIRST_LAST clue (3rd) and/or LETTERS clue (5th/last) have
   * been revealed — see WordDuelClueView's doc comment for what each
   * one reveals. */
  displayHint: string;
  cluesRevealed: number;
  maxClues: number;
  /** One entry per clue revealed so far, oldest first — length always
   * equals cluesRevealed. */
  clues: WordDuelClueView[];
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
  /**
   * Populated once status is COMPLETED (task #99 follow-up): any
   * STREAK_MILESTONE reaction generated by THIS player's recordDailyActivity
   * call in finalizeIfNeeded. Word Duel has no in-play streak-container
   * UI to pop it out of live (unlike ScrambleQuest/Complete It), so it
   * surfaces here on the result view instead, alongside
   * deferredAliReactions — both read back via AliService.listReactionsSince
   * rather than shown mid-match. null before COMPLETED, and null even
   * after when no milestone was hit.
   */
  streakReaction: AliDisplayMessage | null;
  /**
   * Populated once status is COMPLETED: any LEVEL_UP/JOURNEY_COMPLETION/
   * MASTERY_EVENT/ACHIEVEMENT_UNLOCK reaction this player's match
   * triggered (still fire-and-forget throughout — see
   * finalizeIfNeeded). Always [] before COMPLETED.
   */
  deferredAliReactions: AliDisplayMessage[];
}

export interface WordDuelAnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  xpAwarded: number;
  currentStreak: number;
  longestStreak: number;
  state: WordDuelStateView;
  /**
   * A short, zero-cost ALI reaction to this specific answer (task #100
   * follow-up — same per-answer treatment Daily Quest/Boss Battle
   * already have, brought to Word Duel). Never null here -- unlike
   * ScrambleQuest/Complete It, a Word Duel answer has no per-word
   * timeout (see submitAnswer's own doc comment on WORD_TIME_REFERENCE_SECONDS).
   */
  aliQuickReaction: string;
  /** The visual pairing for aliQuickReaction — see ali-expression.ts's quickAliExpression. */
  aliQuickExpression: AliExpressionCue;
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
    private readonly friends: FriendsService,
    private readonly ali: AliService,
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
    // doesn't give up immediately. A blocked-either-way candidate (2026-09
    // Friends/Block feature) is skipped the same way a lost race is —
    // never claimed, never surfaced to this player — rather than treated
    // as a hard failure, so a blocked pairing just falls through to the
    // next candidate or, having none, a fresh match of this player's own.
    const excludedMatchIds: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const cutoff = new Date(Date.now() - WORD_DUEL_CONFIG.MATCHMAKING_TIMEOUT_SECONDS * 1000);
      const candidate = await this.prisma.wordDuelMatch.findFirst({
        where: {
          status: 'WAITING',
          createdAt: { gte: cutoff },
          players: { none: { userId } },
          ...(excludedMatchIds.length > 0 ? { id: { notIn: excludedMatchIds } } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!candidate) break;

      const waitingPlayer = await this.prisma.wordDuelPlayerState.findFirst({
        where: { matchId: candidate.id },
        select: { userId: true },
      });
      if (waitingPlayer && (await this.friends.areBlocked(userId, waitingPlayer.userId))) {
        excludedMatchIds.push(candidate.id);
        continue;
      }

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
    const picked = await this.challenges.pickChallenges(
      userId,
      WORD_DUEL_CONFIG.WORDS_PER_MATCH,
      [],
      WORD_DUEL_CONFIG.MIN_WORD_LENGTH,
      // The EXAMPLE clue (2026-09-30 spec) blanks the word out of its
      // own example sentence -- same content-quality gate Complete It
      // already applies to its own sentence-completion pool, reused
      // here so Word Duel never picks a word whose only sentence is a
      // bad whole-word match or an unusably terse fragment.
      (c) => isCompleteItSentenceUsable(c.word.exampleSentence, c.word.word),
    );
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
    const variant = await resolveEnglishVariant(this.prisma, userId);
    const rendered = renderWord(word, variant);

    // Server-authoritative timing (spec §6/§11) — always computed from
    // the server-recorded currentWordStartedAt, never a client-reported
    // elapsed time. There is no per-word timeout here (see
    // WORD_TIME_REFERENCE_SECONDS's doc comment) — only the match-wide
    // endsAt cuts a player off, checked by finalizeIfNeeded below.
    const responseTimeMs = Date.now() - playerState.currentWordStartedAt.getTime();
    // Compared against the RENDERED (variant-aware) form -- a US-
    // preference player answering "color" must be marked correct for a
    // word whose UK-authored answer is "colour" (2026-09 fairness
    // feature). Both players in a match are matched on the same
    // underlying Word row/id regardless of spelling variant, so this is
    // the only change multiplayer fairness needed here.
    const isCorrect = normalizeAnswer(rawAnswer) === rendered.normalizedText;
    const aliQuickReaction = quickAliReaction(isCorrect);
    const aliQuickExpression = quickAliExpression(isCorrect);

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

    // Audit value only -- how many of THIS word's clues this player
    // actually revealed before answering it, read straight off the
    // persisted, player-triggered counter (requestClue), not
    // recomputed from elapsed time.
    const cluesRevealed = playerState.currentWordCluesRevealed;
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
          // New word, new clue budget -- same reset as currentWordStartedAt.
          currentWordCluesRevealed: 0,
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
      correctAnswer: rendered.text,
      xpAwarded: reward.finalXp,
      currentStreak: streakAfter,
      longestStreak: newLongestStreak,
      state,
      aliQuickReaction,
      aliQuickExpression,
    };
  }

  /**
   * Reveals this player's next clue on their current word (spec,
   * 2026-09-29 Barth: player-triggered, via a "Clues" button -- see
   * WordDuelCurrentWordView's doc comment for why this replaced the old
   * automatic time-based reveal). Same CAS-guarded "read the exact
   * count, updateMany gated on it still matching" shape as
   * ScrambleQuestService.requestHint, so a raced double-tap can't grant
   * two clues for one tap. Returns the full state view (like
   * getState/joinQueue) rather than a delta, since the mobile screen
   * already knows how to apply a WordDuelStateView wholesale.
   */
  async requestClue(userId: string, matchId: string): Promise<WordDuelStateView> {
    const playerState = await this.loadActivePlayerState(userId, matchId);
    const maxClues = this.maxCluesFor();

    if (playerState.currentWordCluesRevealed >= maxClues) {
      throw new BadRequestException(`No clues remaining (max ${maxClues}).`);
    }

    const claimed = await this.prisma.wordDuelPlayerState.updateMany({
      where: { id: playerState.id, currentWordCluesRevealed: playerState.currentWordCluesRevealed },
      data: { currentWordCluesRevealed: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This clue was already requested');
    }

    return this.buildStateView(playerState.id);
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

  /** Always exactly MAX_CLUES_PER_WORD (5, as of the 2026-09-30 clue
   * redesign) -- clue count never depends on the word's own length. */
  private maxCluesFor(): number {
    return WORD_DUEL_CONFIG.MAX_CLUES_PER_WORD;
  }

  /**
   * Which letter positions of `word` are currently revealed, given how
   * many clues this player has requested so far (2026-09-30 spec) --
   * shared by `buildDisplayHint` and `buildStateView`'s wordLength.
   * Two clues affect this:
   *  - FIRST_LAST (the 3rd clue, cluesRevealed >= 3): reveals position
   *    0 and the final position.
   *  - LETTERS (the 5th/last clue, cluesRevealed >= 5): reveals
   *    LETTERS_CLUE_LETTER_FRACTION (60%) of the word's letters in
   *    total, ALWAYS including the two FIRST_LAST already revealed,
   *    topped up with a deterministic-random selection from the
   *    remaining interior positions -- `seed` (playerStateId + the
   *    word's slot in the match) makes that selection reproducible
   *    across repeated polling, same idea as ScrambleQuest's
   *    hintRevealOrder/shuffleIndexes seeding.
   */
  private revealedLetterPositions(word: string, cluesRevealed: number, seed: string): number[] {
    const positions = new Set<number>();
    if (cluesRevealed >= 3) {
      positions.add(0);
      positions.add(word.length - 1);
    }
    if (cluesRevealed >= 5) {
      const targetCount = Math.max(
        2,
        Math.round(word.length * WORD_DUEL_CONFIG.LETTERS_CLUE_LETTER_FRACTION),
      );
      const interior = Array.from({ length: word.length }, (_, i) => i).filter(
        (i) => i !== 0 && i !== word.length - 1,
      );
      const shuffled = shuffleIndexes(interior, seed);
      const extraNeeded = Math.max(0, targetCount - positions.size);
      shuffled.slice(0, extraNeeded).forEach((i) => positions.add(i));
    }
    return Array.from(positions);
  }

  /** Blank/reveal row shown under the puzzle -- see
   * `revealedLetterPositions` for exactly which positions are shown at
   * a given cluesRevealed count; every other position stays blank. */
  private buildDisplayHint(word: string, cluesRevealed: number, seed: string): string {
    const revealed = new Set(this.revealedLetterPositions(word, cluesRevealed, seed));
    return Array.from({ length: word.length }, (_, i) =>
      revealed.has(i) ? word[i].toUpperCase() : '_',
    ).join(' ');
  }

  /**
   * Resolves the content of the Nth clue (0-indexed), 2026-09-30 spec
   * order per Barth ("This makes it more like a game, and less like an
   * exam hall" -- supersedes the 2026-09-29 synonym+hint two-clue
   * design, see this file's git history for that one):
   *   0 = CATEGORY, 1 = SYNONYM, 2 = FIRST_LAST, 3 = EXAMPLE, 4 = LETTERS.
   * `text` is null when this word has nothing to show for that slot
   * (CATEGORY/SYNONYM: not recorded for this word -- rare but possible
   * in the corpus) or when the clue's effect is `displayHint` changing
   * instead of a string (FIRST_LAST, LETTERS -- see WordDuelClueView's
   * doc comment). `exampleSentenceWithBlank` is precomputed by the
   * caller (buildStateView) since it needs the variant-rendered
   * sentence/word, which this method doesn't have on its own.
   */
  private resolveClue(
    index: number,
    word: { category: string | null; synonyms: string[] },
    exampleSentenceWithBlank: string,
  ): WordDuelClueView {
    switch (index) {
      case 0:
        return { type: 'CATEGORY', text: word.category ?? null };
      case 1:
        return { type: 'SYNONYM', text: word.synonyms[0] ?? null };
      case 2:
        return { type: 'FIRST_LAST', text: null };
      case 3:
        return { type: 'EXAMPLE', text: exampleSentenceWithBlank };
      default:
        return { type: 'LETTERS', text: null };
    }
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
      // Resolved from playerState.userId, THIS player's own id -- the
      // opponent may have a different preference and sees their own
      // buildStateView call rendered by theirs. Both players are always
      // clued on the same underlying Word row (2026-09 fairness
      // feature; see submitAnswer's own note), just possibly spelled
      // differently.
      const variant = await resolveEnglishVariant(this.prisma, playerState.userId);
      const rendered = renderWord(word, variant);
      const maxClues = this.maxCluesFor();
      const cluesRevealed = Math.min(maxClues, playerState.currentWordCluesRevealed);
      // Seeded on this player's own slot in the match (their
      // playerStateId) plus the word's index within it, so the LETTERS
      // clue's random-but-not-first/last letter selection is stable
      // across repeated polling for THIS player, without needing to
      // persist which positions were chosen -- same seeding idea as
      // ScrambleQuest/Complete It's own hintRevealOrder/shuffleIndexes
      // callers.
      const seed = `${playerState.id}:${playerState.currentIndex}`;
      const { sentenceWithBlank } = blankSentence(rendered.sentence, rendered.text);
      const clues = Array.from({ length: cluesRevealed }, (_, i) =>
        this.resolveClue(i, word, sentenceWithBlank),
      );
      current = {
        meaning: word.definition,
        wordLength: rendered.text.length,
        displayHint: this.buildDisplayHint(rendered.text, cluesRevealed, seed),
        cluesRevealed,
        maxClues,
        clues,
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

    // Identity is resolved as soon as an opponent has actually joined
    // the match (ACTIVE or COMPLETED -- opponentRow is only ever
    // non-null then; see WordDuelOpponentView's doc comment for the
    // 2026-09-29 change from "COMPLETED only"). FriendsService.
    // getPublicIdentity is reused rather than a separate User lookup
    // here so this follows the same "username is the only identity
    // other players see" shape (FriendPublicView) every other
    // public-facing surface uses.
    const opponentIdentity = opponentRow
      ? await this.friends.getPublicIdentity(opponentRow.userId)
      : null;

    // Read back rather than resolved live -- see WordDuelStateView's
    // streakReaction/deferredAliReactions doc comments for why (no
    // in-play streak container to anchor a live popup to, and this
    // method is polled by both players regardless of which one's
    // finalizeIfNeeded call actually ran the awards). Best-effort: a
    // failure here just means the result view doesn't show a recap.
    let streakReaction: AliDisplayMessage | null = null;
    let deferredAliReactions: AliDisplayMessage[] = [];
    if (playerState.match.status === 'COMPLETED') {
      try {
        const since = playerState.match.startedAt ?? playerState.match.createdAt;
        const reactions: AliFeedMessage[] = await this.ali.listReactionsSince(
          playerState.userId,
          since,
          ['STREAK_MILESTONE', ...AliService.DEFERRED_REACTION_EVENT_TYPES],
        );
        streakReaction = reactions.find((r) => r.eventType === 'STREAK_MILESTONE') ?? null;
        deferredAliReactions = reactions.filter((r) => r.eventType !== 'STREAK_MILESTONE');
      } catch {
        // Dropped -- see the comment above.
      }
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
        ? {
            correctCount: opponentRow.correctCount,
            totalXp: opponentRow.totalXp,
            ...(opponentIdentity
              ? {
                  userId: opponentIdentity.userId,
                  username: opponentIdentity.username,
                  avatarUrl: opponentIdentity.avatarUrl,
                }
              : {}),
          }
        : null,
      result,
      streakReaction,
      deferredAliReactions,
    };
  }
}
