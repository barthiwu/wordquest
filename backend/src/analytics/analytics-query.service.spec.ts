import { AnalyticsQueryService } from './analytics-query.service';

describe('AnalyticsQueryService', () => {
  const prismaMock = {
    user: { count: jest.fn() },
    analyticsEvent: { groupBy: jest.fn(), count: jest.fn() },
    wordDuelMatch: { groupBy: jest.fn() },
    wordDuelAnswer: { aggregate: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  };
  let service: AnalyticsQueryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsQueryService(prismaMock as any);
  });

  describe('getOverview', () => {
    it('assembles registered/active user counts and legacy event counts', async () => {
      prismaMock.user.count.mockResolvedValue(500);
      prismaMock.analyticsEvent.groupBy
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // 24h
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]); // 7d
      prismaMock.analyticsEvent.count
        .mockResolvedValueOnce(120) // quest_completed
        .mockResolvedValueOnce(40) // boss_battle_joined
        .mockResolvedValueOnce(15); // shop_purchase

      const result = await service.getOverview();

      expect(result).toEqual({
        registeredUsers: 500,
        activeUsersLast24h: 2,
        activeUsersLast7d: 3,
        questsCompleted: 120,
        bossBattlesJoined: 40,
        shopPurchases: 15,
      });
      expect(prismaMock.analyticsEvent.count).toHaveBeenCalledWith({
        where: { eventName: 'quest_completed' },
      });
      expect(prismaMock.analyticsEvent.count).toHaveBeenCalledWith({
        where: { eventName: 'boss_battle_joined' },
      });
      expect(prismaMock.analyticsEvent.count).toHaveBeenCalledWith({
        where: { eventName: 'shop_purchase' },
      });
    });

    it('excludes null userIds from the active-user groupBy queries', async () => {
      prismaMock.user.count.mockResolvedValue(0);
      prismaMock.analyticsEvent.groupBy.mockResolvedValue([]);
      prismaMock.analyticsEvent.count.mockResolvedValue(0);

      await service.getOverview();

      const [firstCall] = prismaMock.analyticsEvent.groupBy.mock.calls;
      expect(firstCall[0].where.userId).toEqual({ not: null });
    });
  });

  describe('getWordDuelDashboard', () => {
    it('assembles match-status counts, correctness, and clue/response-time averages', async () => {
      prismaMock.wordDuelMatch.groupBy.mockResolvedValue([
        { status: 'WAITING', _count: { _all: 3 } },
        { status: 'ACTIVE', _count: { _all: 5 } },
        { status: 'COMPLETED', _count: { _all: 40 } },
        { status: 'ABANDONED', _count: { _all: 2 } },
      ]);
      prismaMock.wordDuelAnswer.aggregate.mockResolvedValue({
        _avg: { cluesRevealed: 1.8, responseTimeMs: 14200 },
        _count: { _all: 200 },
      });
      prismaMock.wordDuelAnswer.count.mockResolvedValue(150);
      prismaMock.wordDuelAnswer.groupBy.mockResolvedValue([
        { cluesRevealed: 0, _count: { _all: 20 } },
        { cluesRevealed: 1, _count: { _all: 80 } },
        { cluesRevealed: 2, _count: { _all: 50 } },
        { cluesRevealed: 5, _count: { _all: 50 } },
      ]);

      const result = await service.getWordDuelDashboard();

      expect(result.matchesWaiting).toBe(3);
      expect(result.matchesActive).toBe(5);
      expect(result.matchesCompleted).toBe(40);
      expect(result.matchesAbandonedWaiting).toBe(2);
      expect(result.totalAnswers).toBe(200);
      expect(result.correctAnswers).toBe(150);
      expect(result.correctRate).toBe(0.75);
      expect(result.avgCluesUsed).toBe(1.8);
      expect(result.avgResponseTimeMs).toBe(14200);
      // Cumulative "at least N clues" funnel: 20 used 0, 80 used 1, 50
      // used 2, 0 used 3 or 4, 50 used all 5 -- out of 200 total.
      expect(result.clueUsage).toEqual([
        { clueNumber: 1, fraction: 180 / 200 }, // everyone except the 20 zero-clue answers
        { clueNumber: 2, fraction: 100 / 200 },
        { clueNumber: 3, fraction: 50 / 200 },
        { clueNumber: 4, fraction: 50 / 200 },
        { clueNumber: 5, fraction: 50 / 200 },
      ]);
    });

    it('returns null rates/averages rather than dividing by zero when there are no answers yet', async () => {
      prismaMock.wordDuelMatch.groupBy.mockResolvedValue([]);
      prismaMock.wordDuelAnswer.aggregate.mockResolvedValue({
        _avg: { cluesRevealed: null, responseTimeMs: null },
        _count: { _all: 0 },
      });
      prismaMock.wordDuelAnswer.count.mockResolvedValue(0);
      prismaMock.wordDuelAnswer.groupBy.mockResolvedValue([]);

      const result = await service.getWordDuelDashboard();

      expect(result.matchesWaiting).toBe(0);
      expect(result.correctRate).toBeNull();
      expect(result.avgCluesUsed).toBeNull();
      expect(result.avgResponseTimeMs).toBeNull();
      expect(result.clueUsage.every((row) => row.fraction === 0)).toBe(true);
    });
  });
});
