import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import { gameplayRules } from '../config/gameplay-rules';
import { playerLocalDate, playerLocalHour } from '../common/timezone';
import { nextBattleWindow } from '../boss-battle/battle-schedule';
import { AliService } from '../ali/ali.service';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { computeForgettingRisk } from '../vocabulary/review-schedule';

/** quest.key -> the NotificationType its window-open reminder uses. Any quest key not listed here is simply never reminded — a defensive default for a future timed quest added without updating this map, not a crash. */
const QUEST_KEY_TO_NOTIFICATION_TYPE: Record<string, NotificationType> = {
  'morning-quest': 'MORNING_QUEST',
  'noon-quest': 'AFTERNOON_QUEST',
  'evening-quest': 'EVENING_QUEST',
};

/**
 * The Notification Engine's time-based triggers (spec §15/§19) — as
 * opposed to the event-driven ones (LEVEL_UP, ACHIEVEMENT_UNLOCK, etc.)
 * that already fire straight from ProgressionService/AchievementService/
 * BossBattleService the moment their event happens. Everything here runs
 * on its own clock and decides *whether the moment is right* for a given
 * player; actual delivery (category preference, quiet hours, push vs
 * in-app-only) is still entirely NotificationService's job downstream —
 * this service only ever calls notifyFireAndForget.
 *
 * WEAK_SKILL_REMINDER, FORGETTING_CURVE_REMINDER, and LEADERBOARD_UPDATE
 * (Correction & Completion Spec §6) reuse the same anti-repeat trick
 * rather than a new schema table: the Notification row itself already
 * carries `userId`/`type`/`createdAt` (indexed) and a free-form `data`
 * Json column, so "don't re-nudge within N days" is just "read the most
 * recent Notification of that type for this user and compare
 * createdAt", and "what was the last known value" (e.g. the player's
 * rank the last time we told them) is just whatever was stored in that
 * same row's `data` field.
 */
@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly ali: AliService,
    private readonly leaderboards: LeaderboardsService,
  ) {}

  /** Most recent Notification of `type` for this user, or null if never sent — the shared anti-repeat/last-known-value lookup every trigger below uses. */
  private async lastNotificationOfType(
    userId: string,
    type: NotificationType,
  ): Promise<{ createdAt: Date; data: unknown } | null> {
    return this.prisma.notification.findFirst({
      where: { userId, type },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, data: true },
    });
  }

  /** True if `last` is null, or old enough that `cooldownDays` have fully elapsed since it. */
  private cooldownElapsed(
    last: { createdAt: Date } | null,
    cooldownDays: number,
    now: Date,
  ): boolean {
    if (!last) return true;
    const elapsedMs = now.getTime() - last.createdAt.getTime();
    return elapsedMs >= cooldownDays * 24 * 60 * 60 * 1000;
  }

  /** Daily Quest window-open reminders (MORNING_QUEST/AFTERNOON_QUEST/EVENING_QUEST) — one player-local-hour check per timed quest, per run. */
  @Cron(gameplayRules.notificationScheduler.hourlyCronExpression)
  async sendQuestWindowReminders(): Promise<void> {
    try {
      const quests = await this.prisma.quest.findMany({
        where: { isActive: true, windowStartHour: { not: null } },
      });
      if (quests.length === 0) return;

      const users = await this.prisma.user.findMany({
        where: { timezone: { not: null }, deletedAt: null },
        select: { id: true, timezone: true },
      });

      const now = new Date();
      for (const quest of quests) {
        const type = QUEST_KEY_TO_NOTIFICATION_TYPE[quest.key];
        if (!type) continue;

        for (const user of users) {
          if (playerLocalHour(user.timezone, now) !== quest.windowStartHour) continue;

          const today = playerLocalDate(user.timezone, now);
          const existingAttempt = await this.prisma.questAttempt.findFirst({
            where: { userId: user.id, questId: quest.id, localDate: today },
            select: { id: true },
          });
          if (existingAttempt) continue; // already started or completed today — no reminder needed

          this.notifications.notifyFireAndForget(
            user.id,
            type,
            quest.title,
            `${quest.title} is ready — one word, a couple of minutes.`,
            { deepLink: `wordquest://daily-quest/${quest.key}` },
          );
        }
      }
    } catch (err) {
      this.logger.warn(`sendQuestWindowReminders failed: ${err}`);
    }
  }

  /** Once-daily-per-player review reminder, fired only in the player's local morning (spec §15). */
  @Cron(gameplayRules.notificationScheduler.hourlyCronExpression)
  async sendReviewReminders(): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: { timezone: { not: null }, deletedAt: null },
        select: { id: true, timezone: true },
      });

      const now = new Date();
      for (const user of users) {
        if (
          playerLocalHour(user.timezone, now) !==
          gameplayRules.notificationScheduler.reviewReminderLocalHour
        ) {
          continue;
        }

        const dueCount = await this.prisma.mastery.count({
          where: { userId: user.id, nextReviewDueAt: { lte: now } },
        });
        if (dueCount === 0) continue;

        this.notifications.notifyFireAndForget(
          user.id,
          'REVIEW_REMINDER',
          'Words are ready for review',
          `${dueCount} word${dueCount === 1 ? '' : 's'} could use a review today.`,
          { deepLink: 'wordquest://quest' },
        );
      }
    } catch (err) {
      this.logger.warn(`sendReviewReminders failed: ${err}`);
    }
  }

  /** One reminder to every player roughly an hour before the weekly Boss Battle window opens — a global, simultaneous event, not player-local like the other two triggers. */
  @Cron(gameplayRules.notificationScheduler.bossBattleReminderCronExpression)
  async sendBossBattleReminder(): Promise<void> {
    try {
      const now = new Date();
      const { start } = nextBattleWindow(now);
      const minutesUntilStart = (start.getTime() - now.getTime()) / (60 * 1000);
      const { bossBattleReminderLeadMinutesMin, bossBattleReminderLeadMinutesMax } =
        gameplayRules.notificationScheduler;
      if (
        minutesUntilStart < bossBattleReminderLeadMinutesMin ||
        minutesUntilStart >= bossBattleReminderLeadMinutesMax
      ) {
        return;
      }

      const users = await this.prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      for (const user of users) {
        this.notifications.notifyFireAndForget(
          user.id,
          'BOSS_BATTLE_REMINDER',
          'Boss Battle starts soon',
          'This week’s Boss Battle opens in about an hour.',
          { deepLink: 'wordquest://boss-battle' },
        );
      }
    } catch (err) {
      this.logger.warn(`sendBossBattleReminder failed: ${err}`);
    }
  }

  /**
   * WEAK_SKILL_REMINDER (Correction & Completion Spec §6) — nudges a
   * calibrated player toward whatever LearningProfileService currently
   * has flagged in `weaknessAreas` (recomputed on every completed word,
   * see learning-profile.service.ts — always current, never a stale
   * calibration-time snapshot). Skipped entirely for a player with no
   * flagged weakness right now — there's nothing honest to nudge about.
   */
  @Cron(gameplayRules.notificationScheduler.hourlyCronExpression)
  async sendWeakSkillReminders(): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: { timezone: { not: null }, deletedAt: null },
        select: { id: true, timezone: true },
      });

      const now = new Date();
      const { weakSkillReminderLocalHour, weakSkillReminderCooldownDays } =
        gameplayRules.notificationScheduler;

      for (const user of users) {
        if (playerLocalHour(user.timezone, now) !== weakSkillReminderLocalHour) continue;

        const profile = await this.prisma.learningProfile.findUnique({
          where: { userId: user.id },
          select: { calibrated: true, weaknessAreas: true },
        });
        if (!profile?.calibrated || profile.weaknessAreas.length === 0) continue;

        const last = await this.lastNotificationOfType(user.id, 'WEAK_SKILL_REMINDER');
        if (!this.cooldownElapsed(last, weakSkillReminderCooldownDays, now)) continue;

        const areas = profile.weaknessAreas.join(', ');
        this.notifications.notifyFireAndForget(
          user.id,
          'WEAK_SKILL_REMINDER',
          'A skill worth practicing',
          `Your current weak spot: ${areas}. A quest or two could help.`,
          { data: { weaknessAreas: profile.weaknessAreas }, deepLink: 'wordquest://skill-radar' },
        );
      }
    } catch (err) {
      this.logger.warn(`sendWeakSkillReminders failed: ${err}`);
    }
  }

  /**
   * FORGETTING_CURVE_REMINDER (Correction & Completion Spec §6) — the
   * richer, ALI-voiced sibling of the generic daily REVIEW_REMINDER
   * above. Where that one fires on "any word past due," this one only
   * fires when at least one word's live-computed forgetting risk
   * (vocabulary/review-schedule.ts's computeForgettingRisk — 0-1,
   * recomputed from timestamps every time, never a stale stored value)
   * has crossed forgettingCurveRiskThreshold, and asks
   * AliService.generateForgettingCurveReminder for message text instead
   * of a fixed template, so the two reminders read as genuinely
   * different nudges rather than duplicates of each other.
   */
  @Cron(gameplayRules.notificationScheduler.hourlyCronExpression)
  async sendForgettingCurveReminders(): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: { timezone: { not: null }, deletedAt: null },
        select: { id: true, timezone: true },
      });

      const now = new Date();
      const {
        forgettingCurveReminderLocalHour,
        forgettingCurveReminderCooldownDays,
        forgettingCurveRiskThreshold,
      } = gameplayRules.notificationScheduler;

      for (const user of users) {
        if (playerLocalHour(user.timezone, now) !== forgettingCurveReminderLocalHour) continue;

        const last = await this.lastNotificationOfType(user.id, 'FORGETTING_CURVE_REMINDER');
        if (!this.cooldownElapsed(last, forgettingCurveReminderCooldownDays, now)) continue;

        const masteries = await this.prisma.mastery.findMany({
          where: {
            userId: user.id,
            lastReviewedAt: { not: null },
            nextReviewDueAt: { not: null },
          },
          select: { lastReviewedAt: true, nextReviewDueAt: true, word: { select: { word: true } } },
        });

        const wordsNeedingReview = masteries
          .filter(
            (m: { lastReviewedAt: Date | null; nextReviewDueAt: Date | null }) =>
              computeForgettingRisk(m.lastReviewedAt, m.nextReviewDueAt, now) >=
              forgettingCurveRiskThreshold,
          )
          .map((m: { word: { word: string } }) => m.word.word);

        if (wordsNeedingReview.length === 0) continue;

        const reminder = await this.ali.generateForgettingCurveReminder(user.id, {
          wordsNeedingReview,
        });

        this.notifications.notifyFireAndForget(
          user.id,
          'FORGETTING_CURVE_REMINDER',
          'Slipping away?',
          reminder.text,
          { data: { wordsNeedingReview }, deepLink: 'wordquest://quest' },
        );
      }
    } catch (err) {
      this.logger.warn(`sendForgettingCurveReminders failed: ${err}`);
    }
  }

  /**
   * LEADERBOARD_UPDATE (Correction & Completion Spec §6) — notifies a
   * player once a day when they're inside the global top-N, or when
   * they've climbed at least rankImprovementThreshold places since the
   * last time this fired for them. Rank is looked up via
   * LeaderboardsService.getRankForXp — the same single count-query the
   * full leaderboard view uses for `viewer`, not the wasteful top-50
   * `entries` pull `getGlobal` also does, which would be pure waste
   * repeated once per player in this loop.
   */
  @Cron(gameplayRules.notificationScheduler.hourlyCronExpression)
  async sendLeaderboardNotifications(): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: { timezone: { not: null }, deletedAt: null },
        select: { id: true, timezone: true },
      });

      const now = new Date();
      const {
        leaderboardCheckLocalHour,
        leaderboardCheckCooldownDays,
        leaderboardTopRankThreshold,
        leaderboardRankImprovementThreshold,
      } = gameplayRules.notificationScheduler;

      for (const user of users) {
        if (playerLocalHour(user.timezone, now) !== leaderboardCheckLocalHour) continue;

        const last = await this.lastNotificationOfType(user.id, 'LEADERBOARD_UPDATE');
        if (!this.cooldownElapsed(last, leaderboardCheckCooldownDays, now)) continue;

        const progression = await this.prisma.userProgression.findUnique({
          where: { userId: user.id },
          select: { totalXp: true },
        });
        if (!progression) continue;

        const rank = await this.leaderboards.getRankForXp(progression.totalXp);
        const lastKnownRank = (last?.data as { rank?: number } | null)?.rank;
        const climbedEnough =
          lastKnownRank !== undefined &&
          lastKnownRank - rank >= leaderboardRankImprovementThreshold;

        if (rank > leaderboardTopRankThreshold && !climbedEnough) continue;

        this.notifications.notifyFireAndForget(
          user.id,
          'LEADERBOARD_UPDATE',
          'Leaderboard movement',
          rank <= leaderboardTopRankThreshold
            ? `You're #${rank} on the global leaderboard.`
            : `You've climbed to #${rank} on the global leaderboard.`,
          { data: { rank }, deepLink: 'wordquest://compete' },
        );
      }
    } catch (err) {
      this.logger.warn(`sendLeaderboardNotifications failed: ${err}`);
    }
  }

  /**
   * STREAK_AT_RISK (requested directly, Sept 2026): evening nudges at
   * each of notificationScheduler.streakAtRiskLocalHours (18/21/23,
   * player-local) for anyone who hasn't done anything quest-worthy yet
   * today. "Yet today" is UserProgression.lastActiveOn compared by
   * player-local calendar date -- the exact same check
   * ProgressionService.recordDailyActivity uses to decide whether the
   * streak extends, so this fires precisely when (and only when) that
   * player's streak is genuinely still unclaimed for today, never a
   * separately-derived approximation of it.
   *
   * Unlike the cooldown-gated triggers above, there's no multi-day
   * anti-repeat here: these three checkpoints are one escalating same-
   * day sequence (see streakAtRiskCopy), and each can only match once
   * per day anyway since it's gated on the player's local hour landing
   * on an exact checkpoint value while this job itself only runs
   * hourly.
   */
  @Cron(gameplayRules.notificationScheduler.hourlyCronExpression)
  async sendStreakAtRiskReminders(): Promise<void> {
    try {
      const { streakAtRiskLocalHours } = gameplayRules.notificationScheduler;
      const checkpoints: readonly number[] = streakAtRiskLocalHours;
      const now = new Date();

      const users = await this.prisma.user.findMany({
        where: { timezone: { not: null }, deletedAt: null },
        select: { id: true, timezone: true },
      });

      for (const user of users) {
        const localHour = playerLocalHour(user.timezone, now);
        if (!checkpoints.includes(localHour)) continue;

        const progression = await this.prisma.userProgression.findUnique({
          where: { userId: user.id },
          select: { currentStreak: true, lastActiveOn: true },
        });
        if (!progression) continue;

        const today = playerLocalDate(user.timezone, now);
        const lastActiveDay = progression.lastActiveOn
          ? playerLocalDate(user.timezone, progression.lastActiveOn)
          : null;
        if (lastActiveDay === today) continue; // already played today -- streak's safe, nothing to nudge about

        const { title, body } = this.streakAtRiskCopy(localHour, progression.currentStreak);
        this.notifications.notifyFireAndForget(user.id, 'STREAK_AT_RISK', title, body, {
          data: { localHour, currentStreak: progression.currentStreak },
          deepLink: 'wordquest://quest',
        });
      }
    } catch (err) {
      this.logger.warn(`sendStreakAtRiskReminders failed: ${err}`);
    }
  }

  /**
   * Message copy for sendStreakAtRiskReminders, keyed by which of the
   * three checkpoints this is -- gentle at 18:00, firmer at 21:00,
   * urgent at 23:00 (player-local) -- and by whether the player actually
   * has a streak at stake, so someone on day zero gets "come play" rather
   * than a streak number that doesn't exist yet.
   */
  private streakAtRiskCopy(
    localHour: number,
    currentStreak: number,
  ): { title: string; body: string } {
    const hasStreak = currentStreak > 0;
    if (localHour === 18) {
      return hasStreak
        ? {
            title: 'Your streak is waiting',
            body: `Keep your ${currentStreak}-day streak alive — today's quest is still open.`,
          }
        : { title: "Today's quest is still open", body: 'A couple of minutes is all it takes.' };
    }
    if (localHour === 21) {
      return hasStreak
        ? {
            title: 'A few hours left',
            body: `Don't lose your ${currentStreak}-day streak — play today's quest before midnight.`,
          }
        : { title: 'Still time today', body: "Today's quest only takes a couple of minutes." };
    }
    // 23:00 -- last checkpoint before the player's local midnight rolls the streak over
    return hasStreak
      ? {
          title: 'Last call for your streak',
          body: `Your ${currentStreak}-day streak resets at midnight if you don't play now.`,
        }
      : { title: 'Last call for today', body: "Today's quest closes at midnight." };
  }
}
