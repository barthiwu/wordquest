import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { QuestCardService } from '../quest-card/quest-card.service';
import { AliService } from '../ali/ali.service';
import { NotificationService } from '../notifications/notification.service';
import { isUniqueConstraintError } from '../common/prisma-errors';
import { usedAnyGuessAssistance } from '../config/gameplay-rules';
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_REWARDS,
  type AchievementCatalogEntry,
} from './achievement-catalog';

type Db = PrismaService | Prisma.TransactionClient;

const DISCOVERY_THRESHOLDS: [string, number][] = [
  ['first_step', 1],
  ['getting_started', 10],
  ['vocabulary_explorer', 100],
];
const MASTERY_THRESHOLDS: [string, number][] = [
  ['first_mastery', 1],
  ['fivefold_mastery', 5],
  ['vocabulary_builder', 50],
  ['vocabulary_keeper', 500],
];
const CONSISTENCY_THRESHOLDS: [string, number][] = [
  ['seven_strong', 7],
  ['tenacity', 10],
  ['monthly_mindset', 30],
  ['unbroken', 60],
  ['quarter_master', 90],
];
const INDEPENDENT_LEARNING_THRESHOLDS: [string, number][] = [
  ['first_independent_quest', 1],
  ['independent_streak', 3],
  ['independent_ten', 10],
  ['independent_thirty', 30],
];

/**
 * Only checks are triggered by the caller — this service never
 * decides FOR ITSELF when to run, matching every other progression
 * write path in this codebase: MasteryService, ProgressionService, and
 * QuestsService each call the specific check() method for whichever
 * counter they just changed, right after changing it.
 */
@Injectable()
export class AchievementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProgressionService,
    private readonly questCards: QuestCardService,
    private readonly ali: AliService,
    private readonly notifications: NotificationService,
  ) {}

  listCatalog(): AchievementCatalogEntry[] {
    return ACHIEVEMENT_CATALOG;
  }

  async getMyUnlocks(userId: string): Promise<{ achievementId: string; unlockedAt: Date }[]> {
    return this.prisma.achievementUnlock.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
      select: { achievementId: true, unlockedAt: true },
    });
  }

  /**
   * Discovery (total valid guesses) and Mastery (masteredWordsCount) —
   * checked together to avoid two separate round trips for the count
   * query. "Valid guess" spans every answer surface, not just quests:
   * Boss Battle answers are logged as BossBattleEvent rows, not
   * ChallengeAttempt — summing both is what makes this an honest total
   * rather than under-counting a player who mostly plays Boss Battle.
   */
  async checkDiscoveryAndMastery(
    userId: string,
    masteredWordsCount: number,
    db: Db = this.prisma,
  ): Promise<void> {
    const [challengeCount, battleAnswerCount] = await Promise.all([
      db.challengeAttempt.count({ where: { userId } }),
      db.bossBattleEvent.count({ where: { player: { userId } } }),
    ]);
    const totalGuesses = challengeCount + battleAnswerCount;

    for (const [id, threshold] of DISCOVERY_THRESHOLDS) {
      if (totalGuesses >= threshold) await this.unlock(userId, id, db);
    }
    for (const [id, threshold] of MASTERY_THRESHOLDS) {
      if (masteredWordsCount >= threshold) await this.unlock(userId, id, db);
    }
  }

  async checkConsistency(
    userId: string,
    currentStreak: number,
    db: Db = this.prisma,
  ): Promise<void> {
    for (const [id, threshold] of CONSISTENCY_THRESHOLDS) {
      if (currentStreak >= threshold) await this.unlock(userId, id, db);
    }
  }

  /**
   * "Independent quest" = no hints, no synonyms, no letter reveal (spec
   * §6.3) — checked against the REAL per-attempt hintsUsed/synonymsUsed/
   * lettersRevealed counters via the same usedAnyGuessAssistance()
   * definition computeGuessXp's "clean run" bonus uses (Correction &
   * Completion Spec §6: "ensure independent learning achievements check
   * actual hint/synonym/reveal usage" — this used to treat every
   * completed quest as independent by definition, before those counters
   * existed).
   *
   * The streak entries require CONSECUTIVE independent completions
   * (catalog: "Complete N consecutive eligible independent quests"), so
   * this walks the player's most recent completed attempts newest-first
   * and counts how many in a row — starting from the most recent — are
   * independent; the first non-independent completion in that window
   * ends the streak, same as any other streak in this codebase.
   */
  async checkIndependentLearning(userId: string, db: Db = this.prisma): Promise<void> {
    const highestThreshold = Math.max(...INDEPENDENT_LEARNING_THRESHOLDS.map(([, n]) => n));
    const recentAttempts = await db.questAttempt.findMany({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: highestThreshold,
      select: { hintsUsed: true, synonymsUsed: true, lettersRevealed: true },
    });

    let independentStreak = 0;
    for (const attempt of recentAttempts) {
      if (usedAnyGuessAssistance(attempt)) break;
      independentStreak++;
    }

    for (const [id, threshold] of INDEPENDENT_LEARNING_THRESHOLDS) {
      if (independentStreak >= threshold) await this.unlock(userId, id, db);
    }
  }

  async checkCompetition(
    userId: string,
    finalRank: number,
    groupId: string,
    db: Db = this.prisma,
  ): Promise<void> {
    if (finalRank === 1) {
      const justUnlocked = await this.unlock(userId, 'boss_champion', db);
      if (justUnlocked) {
        await this.questCards.createCard(
          userId,
          'ACHIEVEMENT',
          'boss_champion',
          'Boss Champion',
          'COMPETITION',
          db,
        );
      }
    }
    if (finalRank <= 3) {
      await this.unlock(userId, 'boss_elite', db);
    }
  }

  /** True if this was a genuinely new unlock (false if already unlocked — achievements are awarded once, spec §6.1). */
  private async unlock(userId: string, achievementId: string, db: Db): Promise<boolean> {
    try {
      await db.achievementUnlock.create({ data: { userId, achievementId } });
    } catch (err) {
      if (isUniqueConstraintError(err)) return false;
      throw err;
    }

    const entry = ACHIEVEMENT_CATALOG.find((a) => a.id === achievementId)!;
    const reward = ACHIEVEMENT_REWARDS[entry.category];
    await this.progression.awardXp(
      userId,
      reward.xp,
      'ACHIEVEMENT_UNLOCK',
      'achievement',
      achievementId,
      db,
    );
    await this.progression.awardGlyphs(
      userId,
      reward.glyphs,
      'ACHIEVEMENT_UNLOCK',
      'achievement',
      achievementId,
      db,
    );

    const progression = await db.userProgression.findUnique({
      where: { userId },
      select: { journeyStage: true },
    });
    this.ali.reactFireAndForget(userId, {
      type: 'ACHIEVEMENT_UNLOCK',
      journeyStage: progression?.journeyStage ?? 0,
      context: { achievementName: entry.name, category: entry.category },
    });
    this.notifications.notifyFireAndForget(
      userId,
      'ACHIEVEMENT_UNLOCK',
      'Achievement Unlocked',
      `You unlocked "${entry.name}".`,
      { data: { achievementId: entry.id }, deepLink: 'wordquest://achievements' },
    );

    return true;
  }
}
