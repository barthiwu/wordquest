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
}) {
  return {
    userId: overrides.userId,
    totalXp: overrides.totalXp,
    level: overrides.level ?? 1,
    user: {
      id: overrides.userId,
      username: overrides.username,
      clan: overrides.clanName ? { name: overrides.clanName } : null,
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
        where: { totalXp: { gt: 250 } },
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
        expect.objectContaining({ where: { user: { clanId: 'clan-1' } } }),
      );
      expect(result.entries).toHaveLength(2);
      expect(result.viewer).toMatchObject({ userId: 'u2', rank: 2 });
    });
  });
});
