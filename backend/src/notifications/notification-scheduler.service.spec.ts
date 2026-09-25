import { NotificationSchedulerService } from './notification-scheduler.service';

function utc(y: number, m: number, d: number, h = 0, min = 0, s = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, s));
}

describe('NotificationSchedulerService', () => {
  let service: NotificationSchedulerService;

  const prismaMock = {
    quest: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    questAttempt: { findFirst: jest.fn() },
    mastery: { count: jest.fn(), findMany: jest.fn() },
    learningProfile: { findUnique: jest.fn() },
    notification: { findFirst: jest.fn() },
    userProgression: { findUnique: jest.fn() },
  };
  const notificationsMock = { notifyFireAndForget: jest.fn() };
  const aliMock = { generateForgettingCurveReminder: jest.fn() };
  const leaderboardsMock = { getRankForXp: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    service = new NotificationSchedulerService(
      prismaMock as any,
      notificationsMock as any,
      aliMock as any,
      leaderboardsMock as any,
    );
  });

  describe('sendQuestWindowReminders', () => {
    const morningQuest = {
      id: 'q1',
      key: 'morning-quest',
      title: 'Morning Quest',
      windowStartHour: 8,
    };

    it('reminds a user whose local hour matches the window and has no attempt today', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 8, 0, 0)); // UTC 08:00 == UTC user's local 08:00
      prismaMock.quest.findMany.mockResolvedValueOnce([morningQuest]);
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);

      await service.sendQuestWindowReminders();

      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'MORNING_QUEST',
        'Morning Quest',
        expect.any(String),
        { deepLink: 'wordquest://daily-quest/morning-quest' },
      );
    });

    it('does not remind when an attempt already exists today', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 8, 0, 0));
      prismaMock.quest.findMany.mockResolvedValueOnce([morningQuest]);
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce({ id: 'existing' });

      await service.sendQuestWindowReminders();

      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('does not remind when the local hour does not match the window', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 9, 0, 0));
      prismaMock.quest.findMany.mockResolvedValueOnce([morningQuest]);
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);

      await service.sendQuestWindowReminders();

      expect(prismaMock.questAttempt.findFirst).not.toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('skips a quest key with no NotificationType mapping', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 8, 0, 0));
      prismaMock.quest.findMany.mockResolvedValueOnce([
        { id: 'q9', key: 'unmapped-quest', title: 'Mystery Quest', windowStartHour: 8 },
      ]);
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);

      await service.sendQuestWindowReminders();

      expect(prismaMock.user.findMany).toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('does nothing when there are no active windowed quests', async () => {
      prismaMock.quest.findMany.mockResolvedValueOnce([]);

      await service.sendQuestWindowReminders();

      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('swallows and logs errors rather than throwing', async () => {
      prismaMock.quest.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.sendQuestWindowReminders()).resolves.toBeUndefined();
    });
  });

  describe('sendReviewReminders', () => {
    it('reminds a user at their local reminder hour when words are due', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 9, 0, 0)); // reviewReminderLocalHour = 9
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.mastery.count.mockResolvedValueOnce(3);

      await service.sendReviewReminders();

      expect(prismaMock.mastery.count).toHaveBeenCalledWith({
        where: { userId: 'u1', nextReviewDueAt: { lte: expect.any(Date) } },
      });
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'REVIEW_REMINDER',
        expect.any(String),
        expect.stringContaining('3 words'),
        { deepLink: 'wordquest://quest' },
      );
    });

    it('does not remind when no words are due', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 9, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.mastery.count.mockResolvedValueOnce(0);

      await service.sendReviewReminders();

      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('does not check due words outside the configured local hour', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 14, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);

      await service.sendReviewReminders();

      expect(prismaMock.mastery.count).not.toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('swallows and logs errors rather than throwing', async () => {
      prismaMock.user.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.sendReviewReminders()).resolves.toBeUndefined();
    });
  });

  describe('sendBossBattleReminder', () => {
    it('notifies everyone when the battle window opens in the lead-time range', async () => {
      // Next battle window is Sunday 17:00 UTC. 60 minutes before is 16:00 UTC on a Sunday.
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 16, 0, 0)); // 2026-08-23 is a Sunday
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]);

      await service.sendBossBattleReminder();

      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledTimes(2);
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'BOSS_BATTLE_REMINDER',
        expect.any(String),
        expect.any(String),
        { deepLink: 'wordquest://boss-battle' },
      );
    });

    it('does not notify when far outside the lead-time window', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 10, 0, 0)); // 7 hours before window
      // No user.findMany mock queued: the lead-time check short-circuits
      // before the function ever reaches that query, so queuing a
      // response here would go unconsumed and leak into a later test's
      // queue on this same shared mock (see the other describe blocks
      // below that also call prisma.user.findMany).

      await service.sendBossBattleReminder();

      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('swallows and logs errors rather than throwing', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 16, 0, 0));
      prismaMock.user.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.sendBossBattleReminder()).resolves.toBeUndefined();
    });
  });

  describe('sendWeakSkillReminders', () => {
    it('reminds a calibrated user with a flagged weakness, at their local hour', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 18, 0, 0)); // weakSkillReminderLocalHour = 18
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: true,
        weaknessAreas: ['writing'],
      });
      prismaMock.notification.findFirst.mockResolvedValueOnce(null);

      await service.sendWeakSkillReminders();

      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'WEAK_SKILL_REMINDER',
        expect.any(String),
        expect.stringContaining('writing'),
        { data: { weaknessAreas: ['writing'] }, deepLink: 'wordquest://skill-radar' },
      );
    });

    it('skips an uncalibrated user', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 18, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: false,
        weaknessAreas: ['writing'],
      });

      await service.sendWeakSkillReminders();

      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('skips a user with no flagged weakness right now', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 18, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: true,
        weaknessAreas: [],
      });

      await service.sendWeakSkillReminders();

      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('does not repeat within the cooldown window', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 18, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.learningProfile.findUnique.mockResolvedValueOnce({
        calibrated: true,
        weaknessAreas: ['writing'],
      });
      prismaMock.notification.findFirst.mockResolvedValueOnce({
        createdAt: utc(2026, 8, 22, 18, 0, 0), // 1 day ago; cooldown is 3 days
        data: null,
      });

      await service.sendWeakSkillReminders();

      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('swallows and logs errors rather than throwing', async () => {
      prismaMock.user.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.sendWeakSkillReminders()).resolves.toBeUndefined();
    });
  });

  describe('sendForgettingCurveReminders', () => {
    it('reminds a user with a word at/above the forgetting-risk threshold, using an ALI-generated message', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 19, 0, 0)); // forgettingCurveReminderLocalHour = 19
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.notification.findFirst.mockResolvedValueOnce(null);
      prismaMock.mastery.findMany.mockResolvedValueOnce([
        {
          // Fully elapsed interval — well past due, risk should be 1.
          lastReviewedAt: utc(2026, 8, 1, 0, 0, 0),
          nextReviewDueAt: utc(2026, 8, 2, 0, 0, 0),
          word: { word: 'ephemeral' },
        },
      ]);
      aliMock.generateForgettingCurveReminder.mockResolvedValueOnce({
        text: "You're forgetting 'ephemeral' — quick review?",
      });

      await service.sendForgettingCurveReminders();

      expect(aliMock.generateForgettingCurveReminder).toHaveBeenCalledWith('u1', {
        wordsNeedingReview: ['ephemeral'],
      });
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'FORGETTING_CURVE_REMINDER',
        expect.any(String),
        "You're forgetting 'ephemeral' — quick review?",
        { data: { wordsNeedingReview: ['ephemeral'] }, deepLink: 'wordquest://quest' },
      );
    });

    it('skips a user with no word at/above the risk threshold', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 19, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.notification.findFirst.mockResolvedValueOnce(null);
      prismaMock.mastery.findMany.mockResolvedValueOnce([
        {
          // reviewed just now, due far in the future — risk near 0.
          lastReviewedAt: utc(2026, 8, 23, 19, 0, 0),
          nextReviewDueAt: utc(2026, 9, 23, 19, 0, 0),
          word: { word: 'fresh' },
        },
      ]);

      await service.sendForgettingCurveReminders();

      expect(aliMock.generateForgettingCurveReminder).not.toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('does not repeat within the cooldown window', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 19, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.notification.findFirst.mockResolvedValueOnce({
        createdAt: utc(2026, 8, 22, 19, 0, 0), // 1 day ago; cooldown is 2 days
        data: null,
      });

      await service.sendForgettingCurveReminders();

      expect(prismaMock.mastery.findMany).not.toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('swallows and logs errors rather than throwing', async () => {
      prismaMock.user.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.sendForgettingCurveReminders()).resolves.toBeUndefined();
    });
  });

  describe('sendLeaderboardNotifications', () => {
    it('notifies a user who has entered the top rank threshold', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 20, 0, 0)); // leaderboardCheckLocalHour = 20
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.notification.findFirst.mockResolvedValueOnce(null);
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({ totalXp: 5000 });
      leaderboardsMock.getRankForXp.mockResolvedValueOnce(7); // <= threshold of 10

      await service.sendLeaderboardNotifications();

      expect(leaderboardsMock.getRankForXp).toHaveBeenCalledWith(5000);
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'LEADERBOARD_UPDATE',
        expect.any(String),
        expect.any(String),
        { data: { rank: 7 }, deepLink: 'wordquest://compete' },
      );
    });

    it('notifies a user who climbed enough since the last known rank, even outside the top threshold', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 20, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.notification.findFirst.mockResolvedValueOnce({
        createdAt: utc(2026, 8, 20, 20, 0, 0), // 3 days ago; cooldown is 1 day, so elapsed
        data: { rank: 40 },
      });
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({ totalXp: 2000 });
      leaderboardsMock.getRankForXp.mockResolvedValueOnce(30); // climbed 10 places (>= threshold of 5)

      await service.sendLeaderboardNotifications();

      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'LEADERBOARD_UPDATE',
        expect.any(String),
        expect.any(String),
        { data: { rank: 30 }, deepLink: 'wordquest://compete' },
      );
    });

    it('does not notify a user outside the top threshold who has not climbed enough', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 20, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.notification.findFirst.mockResolvedValueOnce({
        createdAt: utc(2026, 8, 20, 20, 0, 0),
        data: { rank: 32 },
      });
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({ totalXp: 2000 });
      leaderboardsMock.getRankForXp.mockResolvedValueOnce(30); // only climbed 2 places

      await service.sendLeaderboardNotifications();

      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('does not repeat within the cooldown window', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 20, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.notification.findFirst.mockResolvedValueOnce({
        createdAt: utc(2026, 8, 23, 10, 0, 0), // 10 hours ago; cooldown is 1 day
        data: { rank: 5 },
      });

      await service.sendLeaderboardNotifications();

      expect(prismaMock.userProgression.findUnique).not.toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('swallows and logs errors rather than throwing', async () => {
      prismaMock.user.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.sendLeaderboardNotifications()).resolves.toBeUndefined();
    });
  });

  describe('sendStreakAtRiskReminders', () => {
    it('nudges a user at the 18:00 local checkpoint who has not played today', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 18, 0, 0)); // UTC user's local 18:00
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({
        currentStreak: 4,
        lastActiveOn: utc(2026, 8, 22, 9, 0, 0), // yesterday -- not today
      });

      await service.sendStreakAtRiskReminders();

      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'STREAK_AT_RISK',
        expect.any(String),
        expect.stringContaining('4-day streak'),
        { data: { localHour: 18, currentStreak: 4 }, deepLink: 'wordquest://quest' },
      );
    });

    it('nudges at the 21:00 and 23:00 checkpoints too, with escalating copy', async () => {
      for (const hour of [21, 23]) {
        jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, hour, 0, 0));
        prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
        prismaMock.userProgression.findUnique.mockResolvedValueOnce({
          currentStreak: 2,
          lastActiveOn: null,
        });

        await service.sendStreakAtRiskReminders();

        expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
          'u1',
          'STREAK_AT_RISK',
          expect.any(String),
          expect.stringContaining('2-day streak'),
          { data: { localHour: hour, currentStreak: 2 }, deepLink: 'wordquest://quest' },
        );
        notificationsMock.notifyFireAndForget.mockClear();
      }
    });

    it('does not nudge outside the three checkpoint hours', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 19, 0, 0)); // not 18/21/23
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);

      await service.sendStreakAtRiskReminders();

      expect(prismaMock.userProgression.findUnique).not.toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('does not nudge a player who already played today', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 21, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({
        currentStreak: 4,
        lastActiveOn: utc(2026, 8, 23, 8, 0, 0), // earlier today
      });

      await service.sendStreakAtRiskReminders();

      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('uses "come play" copy rather than a streak number for a player on day zero', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 18, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1', timezone: 'UTC' }]);
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({
        currentStreak: 0,
        lastActiveOn: null,
      });

      await service.sendStreakAtRiskReminders();

      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'STREAK_AT_RISK',
        expect.any(String),
        expect.not.stringContaining('day streak'),
        { data: { localHour: 18, currentStreak: 0 }, deepLink: 'wordquest://quest' },
      );
    });

    it('checks each player at THEIR OWN local checkpoint hour, not server time', async () => {
      // Server UTC is 21:00; a user 3 hours behind UTC (offset -03:00) is
      // at local 18:00 right now -- their first checkpoint.
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 23, 21, 0, 0));
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: 'u1', timezone: 'America/Sao_Paulo' },
      ]);
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({
        currentStreak: 1,
        lastActiveOn: null,
      });

      await service.sendStreakAtRiskReminders();

      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'STREAK_AT_RISK',
        expect.any(String),
        expect.any(String),
        { data: { localHour: 18, currentStreak: 1 }, deepLink: 'wordquest://quest' },
      );
    });

    it('swallows and logs errors rather than throwing', async () => {
      prismaMock.user.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.sendStreakAtRiskReminders()).resolves.toBeUndefined();
    });
  });
});
