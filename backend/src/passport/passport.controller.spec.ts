import { PassportController } from './passport.controller';

describe('PassportController', () => {
  let controller: PassportController;

  const prismaMock = {
    user: { findUniqueOrThrow: jest.fn() },
    achievementUnlock: { findMany: jest.fn() },
    bossBattlePlayer: { findMany: jest.fn() },
    orderSelection: { findFirst: jest.fn() },
  };
  const questCardsMock = { listShowcase: jest.fn() };

  const baseUser = {
    displayName: 'Ada',
    countryCode: 'US',
    clan: null,
    progression: {
      level: 5,
      journeyStage: 0,
      masteredWordsCount: 10,
      currentStreak: 3,
      longestStreak: 5,
      cefrUnlocked: false,
      estimatedCefrLevel: 'B1',
    },
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Direct instantiation, not Test.createTestingModule — same reason
    // as SkillsController's spec: @UseGuards(JwtAuthGuard) would pull in
    // JwtAuthGuard's own DI chain for no reason in a unit test of the
    // controller's own logic.
    questCardsMock.listShowcase.mockResolvedValue([]);
    controller = new PassportController(prismaMock as any, questCardsMock as any);
  });

  it('maps real AchievementUnlock rows to catalog names, not an empty placeholder', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce(baseUser);
    prismaMock.achievementUnlock.findMany.mockResolvedValueOnce([
      { achievementId: 'first_step', unlockedAt: new Date('2026-02-01') },
    ]);
    prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([]);
    prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);

    const result = await controller.me('u1');

    expect(result.achievements).toEqual([
      expect.objectContaining({ id: 'first_step', name: 'First Step', category: 'DISCOVERY' }),
    ]);
  });

  it('maps real BossBattlePlayer finalRank rows to placement history, not an empty placeholder', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce(baseUser);
    prismaMock.achievementUnlock.findMany.mockResolvedValueOnce([]);
    prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([
      {
        finalRank: 2,
        isWinner: false,
        battleXp: 500,
        group: { battle: { weekId: '2026-W10' } },
      },
    ]);
    prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);

    const result = await controller.me('u1');

    expect(result.bossBattleHistory).toEqual([
      { weekId: '2026-W10', placement: 2, isWinner: false, battleXp: 500 },
    ]);
    expect(prismaMock.bossBattlePlayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', finalRank: { not: null } } }),
    );
  });

  it("exposes the player's current Order from the catalog", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce(baseUser);
    prismaMock.achievementUnlock.findMany.mockResolvedValueOnce([]);
    prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([]);
    prismaMock.orderSelection.findFirst.mockResolvedValueOnce({
      order: 'SEEKERS',
      selectedAt: new Date(),
    });

    const result = await controller.me('u1');

    expect(result.order).toEqual(expect.objectContaining({ key: 'SEEKERS', name: 'The Seekers' }));
  });

  it('returns null Order when the player has never selected one', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce(baseUser);
    prismaMock.achievementUnlock.findMany.mockResolvedValueOnce([]);
    prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([]);
    prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);

    const result = await controller.me('u1');

    expect(result.order).toBeNull();
  });

  it('exposes the rolling CEFR estimate alongside the gated unlock flag', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce(baseUser);
    prismaMock.achievementUnlock.findMany.mockResolvedValueOnce([]);
    prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([]);
    prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);

    const result = await controller.me('u1');

    expect(result.cefrUnlocked).toBe(false);
    expect(result.estimatedCefrLevel).toBe('B1');
  });

  it('exposes estimatedCefrConfidence alongside the level estimate', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
      ...baseUser,
      progression: { ...baseUser.progression, estimatedCefrConfidence: 0.72 },
    });
    prismaMock.achievementUnlock.findMany.mockResolvedValueOnce([]);
    prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([]);
    prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);

    const result = await controller.me('u1');

    expect(result.estimatedCefrConfidence).toBe(0.72);
  });

  it('maps the real showcase (V22 §7/§9: profile display was previously a static teaser)', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce(baseUser);
    prismaMock.achievementUnlock.findMany.mockResolvedValueOnce([]);
    prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([]);
    prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);
    questCardsMock.listShowcase.mockResolvedValueOnce([
      {
        id: 'card-1',
        title: 'First Steps',
        category: 'DISCOVERY',
        rarity: 'RARE',
        artwork: null,
        journeyStageKey: 'forest',
        isShowcased: true,
        showcaseOrder: 1,
      },
    ]);

    const result = await controller.me('u1');

    expect(questCardsMock.listShowcase).toHaveBeenCalledWith('u1');
    expect(result.showcasedCards).toEqual([
      {
        id: 'card-1',
        title: 'First Steps',
        category: 'DISCOVERY',
        rarity: 'RARE',
        artwork: null,
        journeyStageKey: 'forest',
      },
    ]);
  });
});
