import { AnalyticsQueryService } from './analytics-query.service';

describe('AnalyticsQueryService', () => {
  const prismaMock = {
    user: { count: jest.fn() },
    analyticsEvent: { groupBy: jest.fn(), count: jest.fn() },
    wordDuelMatch: { groupBy: jest.fn() },
    wordDuelAnswer: { aggregate: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    arcadeGameSession: { groupBy: jest.fn() },
    arcadeAnswer: { aggregate: jest.fn(), count: jest.fn() },
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
        .mockResolvedValueOnce(90) // QUEST_STARTED
        .mockResolvedValueOnce(40) // boss_battle_joined
        .mockResolvedValueOnce(15) // shop_purchase
        .mockResolvedValueOnce(60); // ARCADE_SESSION_STARTED

      const result = await service.getOverview();

      expect(result).toEqual({
        registeredUsers: 500,
        activeUsersLast24h: 2,
        activeUsersLast7d: 3,
        questsCompleted: 120,
        questsStarted: 90,
        bossBattlesJoined: 40,
        shopPurchases: 15,
        arcadeSessionsStarted: 60,
      });
      expect(prismaMock.analyticsEvent.count).toHaveBeenCalledWith({
        where: { eventName: 'quest_completed' },
      });
      expect(prismaMock.analyticsEvent.count).toHaveBeenCalledWith({
        where: { eventName: 'QUEST_STARTED' },
      });
      expect(prismaMock.analyticsEvent.count).toHaveBeenCalledWith({
        where: { eventName: 'boss_battle_joined' },
      });
      expect(prismaMock.analyticsEvent.count).toHaveBeenCalledWith({
        where: { eventName: 'shop_purchase' },
      });
      expect(prismaMock.analyticsEvent.count).toHaveBeenCalledWith({
        where: { eventName: 'ARCADE_SESSION_STARTED' },
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

  describe('getArcadeDashboard', () => {
    it('assembles per-game session-status counts, correctness, and averages for both games', async () => {
      prismaMock.arcadeGameSession.groupBy.mockImplementation(({ where }: any) => {
        if (where.game === 'SCRAMBLE_QUEST') {
          return Promise.resolve([
            { status: 'ACTIVE', _count: { _all: 2 } },
            { status: 'COMPLETED', _count: { _all: 30 } },
            { status: 'ABANDONED', _count: { _all: 4 } },
          ]);
        }
        return Promise.resolve([
          { status: 'ACTIVE', _count: { _all: 1 } },
          { status: 'COMPLETED', _count: { _all: 10 } },
          { status: 'ABANDONED', _count: { _all: 1 } },
        ]);
      });
      prismaMock.arcadeAnswer.aggregate.mockImplementation(({ where }: any) => {
        if (where.session.game === 'SCRAMBLE_QUEST') {
          return Promise.resolve({
            _avg: { hintsUsed: 0.6, responseTimeMs: 5200 },
            _count: { _all: 300 },
          });
        }
        return Promise.resolve({
          _avg: { hintsUsed: 0.3, responseTimeMs: 4100 },
          _count: { _all: 100 },
        });
      });
      prismaMock.arcadeAnswer.count.mockImplementation(({ where }: any) => {
        if (where.session.game === 'SCRAMBLE_QUEST') return Promise.resolve(240);
        return Promise.resolve(80);
      });

      const result = await service.getArcadeDashboard();

      expect(result.scrambleQuest).toEqual({
        sessionsActive: 2,
        sessionsCompleted: 30,
        sessionsAbandoned: 4,
        totalAnswers: 300,
        correctAnswers: 240,
        correctRate: 0.8,
        avgHintsUsed: 0.6,
        avgResponseTimeMs: 5200,
      });
      expect(result.completeIt).toEqual({
        sessionsActive: 1,
        sessionsCompleted: 10,
        sessionsAbandoned: 1,
        totalAnswers: 100,
        correctAnswers: 80,
        correctRate: 0.8,
        avgHintsUsed: 0.3,
        avgResponseTimeMs: 4100,
      });
    });

    it('returns null rates/averages rather than dividing by zero when a game has no answers yet', async () => {
      prismaMock.arcadeGameSession.groupBy.mockResolvedValue([]);
      prismaMock.arcadeAnswer.aggregate.mockResolvedValue({
        _avg: { hintsUsed: null, responseTimeMs: null },
        _count: { _all: 0 },
      });
      prismaMock.arcadeAnswer.count.mockResolvedValue(0);

      const result = await service.getArcadeDashboard();

      expect(result.scrambleQuest.correctRate).toBeNull();
      expect(result.scrambleQuest.avgHintsUsed).toBeNull();
      expect(result.scrambleQuest.avgResponseTimeMs).toBeNull();
      expect(result.completeIt.sessionsActive).toBe(0);
    });
  });
});
