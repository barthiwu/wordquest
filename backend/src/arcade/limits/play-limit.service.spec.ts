import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notification.service';
import { ArcadePlayLimitService, nextLocalMidnight } from './play-limit.service';
import { ARCADE_DAILY_PLAY_LIMIT, playLimitNoticeCounts } from '../config/arcade.config';

describe('playLimitNoticeCounts', () => {
  it('gives 5 / 7 / 9 / 10 for the default limit of 10', () => {
    expect(playLimitNoticeCounts(10)).toEqual([
      { count: 5, percent: 50 },
      { count: 7, percent: 70 },
      { count: 9, percent: 90 },
      { count: 10, percent: 100 },
    ]);
  });

  it('rounds up and keeps each distinct count once on a small limit', () => {
    // 50% of 3 = 1.5 -> 2, 70% = 2.1 -> 3, 90% and 100% also land on 3.
    expect(playLimitNoticeCounts(3)).toEqual([
      { count: 2, percent: 50 },
      { count: 3, percent: 100 },
    ]);
  });

  it('never notices before the first play or beyond the limit', () => {
    const counts = playLimitNoticeCounts(1);
    expect(counts).toEqual([{ count: 1, percent: 100 }]);
  });
});

describe('nextLocalMidnight', () => {
  it("is the start of the next day in the player's own timezone", () => {
    // 22:30 UTC is 23:30 in Lagos (UTC+1): midnight is 30 minutes away.
    const now = new Date('2026-10-06T22:30:00Z');
    expect(nextLocalMidnight('Africa/Lagos', now).toISOString()).toBe('2026-10-06T23:00:00.000Z');
  });

  it('falls back to UTC for a missing or invalid timezone', () => {
    const now = new Date('2026-10-06T22:30:00Z');
    expect(nextLocalMidnight(null, now).toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(nextLocalMidnight('Not/AZone', now).toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });

  it('is never more than a day away, even just after midnight', () => {
    const now = new Date('2026-10-07T00:00:01Z');
    const diff = nextLocalMidnight('UTC', now).getTime() - now.getTime();
    expect(diff).toBeGreaterThan(86_300_000);
    expect(diff).toBeLessThanOrEqual(86_400_000);
  });
});

describe('ArcadePlayLimitService', () => {
  let service: ArcadePlayLimitService;

  const prismaMock = {
    user: { findUnique: jest.fn() },
    arcadePlayCount: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const notificationsMock = { notifyFireAndForget: jest.fn() };

  const free = { timezone: 'UTC', plusUntil: null };
  const plus = { timezone: 'UTC', plusUntil: new Date(Date.now() + 86_400_000) };
  const expiredPlus = { timezone: 'UTC', plusUntil: new Date(Date.now() - 1000) };
  const uniqueError = Object.assign(new Error('unique'), { code: 'P2002' });

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(free);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArcadePlayLimitService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationService, useValue: notificationsMock },
      ],
    }).compile();
    service = moduleRef.get(ArcadePlayLimitService);
  });

  describe('getAllowance', () => {
    it('reports used / remaining / locked for each of the four games', async () => {
      prismaMock.arcadePlayCount.findMany.mockResolvedValueOnce([
        { game: 'HANGMAN', count: 4 },
        { game: 'WORD_DUEL', count: ARCADE_DAILY_PLAY_LIMIT },
      ]);

      const view = await service.getAllowance('u1');

      expect(view.unlimited).toBe(false);
      expect(view.limit).toBe(ARCADE_DAILY_PLAY_LIMIT);
      expect(view.games.map((g) => g.game)).toEqual([
        'SCRAMBLE_QUEST',
        'WORD_DUEL',
        'COMPLETE_IT',
        'HANGMAN',
      ]);
      expect(view.games.find((g) => g.game === 'HANGMAN')).toEqual({
        game: 'HANGMAN',
        used: 4,
        limit: 10,
        remaining: 6,
        locked: false,
      });
      expect(view.games.find((g) => g.game === 'WORD_DUEL')).toEqual(
        expect.objectContaining({ remaining: 0, locked: true }),
      );
      expect(view.games.find((g) => g.game === 'COMPLETE_IT')).toEqual(
        expect.objectContaining({ used: 0, remaining: 10, locked: false }),
      );
      expect(new Date(view.resetsAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('is unlimited on an active WordQuest+ plan, and lapses with it', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(plus);
      prismaMock.arcadePlayCount.findMany.mockResolvedValueOnce([{ game: 'HANGMAN', count: 40 }]);
      const view = await service.getAllowance('u1');
      expect(view.unlimited).toBe(true);
      expect(view.limit).toBeNull();
      expect(view.games.every((g) => !g.locked && g.limit === null && g.remaining === null)).toBe(
        true,
      );

      prismaMock.user.findUnique.mockResolvedValueOnce(expiredPlus);
      prismaMock.arcadePlayCount.findMany.mockResolvedValueOnce([]);
      expect((await service.getAllowance('u1')).unlimited).toBe(false);
    });
  });

  describe('assertCanPlay / isLocked', () => {
    it('passes under the limit', async () => {
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce({ count: 9 });
      await expect(service.assertCanPlay('u1', 'HANGMAN')).resolves.toBeUndefined();
    });

    it('passes when nothing was played today', async () => {
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce(null);
      await expect(service.assertCanPlay('u1', 'HANGMAN')).resolves.toBeUndefined();
    });

    it('throws a 403 ARCADE_PLAY_LIMIT body at the limit', async () => {
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce({ count: 10 });
      const err = await service.assertCanPlay('u1', 'COMPLETE_IT').catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          statusCode: 403,
          error: 'ARCADE_PLAY_LIMIT',
          game: 'COMPLETE_IT',
          limit: 10,
        }),
      );
      expect(err.getResponse().message).toContain('Complete It');
      expect(err.getResponse().message).toContain('WordQuest+');
    });

    it('never locks a WordQuest+ player and does not even read the counter', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(plus);
      expect(await service.isLocked('u1', 'HANGMAN')).toBe(false);
      expect(prismaMock.arcadePlayCount.findUnique).not.toHaveBeenCalled();
    });

    it('counts per game: a locked game does not lock the others', async () => {
      prismaMock.arcadePlayCount.findUnique.mockImplementation(
        async ({ where }: { where: { userId_game_localDate: { game: string } } }) =>
          where.userId_game_localDate.game === 'WORD_DUEL' ? { count: 10 } : { count: 2 },
      );
      expect(await service.isLocked('u1', 'WORD_DUEL')).toBe(true);
      expect(await service.isLocked('u1', 'HANGMAN')).toBe(false);
    });
  });

  describe('consumePlay', () => {
    it("creates today's counter on the first play", async () => {
      prismaMock.arcadePlayCount.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.arcadePlayCount.create.mockResolvedValueOnce({});

      const notice = await service.consumePlay('u1', 'HANGMAN');

      expect(prismaMock.arcadePlayCount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', game: 'HANGMAN', count: 1 }),
      });
      expect(notice).toEqual({ game: 'HANGMAN', used: 1, limit: 10, remaining: 9, percent: null });
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('only increments while below the limit (compare-and-swap)', async () => {
      prismaMock.arcadePlayCount.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce({ count: 3 });

      await service.consumePlay('u1', 'HANGMAN');

      expect(prismaMock.arcadePlayCount.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ count: { lt: 10 } }) }),
      );
    });

    it.each([
      [5, 50, 5],
      [7, 70, 3],
      [9, 90, 1],
      [10, 100, 0],
    ])('at play %i it reports %i percent and notifies once', async (used, percent, left) => {
      prismaMock.arcadePlayCount.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce({ count: used });

      const notice = await service.consumePlay('u1', 'SCRAMBLE_QUEST');

      expect(notice).toEqual({
        game: 'SCRAMBLE_QUEST',
        used,
        limit: 10,
        remaining: left,
        percent,
      });
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledTimes(1);
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'ARCADE_PLAY_LIMIT',
        expect.stringContaining('ScrambleQuest'),
        expect.any(String),
        expect.objectContaining({ data: { game: 'SCRAMBLE_QUEST', used, percent } }),
      );
    });

    it('the 100% notice says it unlocks tomorrow and mentions WordQuest+', async () => {
      prismaMock.arcadePlayCount.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce({ count: 10 });
      await service.consumePlay('u1', 'WORD_DUEL');
      const [, , title, body] = notificationsMock.notifyFireAndForget.mock.calls[0];
      expect(title).toBe('Word Duel is locked for today');
      expect(body).toContain('tomorrow');
      expect(body).toContain('WordQuest+');
    });

    it('sends no notice on a play between thresholds', async () => {
      prismaMock.arcadePlayCount.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce({ count: 6 });
      const notice = await service.consumePlay('u1', 'HANGMAN');
      expect(notice.percent).toBeNull();
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('refuses the 11th play when the counter is already at the limit', async () => {
      prismaMock.arcadePlayCount.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.arcadePlayCount.create.mockRejectedValue(uniqueError);
      prismaMock.arcadePlayCount.findUnique.mockResolvedValue({ count: 10 });

      await expect(service.consumePlay('u1', 'HANGMAN')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('retries the update when two plays race to create the first row', async () => {
      prismaMock.arcadePlayCount.updateMany
        .mockResolvedValueOnce({ count: 0 }) // no row yet
        .mockResolvedValueOnce({ count: 1 }); // the other request's row now exists
      prismaMock.arcadePlayCount.create.mockRejectedValueOnce(uniqueError);
      prismaMock.arcadePlayCount.findUnique
        .mockResolvedValueOnce({ count: 1 }) // looked at after the collision
        .mockResolvedValueOnce({ count: 2 }); // read after the retried update

      const notice = await service.consumePlay('u1', 'HANGMAN');
      expect(notice.used).toBe(2);
    });

    it('force records a play past the limit without refusing (a match both players are already in)', async () => {
      prismaMock.arcadePlayCount.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce({ count: 11 });

      const notice = await service.consumePlay('u1', 'WORD_DUEL', { force: true });

      expect(prismaMock.arcadePlayCount.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ count: expect.anything() }),
        }),
      );
      expect(notice).toEqual(expect.objectContaining({ used: 11, remaining: 0, percent: null }));
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('WordQuest+ plays are tracked but never limited or notified', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(plus);
      prismaMock.arcadePlayCount.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.arcadePlayCount.findUnique.mockResolvedValueOnce({ count: 25 });

      const notice = await service.consumePlay('u1', 'HANGMAN');

      expect(notice).toEqual({
        game: 'HANGMAN',
        used: 25,
        limit: null,
        remaining: null,
        percent: null,
      });
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });
  });

  describe('purgeOldCounts', () => {
    it('deletes counters older than two weeks and never throws', async () => {
      prismaMock.arcadePlayCount.deleteMany.mockResolvedValueOnce({ count: 3 });
      await service.purgeOldCounts();
      expect(prismaMock.arcadePlayCount.deleteMany).toHaveBeenCalledWith({
        where: { localDate: { lt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } },
      });

      prismaMock.arcadePlayCount.deleteMany.mockRejectedValueOnce(new Error('db down'));
      await expect(service.purgeOldCounts()).resolves.toBeUndefined();
    });
  });
});
