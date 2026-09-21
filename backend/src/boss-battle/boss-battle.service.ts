import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../vocabulary/words.service';
import { MasteryService } from '../mastery/mastery.service';
import { ProgressionService } from '../progression/progression.service';
import { AchievementService } from '../achievement/achievement.service';
import { AliService } from '../ali/ali.service';
import { NotificationService } from '../notifications/notification.service';
import { generateOmissionChallenge } from '../vocabulary/omission-engine';
import { gameplayRules, bossBattleRewardForRank } from '../config/gameplay-rules';
import { deriveStatus, nextBattleWindow, type BossBattleStatus } from './battle-schedule';
import { isUniqueConstraintError } from '../common/prisma-errors';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { QuestCardService } from '../quest-card/quest-card.service';
import { JOURNEY_STAGES } from '../config/journey-stages';
import { quickAliReaction } from '../ali/ali-quick-reactions';
import { AnalyticsService } from '../analytics/analytics.service';

type Db = PrismaService | Prisma.TransactionClient;
const GROUP_SIZE = 20;

/** Internal-only sentinel for claimGroupSlot's retry loop — never escapes this service. */
class GroupFullRaceError extends Error {}

export interface BattleChallengeView {
  groupId: string;
  /** ISO timestamp — server-authoritative; the client uses this only to render a countdown, never to decide anything itself (spec §4/§21). */
  battleEndsAt: string;
  displayPattern: string;
  missingIndexes: number[];
  wordLength: number;
  definition: string;
  partOfSpeech: string;
}

export interface BattleAnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  exampleSentence: string;
  xpAwarded: number;
  battleXp: number;
  battleEnded: boolean;
  nextChallenge: BattleChallengeView | null;
  /** A short, zero-cost ALI reaction to this specific answer (V21 §6) — see ali-quick-reactions.ts. Null once the battle has ended and there's nothing left to react to. */
  aliQuickReaction: string | null;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  /** Null while the battle is still LIVE — no comparative rank is exposed until the group finalizes (Correction & Completion Spec §4). */
  rank: number | null;
  battleXp: number;
  correctAnswers: number;
  incorrectAnswers: number;
  isYou: boolean;
  /**
   * Null while the battle is still LIVE — nothing has been granted yet,
   * so there's nothing honest to show. Populated once the group
   * finalizes (V19 Stabilization Spec §4: "After Completion: Show...
   * Rewards"), for every entry, not just `isYou`, so a finished
   * leaderboard genuinely shows what everyone won.
   */
  rewardXp: number | null;
  rewardGlyphs: number | null;
}

export interface LeaderboardView {
  groupId: string;
  status: BossBattleStatus;
  /**
   * While the group's battle window is SCHEDULED or LIVE, this contains
   * ONLY the requesting player's own entry — a private progress view of
   * their own score/pace, with no other player's name, score, or rank
   * exposed (Correction & Completion Spec §4: Boss Battle keeps live
   * visibility off; a player only sees their own progress mid-battle).
   * Once the group is COMPLETED, this contains the full ranked group.
   */
  entries: LeaderboardEntry[];
}

interface RankablePlayer {
  id: string;
  userId: string;
  battleXp: number;
  correctAnswers: number;
  incorrectAnswers: number;
  lastXpAt: Date | null;
  finalRank: number | null;
  rewardXp?: number;
  rewardGlyphs?: number;
}

interface RankablePlayerWithUser extends RankablePlayer {
  user: { id: string; displayName: string };
}

/**
 * Boss Battle (spec v1.0): a weekly, global, one-hour competitive event.
 * Deliberately reuses the omission engine and MasteryService/
 * ProgressionService exactly as they already work for ordinary quests
 * (spec: "do not duplicate core vocabulary or scoring logic") — this
 * service only adds matchmaking, the battle-scoped XP ledger, and
 * finalization on top of what already exists.
 *
 * Battle/group status is never read from a stored flag when a real
 * decision depends on it — always deriveStatus() against the current
 * server clock (see battle-schedule.ts's doc comment for why).
 */
@Injectable()
export class BossBattleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly words: WordsService,
    private readonly mastery: MasteryService,
    private readonly progression: ProgressionService,
    private readonly achievements: AchievementService,
    private readonly ali: AliService,
    private readonly notifications: NotificationService,
    private readonly idempotency: IdempotencyService,
    private readonly questCards: QuestCardService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Lightweight — for a pre-battle countdown display, no join/eligibility side effects. */
  async getUpcoming(): Promise<{
    weekId: string;
    scheduledStartUtc: string;
    scheduledEndUtc: string;
    status: BossBattleStatus;
  }> {
    const battle = await this.getOrCreateCurrentBattle(new Date());
    return {
      weekId: battle.weekId,
      scheduledStartUtc: battle.scheduledStartUtc.toISOString(),
      scheduledEndUtc: battle.scheduledEndUtc.toISOString(),
      status: deriveStatus(battle.scheduledStartUtc, battle.scheduledEndUtc, new Date()),
    };
  }

  async joinBattle(userId: string): Promise<BattleChallengeView> {
    const now = new Date();
    const battle = await this.getOrCreateCurrentBattle(now);
    const status = deriveStatus(battle.scheduledStartUtc, battle.scheduledEndUtc, now);

    if (status === 'SCHEDULED') {
      throw new BadRequestException(
        `This week's Boss Battle hasn't started yet — it begins ${battle.scheduledStartUtc.toISOString()}.`,
      );
    }
    if (status === 'COMPLETED') {
      throw new BadRequestException("This week's Boss Battle has ended.");
    }

    // Eligibility (spec §14 — explicitly framed as "initial intent",
    // more dimensions anticipated later; minLevelToJoin is the one MVP
    // rule, kept configurable rather than hard-coded into this check).
    const progression = await this.prisma.userProgression.findUniqueOrThrow({ where: { userId } });
    if (progression.level < gameplayRules.bossBattle.minLevelToJoin) {
      throw new ForbiddenException(
        `Reach level ${gameplayRules.bossBattle.minLevelToJoin} to join Boss Battles.`,
      );
    }

    const existing = await this.prisma.bossBattlePlayer.findFirst({
      where: { userId, group: { battleId: battle.id } },
      include: { group: true },
    });
    if (existing) {
      return this.buildChallengeView(existing, existing.group, battle.scheduledEndUtc);
    }

    const { group, player } = await this.claimGroupSlot(battle.id, userId);
    this.analytics.track(userId, 'boss_battle_joined', { battleId: battle.id, groupId: group.id });
    return this.buildChallengeView(player, group, battle.scheduledEndUtc);
  }

  /**
   * Atomically claims one of a group's 20 slots and creates the player
   * row in the same transaction. findOrCreateOpenGroup's own playerCount
   * check happens in a separate, prior read — two joins racing at
   * playerCount=19 could otherwise both pass that check and both create
   * a player, overflowing the group past GROUP_SIZE (Boss Battle
   * Technical Completion, V19 Stabilization Spec §5: "race condition
   * protection"). The conditional `updateMany` here is the real guard,
   * mirroring the same compare-and-swap pattern findOrCreateOpenGroup's
   * own group-creation retry and finalizeGroupIfNeeded already use: if
   * the claim loses the race (the group filled up between our read and
   * our attempt), we retry from scratch — findOrCreateOpenGroup will now
   * see that group as full and find/create another one.
   */
  private async claimGroupSlot(
    battleId: string,
    userId: string,
    attempt = 0,
  ): Promise<{
    group: {
      id: string;
      groupNumber: number;
      status: string;
      playerCount: number;
      sharedWordIds: string[];
    };
    player: {
      id: string;
      groupId: string;
      userId: string;
      questionIndex: number;
      currentWordId: string | null;
      currentDisplayPattern: string | null;
      currentMissingIndexes: number[];
    };
  }> {
    const group = await this.findOrCreateOpenGroup(battleId, userId);

    try {
      const player = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const claimed = await tx.bossBattleGroup.updateMany({
          where: { id: group.id, playerCount: { lt: GROUP_SIZE } },
          data: { playerCount: { increment: 1 }, status: 'LIVE' },
        });
        if (claimed.count === 0) {
          throw new GroupFullRaceError();
        }
        return tx.bossBattlePlayer.create({ data: { groupId: group.id, userId } });
      });
      return { group, player };
    } catch (err) {
      if (err instanceof GroupFullRaceError && attempt < 5) {
        return this.claimGroupSlot(battleId, userId, attempt + 1);
      }
      throw err;
    }
  }

  async submitAnswer(
    userId: string,
    rawAnswer: string,
    idempotencyKey?: string,
  ): Promise<BattleAnswerResult> {
    const player = await this.prisma.bossBattlePlayer.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      include: { group: { include: { battle: true } }, currentWord: true },
    });
    if (!player) throw new NotFoundException('You have not joined a Boss Battle');
    if (!player.currentWord || !player.currentDisplayPattern) {
      throw new BadRequestException('No active challenge — join the battle first');
    }

    const battle = player.group.battle;
    const now = new Date();

    if (deriveStatus(battle.scheduledStartUtc, battle.scheduledEndUtc, now) !== 'LIVE') {
      await this.finalizeGroupIfNeeded(player.group);
      return {
        isCorrect: false,
        correctAnswer: player.currentWord.word,
        exampleSentence: player.currentWord.exampleSentence,
        xpAwarded: 0,
        battleXp: player.battleXp,
        battleEnded: true,
        nextChallenge: null,
        aliQuickReaction: null,
      };
    }

    const isCorrect = this.normalize(rawAnswer) === player.currentWord.normalizedWord;
    const answerXp = isCorrect
      ? gameplayRules.bossBattle.perCorrectAnswer
      : gameplayRules.bossBattle.perIncorrectAnswer;
    const aliQuickReaction = quickAliReaction(isCorrect);

    const { updatedPlayer, nextChallenge } = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Compare-and-swap claim (V21 §5 "duplicate submission
        // protection"): scoped to the exact currentWordId this request
        // read outside the transaction. A concurrent or retried
        // submission for the same question (no Idempotency-Key header,
        // or two genuinely racing requests) no longer matches once a
        // winning racer has advanced it, so its own claim here returns 0
        // and is rejected outright — instead of both silently
        // reprocessing the same question and double-crediting XP. The
        // write itself is a no-op (the WHERE clause is the real guard);
        // the actual counters are updated by the ordinary `update` call
        // further below, which only a caller that WON this claim reaches.
        const claimed = await tx.bossBattlePlayer.updateMany({
          where: { id: player.id, currentWordId: player.currentWordId },
          data: { currentWordId: player.currentWordId },
        });
        if (claimed.count === 0) {
          throw new ConflictException('This question was already answered.');
        }

        await tx.bossBattleEvent.create({
          data: {
            playerId: player.id,
            wordId: player.currentWordId!,
            submittedAnswer: rawAnswer,
            isCorrect,
            xpAwarded: answerXp,
          },
        });

        await this.mastery.recordAnswer(userId, player.currentWordId!, isCorrect, tx);
        if (answerXp > 0) {
          await this.progression.awardXp(
            userId,
            answerXp,
            'BOSS_BATTLE_ANSWER',
            'boss-battle',
            battle.id,
            tx,
          );
        }

        const updated = await tx.bossBattlePlayer.update({
          where: { id: player.id },
          data: {
            battleXp: { increment: answerXp },
            correctAnswers: { increment: isCorrect ? 1 : 0 },
            incorrectAnswers: { increment: isCorrect ? 0 : 1 },
            ...(answerXp > 0 ? { lastXpAt: now } : {}),
          },
        });

        // Re-check the clock inside the transaction too — a request that
        // started just before the hour ends could finish just after it.
        const stillLive =
          deriveStatus(battle.scheduledStartUtc, battle.scheduledEndUtc, new Date()) === 'LIVE';

        let result: { updatedPlayer: typeof updated; nextChallenge: BattleChallengeView | null };
        if (!stillLive) {
          await tx.bossBattlePlayer.update({
            where: { id: player.id },
            data: { currentWordId: null, currentDisplayPattern: null, currentMissingIndexes: [] },
          });
          result = { updatedPlayer: updated, nextChallenge: null };
        } else {
          const next = await this.assignNextChallenge(
            updated.id,
            userId,
            player.groupId,
            player.group.sharedWordIds,
            updated.questionIndex + 1,
            battle.scheduledEndUtc,
            tx,
          );
          result = { updatedPlayer: updated, nextChallenge: next };
        }

        // Recorded from INSIDE this same transaction — a crash between
        // "XP granted" and "idempotency record written" must never be
        // possible, since that gap is exactly what would let a retry
        // double-grant. Response shape matches what this method returns
        // below, so a cache hit is indistinguishable from a fresh call.
        await this.idempotency.recordInTransaction(
          tx,
          userId,
          idempotencyKey,
          'boss-battle.submitAnswer',
          {
            isCorrect,
            correctAnswer: player.currentWord!.word,
            exampleSentence: player.currentWord!.exampleSentence,
            xpAwarded: answerXp,
            battleXp: result.updatedPlayer.battleXp,
            battleEnded: !result.nextChallenge,
            nextChallenge: result.nextChallenge,
            aliQuickReaction,
          },
        );

        return result;
      },
      // V22 §5/§15 stress testing surfaced a real production risk: unlike
      // finalizeGroupIfNeeded's claim (a plain updateMany OUTSIDE any
      // transaction, so only the single winner ever opens one), this CAS
      // claim has to be atomic with the whole side-effect sequence, so
      // it's the FIRST statement INSIDE the transaction — every racing
      // submitAnswer call for the same question genuinely opens its own
      // interactive transaction and competes for a pooled DB connection.
      // Prisma's defaults (maxWait/timeout both a few seconds) are sized
      // for isolated calls, not a burst of racers on one hot question;
      // under a small connection pool (e.g. a low-CPU container, since
      // Prisma's own pool-size default scales with CPU count) a losing
      // racer can get killed by "transaction already closed" before its
      // CAS claim ever runs, instead of getting the fast, correct 409
      // rejection it should — a stress test with a handful of concurrent
      // duplicate submissions reproduced exactly this. Widening this
      // one hot-path transaction's budget doesn't fix an undersized pool
      // (see .env.example's DATABASE_URL guidance for that), but it does
      // mean a temporary burst degrades to "slower" rather than "500s".
      { maxWait: 10_000, timeout: 10_000 },
    );

    if (!nextChallenge) {
      await this.finalizeGroupIfNeeded(player.group);
    }

    return {
      isCorrect,
      correctAnswer: player.currentWord.word,
      exampleSentence: player.currentWord.exampleSentence,
      xpAwarded: answerXp,
      battleXp: updatedPlayer.battleXp,
      battleEnded: !nextChallenge,
      nextChallenge,
      aliQuickReaction,
    };
  }

  async getMyGroupLeaderboard(userId: string): Promise<LeaderboardView> {
    const player = await this.prisma.bossBattlePlayer.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      include: {
        group: { include: { battle: true } },
        user: { select: { id: true, displayName: true } },
      },
    });
    if (!player) throw new NotFoundException('You have not joined a Boss Battle');

    const status = deriveStatus(
      player.group.battle.scheduledStartUtc,
      player.group.battle.scheduledEndUtc,
      new Date(),
    );
    if (status === 'COMPLETED') {
      await this.finalizeGroupIfNeeded(player.group);
    } else {
      // Correction & Completion Spec §4: Boss Battle stays self-paced
      // with no live visibility into other players — while the battle
      // is SCHEDULED or LIVE, a player sees only their own score/pace,
      // never anyone else's name, score, or a comparative rank. The
      // full ranked leaderboard only becomes visible once the group
      // finalizes.
      return {
        groupId: player.groupId,
        status,
        entries: [
          {
            userId: player.user.id,
            displayName: player.user.displayName,
            rank: null,
            battleXp: player.battleXp,
            correctAnswers: player.correctAnswers,
            incorrectAnswers: player.incorrectAnswers,
            isYou: true,
            rewardXp: null,
            rewardGlyphs: null,
          },
        ],
      };
    }

    const players: RankablePlayerWithUser[] = await this.prisma.bossBattlePlayer.findMany({
      where: { groupId: player.groupId },
      include: { user: { select: { id: true, displayName: true } } },
    });
    const ranked = this.rankPlayers(players);

    return {
      groupId: player.groupId,
      status,
      entries: ranked.map((p, i) => ({
        userId: p.user.id,
        displayName: p.user.displayName,
        rank: p.finalRank ?? i + 1,
        battleXp: p.battleXp,
        correctAnswers: p.correctAnswers,
        incorrectAnswers: p.incorrectAnswers,
        isYou: p.user.id === userId,
        rewardXp: p.rewardXp ?? null,
        rewardGlyphs: p.rewardGlyphs ?? null,
      })),
    };
  }

  private async getOrCreateCurrentBattle(
    now: Date,
    attempt = 0,
  ): Promise<{ id: string; weekId: string; scheduledStartUtc: Date; scheduledEndUtc: Date }> {
    const window = nextBattleWindow(now);
    const existing = await this.prisma.bossBattle.findUnique({ where: { weekId: window.weekId } });
    if (existing) return existing;

    try {
      return await this.prisma.bossBattle.create({
        data: {
          weekId: window.weekId,
          scheduledStartUtc: window.start,
          scheduledEndUtc: window.end,
        },
      });
    } catch (err) {
      // Two simultaneous requests both saw "no battle yet" — the loser
      // of the unique-constraint race just re-reads what the winner
      // created. Checked structurally (err.code === 'P2002') rather
      // than via `instanceof Prisma.PrismaClientKnownRequestError` —
      // that class isn't part of every Prisma client build surface.
      if (attempt < 3 && isUniqueConstraintError(err)) {
        return this.getOrCreateCurrentBattle(now, attempt + 1);
      }
      throw err;
    }
  }

  private async findOrCreateOpenGroup(
    battleId: string,
    userId: string,
    attempt = 0,
  ): Promise<{
    id: string;
    groupNumber: number;
    status: string;
    playerCount: number;
    sharedWordIds: string[];
  }> {
    const open = await this.prisma.bossBattleGroup.findFirst({
      where: { battleId, playerCount: { lt: GROUP_SIZE }, status: { in: ['FORMING', 'LIVE'] } },
      orderBy: { groupNumber: 'asc' },
    });
    if (open) return open;

    const last = await this.prisma.bossBattleGroup.findFirst({
      where: { battleId },
      orderBy: { groupNumber: 'desc' },
    });
    const groupNumber = (last?.groupNumber ?? 0) + 1;

    // The shared challenge sequence (V1 Remaining Systems Spec §13: "no
    // player receives a different challenge") — generated ONCE, right
    // here, from whichever player happens to trigger this group's
    // creation. Every player who joins this group afterward answers
    // this exact same word sequence, tracked individually via
    // BossBattlePlayer.questionIndex (see assignNextChallenge). Reuses
    // the adaptive word-selection pipeline rather than a separate
    // "neutral" selector — its personalization is anchored to the first
    // joiner only, same as the group itself is anchored to whoever
    // opens it.
    //
    // excludeWordIds (V21 §3: "prevent unnecessary repetition") — the
    // triggering player's own words already pending in an unresolved
    // Daily Quest attempt shouldn't also open this new shared sequence,
    // same reasoning/pattern as QuestsService.startTimedQuest.
    const triggeringUserInProgress = await this.prisma.questAttempt.findMany({
      where: { userId, status: 'IN_PROGRESS' },
      select: { wordIds: true },
    });
    const excludeWordIds = triggeringUserInProgress.flatMap((a) => a.wordIds);
    const sharedWordIds = await this.words.pickWordsForQuest(
      userId,
      gameplayRules.bossBattle.sharedSequenceLength,
      excludeWordIds,
    );

    try {
      return await this.prisma.bossBattleGroup.create({
        data: { battleId, groupNumber, status: 'LIVE', sharedWordIds },
      });
    } catch (err) {
      // Same realistic race as above — likely to matter most exactly at
      // 17:00:00 when many players join within the same instant.
      if (attempt < 3 && isUniqueConstraintError(err)) {
        return this.findOrCreateOpenGroup(battleId, userId, attempt + 1);
      }
      throw err;
    }
  }

  private async buildChallengeView(
    player: {
      id: string;
      userId: string;
      groupId: string;
      questionIndex: number;
      currentWordId: string | null;
      currentDisplayPattern: string | null;
      currentMissingIndexes: number[];
    },
    group: { sharedWordIds: string[] },
    battleEndsAt: Date,
  ): Promise<BattleChallengeView> {
    if (player.currentWordId && player.currentDisplayPattern) {
      const word = await this.prisma.word.findUniqueOrThrow({
        where: { id: player.currentWordId },
      });
      return {
        groupId: player.groupId,
        battleEndsAt: battleEndsAt.toISOString(),
        displayPattern: player.currentDisplayPattern,
        missingIndexes: player.currentMissingIndexes,
        wordLength: word.length,
        definition: word.definition,
        partOfSpeech: word.partOfSpeech,
      };
    }
    return this.assignNextChallenge(
      player.id,
      player.userId,
      player.groupId,
      group.sharedWordIds,
      player.questionIndex,
      battleEndsAt,
      this.prisma,
    );
  }

  /**
   * Assigns the word at `sharedWordIds[questionIndex]` — NOT a fresh
   * pickWordsForQuest call — so every player in the group sees the same
   * word at the same question index (spec §13). Wraps around via modulo
   * if a player exhausts the whole shared sequence before the battle's
   * hour is up, so fast/accurate players keep playing rather than
   * hitting a dead end. The omission PATTERN (which letters are
   * blanked) still varies per player by their own mastery of that
   * word — same personalization Daily Quest already applies — only the
   * underlying word tested is guaranteed identical for everyone.
   */
  private async assignNextChallenge(
    playerId: string,
    userId: string,
    groupId: string,
    sharedWordIds: string[],
    questionIndex: number,
    battleEndsAt: Date,
    db: Db,
  ): Promise<BattleChallengeView> {
    const wordId = sharedWordIds[questionIndex % sharedWordIds.length];
    const word = await db.word.findUniqueOrThrow({ where: { id: wordId } });
    const masteryLevel = await this.mastery.getLevel(userId, wordId);

    const challenge = generateOmissionChallenge({
      word: word.word,
      baseDifficulty: word.baseDifficulty,
      masteryLevel,
    });

    await db.bossBattlePlayer.update({
      where: { id: playerId },
      data: {
        currentWordId: wordId,
        currentDisplayPattern: challenge.displayPattern,
        currentMissingIndexes: challenge.missingIndexes,
        questionIndex,
      },
    });

    return {
      groupId,
      battleEndsAt: battleEndsAt.toISOString(),
      displayPattern: challenge.displayPattern,
      missingIndexes: challenge.missingIndexes,
      wordLength: word.length,
      definition: word.definition,
      partOfSpeech: word.partOfSpeech,
    };
  }

  /**
   * Tie-break order (spec §10): highest battleXp, then most correct
   * answers, then fewest incorrect, then whoever reached their final
   * (still-tied) XP total earliest.
   */
  private rankPlayers<T extends RankablePlayer>(players: T[]): T[] {
    return [...players].sort((a, b) => {
      if (a.finalRank !== null || b.finalRank !== null) {
        return (a.finalRank ?? Number.MAX_SAFE_INTEGER) - (b.finalRank ?? Number.MAX_SAFE_INTEGER);
      }
      if (b.battleXp !== a.battleXp) return b.battleXp - a.battleXp;
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
      if (a.incorrectAnswers !== b.incorrectAnswers) return a.incorrectAnswers - b.incorrectAnswers;
      const aTime = a.lastXpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.lastXpAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }

  /**
   * Auto-finalization (V1 Remaining Systems Spec §13/§19): finalizeGroupIfNeeded
   * was previously only ever triggered reactively (a player submitting an
   * answer or checking the leaderboard after the hour ends) — a group whose
   * members never came back would sit un-finalized forever, and nobody in
   * it would get their BOSS_BATTLE_RESULT reward or notification. This
   * sweeps every group whose battle has ended but hasn't been finalized
   * yet, on the schedule configured in gameplayRules.bossBattle.autoFinalizeCronExpression.
   * finalizeGroupIfNeeded's own atomic status claim makes this safe to run
   * concurrently with a reactive finalization triggered by a player at the
   * same moment. `status: { not: 'COMPLETED' }` also picks up a group
   * stuck in FINALIZING — finalizeGroupIfNeeded's own claim decides
   * whether that's actually stale enough to retry (see its doc comment).
   */
  @Cron(gameplayRules.bossBattle.autoFinalizeCronExpression)
  async autoFinalizeEndedBattles(): Promise<void> {
    const staleGroups = await this.prisma.bossBattleGroup.findMany({
      where: {
        status: { not: 'COMPLETED' },
        battle: { scheduledEndUtc: { lt: new Date() } },
      },
    });
    for (const group of staleGroups) {
      await this.finalizeGroupIfNeeded(group);
    }
  }

  /**
   * Two-phase claim (V21 §5 "reward duplication prevention"): claims the
   * group into FINALIZING first, grants every reward inside ONE
   * transaction, and only flips to COMPLETED as that same transaction's
   * last statement. A transaction is all-or-nothing in Postgres, so a
   * crash anywhere in the reward loop rolls back everything from THIS
   * attempt — no player is left half-rewarded — and leaves the group at
   * FINALIZING rather than at a COMPLETED that (under the previous
   * design, which flipped to COMPLETED in a separate statement BEFORE
   * granting anything) would have silently excluded the group from every
   * future auto-finalize sweep, losing its rewards forever. The claim's
   * WHERE clause is still an atomic, race-safe compare-and-swap — the
   * OR branch only lets a sweep reclaim a group that's been stuck in
   * FINALIZING longer than finalizationStuckThresholdMs, never one a
   * concurrent call is genuinely still working on right now.
   */
  private async finalizeGroupIfNeeded(group: {
    id: string;
    status: string;
    finalizingAt?: Date | null;
  }): Promise<void> {
    if (group.status === 'COMPLETED') return;

    const staleBefore = new Date(
      Date.now() - gameplayRules.bossBattle.finalizationStuckThresholdMs,
    );
    const claimed = await this.prisma.bossBattleGroup.updateMany({
      where: {
        id: group.id,
        OR: [
          { status: { notIn: ['COMPLETED', 'FINALIZING'] } },
          { status: 'FINALIZING', finalizingAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'FINALIZING', finalizingAt: new Date() },
    });
    if (claimed.count === 0) return; // already COMPLETED, or another finalizer is actively working this group right now

    const players = await this.prisma.bossBattlePlayer.findMany({ where: { groupId: group.id } });
    const ranked = this.rankPlayers(players);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (let i = 0; i < ranked.length; i++) {
        const rank = i + 1;
        const reward = bossBattleRewardForRank(rank);
        await tx.bossBattlePlayer.update({
          where: { id: ranked[i].id },
          data: {
            finalRank: rank,
            isWinner: rank === 1,
            // Snapshotted so the post-completion leaderboard can show
            // "Rewards" (V19 Stabilization Spec §4) without recomputing
            // bossBattleRewardForRank from a rank that could theoretically
            // be recalculated differently later.
            rewardXp: reward.xp,
            rewardGlyphs: reward.glyphs,
          },
        });
        // Every player who reaches finalization has "completed" the
        // battle (spec definition), win or not — this was previously
        // read by the CEFR gate and Boss Champion/Elite achievements
        // but never actually written, so it always showed 0.
        const updatedProgression = await tx.userProgression.update({
          where: { userId: ranked[i].userId },
          data: { bossBattlesCompleted: { increment: 1 } },
        });
        await this.progression.awardXp(
          ranked[i].userId,
          reward.xp,
          'BOSS_BATTLE_REWARD',
          'boss-battle',
          group.id,
          tx,
        );
        await this.progression.awardGlyphs(
          ranked[i].userId,
          reward.glyphs,
          'BOSS_BATTLE_REWARD',
          'boss-battle',
          group.id,
          tx,
        );
        await this.progression.checkCefrEligibility(ranked[i].userId, tx);
        await this.achievements.checkCompetition(ranked[i].userId, rank, group.id, tx);

        // A permanent collectible for THIS win specifically (schema's own
        // doc comment: "auto-created for Journey completions, Boss Battle
        // wins, and selected major-milestone achievements") — distinct
        // from and in addition to the one-time "Boss Champion" ACHIEVEMENT
        // card checkCompetition above unlocks on a player's FIRST win.
        // sourceEventId is this group's id, so a player who wins multiple
        // weekly battles gets a distinct card for each one.
        if (rank === 1) {
          await this.questCards.createCard(
            ranked[i].userId,
            'BOSS_BATTLE_WIN',
            group.id,
            'Boss Battle Victory',
            'COMPETITION',
            tx,
            {
              rarity: 'RARE',
              journeyStageKey: JOURNEY_STAGES.find(
                (s) => s.stage === updatedProgression.journeyStage,
              )?.key,
            },
          );
        }

        this.ali.reactFireAndForget(ranked[i].userId, {
          type: 'BOSS_BATTLE_RESULT',
          journeyStage: updatedProgression.journeyStage,
          context: { rank, groupSize: ranked.length, battleXp: ranked[i].battleXp },
        });
        this.notifications.notifyFireAndForget(
          ranked[i].userId,
          'BOSS_BATTLE_RESULT',
          rank === 1 ? 'You won your Boss Battle!' : 'Your Boss Battle has ended',
          `You placed #${rank} of ${ranked.length} with ${ranked[i].battleXp} Battle XP.`,
          {
            data: { rank, groupSize: ranked.length, battleXp: ranked[i].battleXp },
            deepLink: 'wordquest://boss-battle-leaderboard',
          },
        );
      }

      // Only reached once every player's reward has actually landed —
      // see this method's doc comment for why this is the LAST statement
      // in the transaction rather than a separate pre-flight update.
      await tx.bossBattleGroup.update({
        where: { id: group.id },
        data: { status: 'COMPLETED' },
      });
    });
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}
