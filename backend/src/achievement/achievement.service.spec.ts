import { Test } from '@nestjs/testing';
import { AchievementService } from './achievement.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { QuestCardService } from '../quest-card/quest-card.service';
import { AliService } from '../ali/ali.service';
import { NotificationService } from '../notifications/notification.service';
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_REWARDS } from './achievement-catalog';

describe('AchievementService', () => {
  let service: AchievementService;

  const prismaMock = {
    achievementUnlock: { create: jest.fn(), findMany: jest.fn() },
    challengeAttempt: { count: jest.fn() },
    bossBattleEvent: { count: jest.fn() },
    questAttempt: { count: jest.fn(), findMany: jest.fn() },
    userProgression: { findUnique: jest.fn().mockResolvedValue({ journeyStage: 0 }) },
  };

  const progressionMock = {
    awardXp: jest.fn().mockResolvedValue({}),
    awardGlyphs: jest.fn().mockResolvedValue({}),
  };
  const aliMock = { reactFireAndForget: jest.fn() };
  const questCardsMock = { createCard: jest.fn().mockResolvedValue(undefined) };
  const notificationsMock = { notifyFireAndForget: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AchievementService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: QuestCardService, useValue: questCardsMock },
        { provide: AliService, useValue: aliMock },
        { provide: NotificationService, useValue: notificationsMock },
      ],
    }).compile();
    service = moduleRef.get(AchievementService);
  });

  describe('listCatalog', () => {
    it('has exactly 18 entries, matching the v1.0 catalogue minus the removed Speaking category and the 3 permanently-unreachable V19 entries', () => {
      expect(ACHIEVEMENT_CATALOG).toHaveLength(18);
    });

    it('has a unique id for every entry', () => {
      const ids = ACHIEVEMENT_CATALOG.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('no longer contains the 3 entries removed for referencing unbuilt features (V19 Stabilization Spec §7)', () => {
      const ids = ACHIEVEMENT_CATALOG.map((a) => a.id);
      expect(ids).not.toEqual(
        expect.arrayContaining([
          'random_independence',
          'independent_master',
          'leaderboard_contender',
        ]),
      );
    });

    it('marks every remaining entry as currently checkable', () => {
      expect(ACHIEVEMENT_CATALOG.every((a) => a.checkable)).toBe(true);
    });
  });

  describe('checkDiscoveryAndMastery', () => {
    it('sums ChallengeAttempt and BossBattleEvent counts for Discovery thresholds', async () => {
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(7);
      prismaMock.bossBattleEvent.count.mockResolvedValueOnce(3);
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkDiscoveryAndMastery('u1', 0);

      // 7 + 3 = 10 -> unlocks first_step (>=1) and getting_started (>=10), not vocabulary_explorer (>=100)
      const unlockedIds = prismaMock.achievementUnlock.create.mock.calls.map(
        (c) => c[0].data.achievementId,
      );
      expect(unlockedIds).toContain('first_step');
      expect(unlockedIds).toContain('getting_started');
      expect(unlockedIds).not.toContain('vocabulary_explorer');
    });

    it('scopes the BossBattleEvent count to the user via the player relation', async () => {
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(0);
      prismaMock.bossBattleEvent.count.mockResolvedValueOnce(0);

      await service.checkDiscoveryAndMastery('u1', 0);

      expect(prismaMock.bossBattleEvent.count).toHaveBeenCalledWith({
        where: { player: { userId: 'u1' } },
      });
    });

    it('unlocks Mastery thresholds from masteredWordsCount directly', async () => {
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(0);
      prismaMock.bossBattleEvent.count.mockResolvedValueOnce(0);
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkDiscoveryAndMastery('u1', 5);

      const unlockedIds = prismaMock.achievementUnlock.create.mock.calls.map(
        (c) => c[0].data.achievementId,
      );
      expect(unlockedIds).toContain('first_mastery');
      expect(unlockedIds).toContain('fivefold_mastery');
      expect(unlockedIds).not.toContain('vocabulary_builder');
    });

    it('does not unlock anything below every threshold', async () => {
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(0);
      prismaMock.bossBattleEvent.count.mockResolvedValueOnce(0);

      await service.checkDiscoveryAndMastery('u1', 0);

      expect(prismaMock.achievementUnlock.create).not.toHaveBeenCalled();
    });
  });

  describe('checkConsistency', () => {
    it('unlocks every streak threshold at or below the given streak', async () => {
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkConsistency('u1', 10);

      const unlockedIds = prismaMock.achievementUnlock.create.mock.calls.map(
        (c) => c[0].data.achievementId,
      );
      expect(unlockedIds).toEqual(expect.arrayContaining(['seven_strong', 'tenacity']));
      expect(unlockedIds).not.toContain('monthly_mindset');
    });
  });

  describe('checkIndependentLearning', () => {
    const attempt = (overrides: Partial<Record<string, number>> = {}) => ({
      hintsUsed: 0,
      synonymsUsed: 0,
      lettersRevealed: 0,
      ...overrides,
    });

    it("queries only this user's COMPLETED attempts, most recent first", async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([]);
      await service.checkIndependentLearning('u1');
      expect(prismaMock.questAttempt.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 30,
        select: { hintsUsed: true, synonymsUsed: true, lettersRevealed: true },
      });
    });

    it('unlocks first_independent_quest on the very first completed independent quest', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([attempt()]);
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkIndependentLearning('u1');

      const unlockedIds = prismaMock.achievementUnlock.create.mock.calls.map(
        (c) => c[0].data.achievementId,
      );
      expect(unlockedIds).toContain('first_independent_quest');
    });

    it('does NOT unlock anything when the most recent quest used a hint, synonym, or letter reveal', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([attempt({ hintsUsed: 1 })]);
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkIndependentLearning('u1');

      expect(prismaMock.achievementUnlock.create).not.toHaveBeenCalled();
    });

    it('stops counting the streak at the first non-independent attempt looking backward from most recent', async () => {
      // Most recent 3 are independent; the 4th (older) used a synonym —
      // the streak should be exactly 3, not silently skip past it.
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        attempt(),
        attempt(),
        attempt(),
        attempt({ synonymsUsed: 1 }),
        attempt(),
      ]);
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkIndependentLearning('u1');

      const unlockedIds = prismaMock.achievementUnlock.create.mock.calls.map(
        (c) => c[0].data.achievementId,
      );
      expect(unlockedIds).toEqual(
        expect.arrayContaining(['first_independent_quest', 'independent_streak']),
      );
      expect(unlockedIds).not.toContain('independent_ten');
    });

    it('a letter reveal alone breaks independence, same as a hint or synonym', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([attempt({ lettersRevealed: 1 })]);
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkIndependentLearning('u1');

      expect(prismaMock.achievementUnlock.create).not.toHaveBeenCalled();
    });
  });

  describe('checkCompetition', () => {
    it('unlocks boss_champion only for rank 1, and creates a Quest Card for it', async () => {
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkCompetition('u1', 1, 'group-1');

      const unlockedIds = prismaMock.achievementUnlock.create.mock.calls.map(
        (c) => c[0].data.achievementId,
      );
      expect(unlockedIds).toContain('boss_champion');
      expect(unlockedIds).toContain('boss_elite'); // rank 1 also satisfies top-3
      expect(questCardsMock.createCard).toHaveBeenCalledWith(
        'u1',
        'ACHIEVEMENT',
        'boss_champion',
        'Boss Champion',
        'COMPETITION',
        prismaMock,
      );
    });

    it('unlocks only boss_elite, not boss_champion, for rank 2 or 3', async () => {
      prismaMock.achievementUnlock.create.mockResolvedValue({});

      await service.checkCompetition('u1', 3, 'group-1');

      const unlockedIds = prismaMock.achievementUnlock.create.mock.calls.map(
        (c) => c[0].data.achievementId,
      );
      expect(unlockedIds).toContain('boss_elite');
      expect(unlockedIds).not.toContain('boss_champion');
    });

    it('does not create a Quest Card if boss_champion was already unlocked previously', async () => {
      const err: any = new Error('duplicate');
      err.code = 'P2002';
      prismaMock.achievementUnlock.create.mockRejectedValueOnce(err); // boss_champion already exists
      prismaMock.achievementUnlock.create.mockResolvedValueOnce({}); // boss_elite succeeds

      await service.checkCompetition('u1', 1, 'group-1');

      expect(questCardsMock.createCard).not.toHaveBeenCalled();
    });

    it('unlocks nothing for a rank outside the top 3', async () => {
      await service.checkCompetition('u1', 5, 'group-1');
      expect(prismaMock.achievementUnlock.create).not.toHaveBeenCalled();
    });
  });

  describe('unlocking (via any check method)', () => {
    it('is a no-op — no reward granted — when the achievement is already unlocked (unique constraint)', async () => {
      const err: any = new Error('duplicate');
      err.code = 'P2002';
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);
      prismaMock.bossBattleEvent.count.mockResolvedValueOnce(0);
      prismaMock.achievementUnlock.create.mockRejectedValueOnce(err);

      await service.checkDiscoveryAndMastery('u1', 0);

      expect(progressionMock.awardXp).not.toHaveBeenCalled();
      expect(progressionMock.awardGlyphs).not.toHaveBeenCalled();
    });

    it('awards the correct category XP/Glyph reward on a genuine new unlock', async () => {
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);
      prismaMock.bossBattleEvent.count.mockResolvedValueOnce(0);
      prismaMock.achievementUnlock.create.mockResolvedValueOnce({});

      await service.checkDiscoveryAndMastery('u1', 0);

      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        ACHIEVEMENT_REWARDS.DISCOVERY.xp,
        'ACHIEVEMENT_UNLOCK',
        'achievement',
        'first_step',
        prismaMock,
      );
      expect(progressionMock.awardGlyphs).toHaveBeenCalledWith(
        'u1',
        ACHIEVEMENT_REWARDS.DISCOVERY.glyphs,
        'ACHIEVEMENT_UNLOCK',
        'achievement',
        'first_step',
        prismaMock,
      );
    });

    it('rethrows a non-unique-constraint database error rather than silently swallowing it', async () => {
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);
      prismaMock.bossBattleEvent.count.mockResolvedValueOnce(0);
      prismaMock.achievementUnlock.create.mockRejectedValueOnce(new Error('connection lost'));

      await expect(service.checkDiscoveryAndMastery('u1', 0)).rejects.toThrow('connection lost');
    });
  });

  describe('getMyUnlocks', () => {
    it("returns the player's own unlocks, most recent first", async () => {
      prismaMock.achievementUnlock.findMany.mockResolvedValueOnce([
        { achievementId: 'first_step', unlockedAt: new Date() },
      ]);
      const result = await service.getMyUnlocks('u1');
      expect(result).toHaveLength(1);
      expect(prismaMock.achievementUnlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' }, orderBy: { unlockedAt: 'desc' } }),
      );
    });
  });
});
