import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LeaderboardsService } from './leaderboards.service';
import { PrismaService } from '../prisma/prisma.service';

function progressionRow(overrides: {
  userId: string;
  username: string;
  totalXp: number;
  level?: number;
  clanName?: string | null;
  countryCode?: string | null;
  lastActiveOn?: Date | null;
}) {
  return {
    userId: overrides.userId,
    totalXp: overrides.totalXp,
    level: overrides.level ?? 1,
    lastActiveOn: overrides.lastActiveOn ?? null,
    user: {
      id: overrides.userId,
      username: overrides.username,
      clan: overrides.clanName ? { name: overrides.clanName } : null,
      countryCode: overrides.countryCode ?? null,
    },
  };
}

describe('LeaderboardsService', () => {
  let service: LeaderboardsService;

  const prismaMock = {
    userProgression: {
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    friendship: {
      findMany: jest.fn(),
    },
    bossBattlePlayer: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [LeaderboardsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(LeaderboardsService);
  });

  describe('getGlobal', () => {
    it('assigns ranks in descending totalXp order, starting at 1', async () => {
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900 }),
        progressionRow({ userId: 'u2', username: 'Bo', totalXp: 500 }),
        progressionRow({ userId: 'u3', username: 'Cy', totalXp: 100 }),
      ]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900 }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(0);

      const result = await service.getGlobal('u1');

      expect(result.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
      expect(result.entries[0]).toMatchObject({ userId: 'u1', username: 'Ada', totalXp: 900 });
    });

    it('orders the Prisma query by totalXp desc with a stable secondary key', async () => {
      prismaMock.userProgression.findMany.mockResolvedValueOnce([]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 0 }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(0);

      await service.getGlobal('u1');

      expect(prismaMock.userProgression.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ totalXp: 'desc' }, { userId: 'asc' }] }),
      );
    });

    it("computes the viewer's rank as 1 + the count of players with strictly more XP", async () => {
      prismaMock.userProgression.findMany.mockResolvedValueOnce([]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u9', username: 'Viewer', totalXp: 250 }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(41);

      const result = await service.getGlobal('u9');

      expect(prismaMock.userProgression.count).toHaveBeenCalledWith({
        where: { totalXp: { gt: 250 }, user: { status: { not: 'DELETED' } } },
      });
      expect(result.viewer).toMatchObject({ userId: 'u9', rank: 42, totalXp: 250 });
    });

    it('ranks the sole leader as #1 with nobody ahead', async () => {
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900 }),
      ]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900 }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(0);

      const result = await service.getGlobal('u1');

      expect(result.viewer.rank).toBe(1);
    });

    it('defaults to 50 and clamps an out-of-range limit down to 100', async () => {
      prismaMock.userProgression.findMany.mockResolvedValueOnce([]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 0 }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(0);

      await service.getGlobal('u1');
      expect(prismaMock.userProgression.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ take: 50 }),
      );

      prismaMock.userProgression.findMany.mockResolvedValueOnce([]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 0 }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(0);

      await service.getGlobal('u1', 5000);
      expect(prismaMock.userProgression.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ take: 100 }),
      );
    });

    it('falls back to the default limit for a non-positive or non-finite value', async () => {
      prismaMock.userProgression.findMany.mockResolvedValueOnce([]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 0 }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(0);

      await service.getGlobal('u1', NaN);

      expect(prismaMock.userProgression.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('surfaces the clan name on an entry, and null when the player has no clan', async () => {
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900, clanName: 'Ember Vale' }),
        progressionRow({ userId: 'u2', username: 'Bo', totalXp: 500, clanName: null }),
      ]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900, clanName: 'Ember Vale' }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(0);

      const result = await service.getGlobal('u1');

      expect(result.entries[0].clanName).toBe('Ember Vale');
      expect(result.entries[1].clanName).toBeNull();
    });

    it("surfaces a player's lastActiveOn instant on their entry", async () => {
      const activeAt = new Date('2026-09-28T10:00:00.000Z');
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900, lastActiveOn: activeAt }),
      ]);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce(
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900, lastActiveOn: activeAt }),
      );
      prismaMock.userProgression.count.mockResolvedValueOnce(0);

      const result = await service.getGlobal('u1');

      expect(result.entries[0].lastActiveOn).toEqual(activeAt);
    });
  });

  describe('getCountry', () => {
    it('throws BadRequestException when the viewer has no country set', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ countryCode: null });

      await expect(service.getCountry('u1')).rejects.toThrow(BadRequestException);
      expect(prismaMock.userProgression.findMany).not.toHaveBeenCalled();
    });

    it("scopes the query to the viewer's exact country and ranks only that country", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ countryCode: 'NG' });
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900, countryCode: 'NG' }),
        progressionRow({ userId: 'u2', username: 'Bo', totalXp: 300, countryCode: 'NG' }),
      ]);

      const result = await service.getCountry('u2');

      expect(prismaMock.userProgression.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user: { countryCode: 'NG', status: { not: 'DELETED' } } } }),
      );
      expect(result.entries).toHaveLength(2);
      expect(result.viewer).toMatchObject({ userId: 'u2', rank: 2 });
    });

    it('throws when the viewer somehow is not present in their own country rows', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ countryCode: 'NG' });
      prismaMock.userProgression.findMany.mockResolvedValueOnce([]);

      await expect(service.getCountry('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getContinent', () => {
    it('throws BadRequestException when the viewer has no country set', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ countryCode: null });

      await expect(service.getContinent('u1')).rejects.toThrow(BadRequestException);
      expect(prismaMock.userProgression.findMany).not.toHaveBeenCalled();
    });

    it("scopes the query to every country in the viewer's continent", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ countryCode: 'NG' });
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900, countryCode: 'NG' }),
        progressionRow({ userId: 'u2', username: 'Kwame', totalXp: 400, countryCode: 'GH' }),
      ]);

      const result = await service.getContinent('u1');

      expect(prismaMock.userProgression.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { countryCode: { in: expect.arrayContaining(['NG', 'GH']) }, status: { not: 'DELETED' } } },
        }),
      );
      expect(result.entries).toHaveLength(2);
      expect(result.viewer).toMatchObject({ userId: 'u1', rank: 1 });
    });

    it('throws when the viewer somehow is not present in their own continent rows', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ countryCode: 'NG' });
      prismaMock.userProgression.findMany.mockResolvedValueOnce([]);

      await expect(service.getContinent('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFriends', () => {
    it('ranks the viewer together with their accepted friends only', async () => {
      prismaMock.friendship.findMany.mockResolvedValueOnce([
        { requesterId: 'u1', addresseeId: 'u2' },
        { requesterId: 'u3', addresseeId: 'u1' },
      ]);
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u2', username: 'Bo', totalXp: 900 }),
        progressionRow({ userId: 'u1', username: 'Me', totalXp: 500 }),
        progressionRow({ userId: 'u3', username: 'Cy', totalXp: 100 }),
      ]);

      const result = await service.getFriends('u1');

      expect(prismaMock.userProgression.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: { in: ['u1', 'u2', 'u3'] }, OR: [{ userId: 'u1' }, { user: { status: { not: 'DELETED' } } }] } }),
      );
      expect(result.entries.map((e) => e.userId)).toEqual(['u2', 'u1', 'u3']);
      expect(result.viewer).toMatchObject({ userId: 'u1', rank: 2 });
    });

    it('includes the viewer alone at rank 1 when they have no friends yet', async () => {
      prismaMock.friendship.findMany.mockResolvedValueOnce([]);
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u1', username: 'Me', totalXp: 42 }),
      ]);

      const result = await service.getFriends('u1');

      expect(result.entries).toHaveLength(1);
      expect(result.viewer).toMatchObject({ userId: 'u1', rank: 1 });
    });
  });

  describe('getBossBattle', () => {
    it('ranks players by summed Boss Battle rewardXp, descending', async () => {
      prismaMock.bossBattlePlayer.groupBy
        .mockResolvedValueOnce([
          { userId: 'u2', _sum: { rewardXp: 500 } },
          { userId: 'u1', _sum: { rewardXp: 200 } },
        ])
        .mockResolvedValueOnce([{ userId: 'u2', _sum: { rewardXp: 500 } }]); // "ahead" query for viewer
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: 'u2', username: 'Bo', clan: null, countryCode: null, progression: null },
        { id: 'u1', username: 'Me', clan: null, countryCode: null, progression: null },
      ]);
      prismaMock.bossBattlePlayer.aggregate.mockResolvedValueOnce({ _sum: { rewardXp: 200 } });
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
        username: 'Me',
        clan: null,
        countryCode: null,
        progression: null,
      });

      const result = await service.getBossBattle('u1');

      expect(result.entries).toEqual([
        {
          rank: 1,
          userId: 'u2',
          username: 'Bo',
          clanName: null,
          countryCode: null,
          level: 0,
          totalXp: 500,
          lastActiveOn: null,
        },
        {
          rank: 2,
          userId: 'u1',
          username: 'Me',
          clanName: null,
          countryCode: null,
          level: 0,
          totalXp: 200,
          lastActiveOn: null,
        },
      ]);
      expect(result.viewer).toMatchObject({ userId: 'u1', rank: 2, totalXp: 200 });
    });

    it("gives a player who has never played Boss Battle a rank of 1 + everyone who's ahead of their zero total", async () => {
      prismaMock.bossBattlePlayer.groupBy
        .mockResolvedValueOnce([{ userId: 'u2', _sum: { rewardXp: 500 } }])
        .mockResolvedValueOnce([{ userId: 'u2', _sum: { rewardXp: 500 } }]);
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: 'u2', username: 'Bo', clan: null, countryCode: null, progression: null },
      ]);
      prismaMock.bossBattlePlayer.aggregate.mockResolvedValueOnce({ _sum: { rewardXp: null } });
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
        username: 'Newbie',
        clan: null,
        countryCode: null,
        progression: null,
      });

      const result = await service.getBossBattle('u1');

      expect(result.viewer).toMatchObject({ userId: 'u1', rank: 2, totalXp: 0 });
    });

    it("surfaces a player's lastActiveOn from their progression relation", async () => {
      const activeAt = new Date('2026-09-29T08:00:00.000Z');
      prismaMock.bossBattlePlayer.groupBy
        .mockResolvedValueOnce([{ userId: 'u2', _sum: { rewardXp: 500 } }])
        .mockResolvedValueOnce([]);
      prismaMock.user.findMany.mockResolvedValueOnce([
        {
          id: 'u2',
          username: 'Bo',
          clan: null,
          countryCode: null,
          progression: { lastActiveOn: activeAt },
        },
      ]);
      prismaMock.bossBattlePlayer.aggregate.mockResolvedValueOnce({ _sum: { rewardXp: 0 } });
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
        username: 'Me',
        clan: null,
        countryCode: null,
        progression: { lastActiveOn: activeAt },
      });

      const result = await service.getBossBattle('u1');

      expect(result.entries[0].lastActiveOn).toEqual(activeAt);
      expect(result.viewer.lastActiveOn).toEqual(activeAt);
    });
  });

  describe('getClan', () => {
    it("throws BadRequestException when the viewer isn't in a clan", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ clanId: null });

      await expect(service.getClan('u1')).rejects.toThrow(BadRequestException);
      expect(prismaMock.userProgression.findMany).not.toHaveBeenCalled();
    });

    it("scopes the query to the viewer's clan and ranks only clan-mates", async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ clanId: 'clan-1' });
      prismaMock.userProgression.findMany.mockResolvedValueOnce([
        progressionRow({ userId: 'u1', username: 'Ada', totalXp: 900, clanName: 'Ember Vale' }),
        progressionRow({ userId: 'u2', username: 'Bo', totalXp: 300, clanName: 'Ember Vale' }),
      ]);

      const result = await service.getClan('u2');

      expect(prismaMock.userProgression.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user: { clanId: 'clan-1', status: { not: 'DELETED' } } } }),
      );
      expect(result.entries).toHaveLength(2);
      expect(result.viewer).toMatchObject({ userId: 'u2', rank: 2 });
    });
  });
});
