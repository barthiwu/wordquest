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
import { AliService, type AliDisplayMessage } from '../ali/ali.service';
import { NotificationService } from '../notifications/notification.service';
import { generateOmissionChallenge } from '../vocabulary/omission-engine';
import { gameplayRules, bossBattleRewardForRank } from '../config/gameplay-rules';
import {
  deriveStatus,
  nextBattleWindow,
  playerDeadline,
  type BossBattleStatus,
} from './battle-schedule';
import { isUniqueConstraintError } from '../common/prisma-errors';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { QuestCardService } from '../quest-card/quest-card.service';
import { JOURNEY_STAGES } from '../config/journey-stages';
import { quickAliReaction } from '../ali/ali-quick-reactions';
import { quickAliExpression, type AliExpressionCue } from '../ali/ali-expression';
import { AnalyticsService } from '../analytics/analytics.service';
import { renderWord } from '../vocabulary/english-variant';
import { resolveEnglishVariant } from '../vocabulary/resolve-english-variant';
import { UsersService } from '../users/users.service';

type Db = PrismaService | Prisma.TransactionClient;
const GROUP_SIZE = 20;

/** Internal-only sentinel for claimGroupSlot's retry loop — never escapes this service. */
class GroupFullRaceError extends Error {}

export interface BattleChallengeView {
  groupId: string;
  /**
   * ISO timestamp — server-authoritative; the client uses this only to
   * render a countdown, never to decide anything itself (spec §4/§21).
   * THIS PLAYER's own deadline (battle-schedule.ts's playerDeadline),
   * not necessarily the group's full-hour scheduledEndUtc — a player
   * who joined partway through the hour has a nearer cutoff than that,
   * and this is always the real one that applies to them.
   */
  battleEndsAt: string;
  /**
   * True when THIS PLAYER's own battle is already over — their 30
   * guesses are used up, their personal time window elapsed, or the
   * group's battle window itself ended. Every other field is a
   * meaningless placeholder when this is true; the client should route
   * straight to its "battle over" state without reading them.
   */
  battleEnded: boolean;
  /** How many of this player's questions they've already answered — for a "7 of 30" progress readout. */
  questionsAnswered: number;
  /** The hard per-player guess cap (gameplayRules.bossBattle.sharedSequenceLength). */
  maxQuestions: number;
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
  /** The visual pairing for aliQuickReaction — see ali-expression.ts's quickAliExpression. Null alongside aliQuickReaction. */
  aliQuickExpression: AliExpressionCue | null;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  /** Resolved via UsersService.resolveAvatarUrl -- null when the player
   * has no avatar set, same convention as FriendPublicView.avatarUrl.
   * Backs the avatar-tap "Profile / Add Friend / Block" popup (2026-09,
   * Barth). */
  avatarUrl: string | null;
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
  /**
   * Task #99 follow-up: Boss Battle fires every one of its reactions
   * (BOSS_BATTLE_RESULT, plus whatever LEVEL_UP/JOURNEY_COMPLETION/
   * MASTERY_EVENT/ACHIEVEMENT_UNLOCK the battle triggered) fire-and-
   * forget, the same as arcade play — there's no live moment to pop
   * them up in during a self-paced battle. Once this group finalizes,
   * they're read back here via AliService.listReactionsSince (since
   * this player joined the group) for a "while your battle ran..."
   * recap. Always [] while the group hasn't finalized yet.
   */
  deferredAliReactions: AliDisplayMessage[];
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
  user: { id: string; username: string; avatarKey: string | null };
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
    private readonly users: UsersService,
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
    const variant = await resolveEnglishVariant(this.prisma, userId);
    if (existing) {
      // Resuming (app reopened, or a re-fetch of the current challenge) —
      // the player's OWN window may have quietly run out since they were
      // last active, even though the group's battle is still LIVE for
      // everyone else. Re-derive that here rather than trusting whatever
      // stale currentWordId is still sitting on the row.
      const deadline = playerDeadline(
        existing.joinedAt,
        battle.scheduledEndUtc,
        gameplayRules.bossBattle.perPlayerDurationMs,
      );
      const sequenceExhausted = existing.questionIndex >= existing.group.sharedWordIds.length;
      if (now.getTime() >= deadline.getTime() || sequenceExhausted) {
        if (existing.currentWordId) {
          await this.prisma.bossBattlePlayer.update({
            where: { id: existing.id },
            data: { currentWordId: null, currentDisplayPattern: null, currentMissingIndexes: [] },
          });
        }
        return {
          groupId: existing.groupId,
          battleEndsAt: deadline.toISOString(),
          battleEnded: true,
          questionsAnswered: Math.min(existing.questionIndex, existing.group.sharedWordIds.length),
          maxQuestions: existing.group.sharedWordIds.length,
          displayPattern: '',
          missingIndexes: [],
          wordLength: 0,
          definition: '',
          partOfSpeech: '',
        };
      }
      return this.buildChallengeView(existing, existing.group, deadline, variant);
    }

    const { group, player } = await this.claimGroupSlot(battle.id, userId);
    this.analytics.track(userId, 'boss_battle_joined', { battleId: battle.id, groupId: group.id });
    const freshDeadline = playerDeadline(
      now,
      battle.scheduledEndUtc,
      gameplayRules.bossBattle.perPlayerDurationMs,
    );
    return this.buildChallengeView(player, group, freshDeadline, variant);
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
    const variant = await resolveEnglishVariant(this.prisma, userId);
    const rendered = renderWord(player.currentWord, variant);

    if (deriveStatus(battle.scheduledStartUtc, battle.scheduledEndUtc, now) !== 'LIVE') {
      // The GROUP's own hour is up — this is the one case that finalizes
      // (ranks + rewards everyone), since nobody in the group can play
      // any further either way.
      await this.finalizeGroupIfNeeded(player.group);
      return {
        isCorrect: false,
        correctAnswer: rendered.text,
        exampleSentence: rendered.sentence,
        xpAwarded: 0,
        battleXp: player.battleXp,
        battleEnded: true,
        nextChallenge: null,
        aliQuickReaction: null,
        aliQuickExpression: null,
      };
    }

    // THIS PLAYER's own window may be up even though the group's hour
    // isn't (Barth, Sept 2026: 30 minutes per player, capped by the
    // group's own end). Deliberately NOT scored — same "no grace answer
    // past the deadline" rule the group-level check above already
    // applies — and deliberately does NOT finalize the group: other
    // players may still be mid-battle, and ranking/rewards stay keyed to
    // the group's real end so nobody is scored against players who
    // effectively got less time.
    const personalDeadline = playerDeadline(
      player.joinedAt,
      battle.scheduledEndUtc,
      gameplayRules.bossBattle.perPlayerDurationMs,
    );
    if (now.getTime() >= personalDeadline.getTime()) {
      await this.prisma.bossBattlePlayer.update({
        where: { id: player.id },
        data: { currentWordId: null, currentDisplayPattern: null, currentMissingIndexes: [] },
      });
      return {
        isCorrect: false,
        correctAnswer: rendered.text,
        exampleSentence: rendered.sentence,
        xpAwarded: 0,
        battleXp: player.battleXp,
        battleEnded: true,
        nextChallenge: null,
        aliQuickReaction: null,
        aliQuickExpression: null,
      };
    }

    // Compared against the RENDERED (variant-aware) form — a US-preference
    // player typing the US spelling for a word whose headword is UK must
    // be marked correct (2026-09 fairness feature).
    const isCorrect = this.normalize(rawAnswer) === rendered.normalizedText;
    const answerXp = isCorrect
      ? gameplayRules.bossBattle.perCorrectAnswer
      : gameplayRules.bossBattle.perIncorrectAnswer;
    const aliQuickReaction = quickAliReaction(isCorrect);
    const aliQuickExpression = quickAliExpression(isCorrect);

    const { updatedPlayer, nextChallenge, groupStillLive } = await this.prisma.$transaction(
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
        const txNow = new Date();
        const groupStillLiveInTx =
          deriveStatus(battle.scheduledStartUtc, battle.scheduledEndUtc, txNow) === 'LIVE';
        const personalTimeUpInTx =
          txNow.getTime() >=
          playerDeadline(
            player.joinedAt,
            battle.scheduledEndUtc,
            gameplayRules.bossBattle.perPlayerDurationMs,
          ).getTime();
        // The word just answered was at index `updated.questionIndex` (this
        // update doesn't touch that column) — so `+ 1` is how many of this
        // player's questions are now answered. Once that reaches the shared
        // sequence's length, they're done: no more wrapping back to word 0
        // (Barth, Sept 2026 bugfix — see assignNextChallenge's doc comment).
        const sequenceExhaustedInTx =
          updated.questionIndex + 1 >= player.group.sharedWordIds.length;
        const playerDone = !groupStillLiveInTx || personalTimeUpInTx || sequenceExhaustedInTx;

        let result: {
          updatedPlayer: typeof updated;
          nextChallenge: BattleChallengeView | null;
          groupStillLive: boolean;
        };
        if (playerDone) {
          await tx.bossBattlePlayer.update({
            where: { id: player.id },
            data: { currentWordId: null, currentDisplayPattern: null, currentMissingIndexes: [] },
          });
          result = {
            updatedPlayer: updated,
            nextChallenge: null,
            groupStillLive: groupStillLiveInTx,
          };
        } else {
          const next = await this.assignNextChallenge(
            updated.id,
            userId,
            player.groupId,
            player.group.sharedWordIds,
            updated.questionIndex + 1,
            personalDeadline,
            tx,
            variant,
          );
          result = {
            updatedPlayer: updated,
            nextChallenge: next,
            groupStillLive: groupStillLiveInTx,
          };
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
            correctAnswer: rendered.text,
            exampleSentence: rendered.sentence,
            xpAwarded: answerXp,
            battleXp: result.updatedPlayer.battleXp,
            battleEnded: !result.nextChallenge,
            nextChallenge: result.nextChallenge,
            aliQuickReaction,
            aliQuickExpression,
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

    if (!groupStillLive) {
      // Only the group's own hour ending finalizes (ranks + rewards
      // everyone) — a player finishing early on their own time or guess
      // cap must NOT trigger this while the group is still LIVE for
      // others (see the doc comment above).
      await this.finalizeGroupIfNeeded(player.group);
    }

    return {
      isCorrect,
      correctAnswer: rendered.text,
      exampleSentence: rendered.sentence,
      xpAwarded: answerXp,
      battleXp: updatedPlayer.battleXp,
      battleEnded: !nextChallenge,
      nextChallenge,
      aliQuickReaction,
      aliQuickExpression,
    };
  }

  async getMyGroupLeaderboard(userId: string): Promise<LeaderboardView> {
    const player = await this.prisma.bossBattlePlayer.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      include: {
        group: { include: { battle: true } },
        user: { select: { id: true, username: true, avatarKey: true } },
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
            username: player.user.username,
            avatarUrl: await this.users.resolveAvatarUrl(player.user.avatarKey),
            rank: null,
            battleXp: player.battleXp,
            correctAnswers: player.correctAnswers,
            incorrectAnswers: player.incorrectAnswers,
            isYou: true,
            rewardXp: null,
            rewardGlyphs: null,
          },
        ],
        deferredAliReactions: [],
      };
    }

    const players: RankablePlayerWithUser[] = await this.prisma.bossBattlePlayer.findMany({
      where: { groupId: player.groupId },
      include: { user: { select: { id: true, username: true, avatarKey: true } } },
    });
    const ranked = this.rankPlayers(players);

    // Best-effort, same policy as every other listReactionsSince caller
    // — see LeaderboardView's deferredAliReactions doc comment.
    let deferredAliReactions: AliDisplayMessage[] = [];
    try {
      deferredAliReactions = await this.ali.listReactionsSince(userId, player.joinedAt, [
        'BOSS_BATTLE_RESULT',
        ...AliService.DEFERRED_REACTION_EVENT_TYPES,
      ]);
    } catch {
      // The leaderboard just won't show a recap this time.
    }

    return {
      groupId: player.groupId,
      status,
      entries: await Promise.all(
        ranked.map(async (p, i) => ({
          userId: p.user.id,
          username: p.user.username,
          avatarUrl: await this.users.resolveAvatarUrl(p.user.avatarKey),
          rank: p.finalRank ?? i + 1,
          battleXp: p.battleXp,
          correctAnswers: p.correctAnswers,
          incorrectAnswers: p.incorrectAnswers,
          isYou: p.user.id === userId,
          rewardXp: p.rewardXp ?? null,
          rewardGlyphs: p.rewardGlyphs ?? null,
        })),
      ),
      deferredAliReactions,
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
      gameplayRules.bossBattle.minWordLength,
      gameplayRules.bossBattle.maxWordLength,
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
    variant: 'US' | 'UK' | null,
  ): Promise<BattleChallengeView> {
    if (player.currentWordId && player.currentDisplayPattern) {
      const word = await this.prisma.word.findUniqueOrThrow({
        where: { id: player.currentWordId },
      });
      const rendered = renderWord(word, variant);
      return {
        groupId: player.groupId,
        battleEndsAt: battleEndsAt.toISOString(),
        battleEnded: false,
        questionsAnswered: player.questionIndex,
        maxQuestions: group.sharedWordIds.length,
        displayPattern: player.currentDisplayPattern,
        missingIndexes: player.currentMissingIndexes,
        wordLength: rendered.text.length,
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
      variant,
    );
  }

  /**
   * Assigns the word at `sharedWordIds[questionIndex]` — NOT a fresh
   * pickWordsForQuest call — so every player in the group sees the same
   * word at the same question index (spec §13). Every caller is
   * responsible for confirming `questionIndex < sharedWordIds.length`
   * before calling this — a player who has exhausted the shared
   * sequence is DONE, not wrapped back around to word 0 (that
   * wraparound was a real bug Barth hit in testing: "the boss battle
   * returned to the start of the words again after I played some" —
   * Sept 2026). The omission PATTERN (which letters are blanked) still
   * varies per player by their own mastery of that word — same
   * personalization Daily Quest already applies — only the underlying
   * word tested is guaranteed identical for everyone.
   */
  private async assignNextChallenge(
    playerId: string,
    userId: string,
    groupId: string,
    sharedWordIds: string[],
    questionIndex: number,
    battleEndsAt: Date,
    db: Db,
    variant: 'US' | 'UK' | null,
  ): Promise<BattleChallengeView> {
    const wordId = sharedWordIds[questionIndex];
    const word = await db.word.findUniqueOrThrow({ where: { id: wordId } });
    const masteryLevel = await this.mastery.getLevel(userId, wordId);
    const rendered = renderWord(word, variant);

    const challenge = generateOmissionChallenge({
      word: rendered.text,
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
      battleEnded: false,
      questionsAnswered: questionIndex,
      maxQuestions: sharedWordIds.length,
      displayPattern: challenge.displayPattern,
      missingIndexes: challenge.missingIndexes,
      wordLength: rendered.text.length,
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
