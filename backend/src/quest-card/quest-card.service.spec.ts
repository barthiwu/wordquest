import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QuestCardService, MAX_SHOWCASE_CARDS } from './quest-card.service';
import { PrismaService } from '../prisma/prisma.service';

describe('QuestCardService', () => {
  let service: QuestCardService;

  const prismaMock = {
    user: { findUniqueOrThrow: jest.fn() },
    questCard: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [QuestCardService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(QuestCardService);
  });

  it('snapshots the current display name at creation time', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ displayName: 'Ada' });

    await service.createCard(
      'u1',
      'JOURNEY_COMPLETION',
      'hamlet',
      'Reached Hamlet',
      undefined,
      prismaMock as any,
    );

    expect(prismaMock.questCard.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        source: 'JOURNEY_COMPLETION',
        sourceEventId: 'hamlet',
        title: 'Reached Hamlet',
        category: undefined,
        playerDisplayNameSnapshot: 'Ada',
      },
    });
  });

  it('passes the category through for achievement-sourced cards', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ displayName: 'Bo' });

    await service.createCard(
      'u1',
      'ACHIEVEMENT',
      'boss_champion',
      'Boss Champion',
      'COMPETITION',
      prismaMock as any,
    );

    expect(prismaMock.questCard.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: 'COMPETITION' }) }),
    );
  });

  it('includes rarity/artwork/journeyStageKey only when explicitly provided', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ displayName: 'Cy' });

    await service.createCard(
      'u1',
      'JOURNEY_COMPLETION',
      'hamlet',
      'Reached Hamlet',
      undefined,
      prismaMock as any,
      { rarity: 'RARE', journeyStageKey: 'hamlet' },
    );

    expect(prismaMock.questCard.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        source: 'JOURNEY_COMPLETION',
        sourceEventId: 'hamlet',
        title: 'Reached Hamlet',
        category: undefined,
        playerDisplayNameSnapshot: 'Cy',
        rarity: 'RARE',
        journeyStageKey: 'hamlet',
      },
    });
  });

  describe('duplicate protection (Correction & Completion Spec §6)', () => {
    it('silently no-ops when the (userId, source, sourceEventId) unique constraint rejects a repeat create', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ displayName: 'Ada' });
      prismaMock.questCard.create.mockRejectedValueOnce({ code: 'P2002' });

      await expect(
        service.createCard(
          'u1',
          'JOURNEY_COMPLETION',
          'hamlet',
          'Reached Hamlet',
          undefined,
          prismaMock as any,
        ),
      ).resolves.toBeUndefined();
    });

    it('re-throws any other error from the create call', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ displayName: 'Ada' });
      const dbError = new Error('connection lost');
      prismaMock.questCard.create.mockRejectedValueOnce(dbError);

      await expect(
        service.createCard(
          'u1',
          'JOURNEY_COMPLETION',
          'hamlet',
          'Reached Hamlet',
          undefined,
          prismaMock as any,
        ),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('listMyCards', () => {
    it('returns the full gallery, most recent first', async () => {
      prismaMock.questCard.findMany.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]);
      const cards = await service.listMyCards('u1');
      expect(prismaMock.questCard.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { earnedAt: 'desc' },
      });
      expect(cards).toHaveLength(2);
    });
  });

  describe('getCard', () => {
    it('throws NotFoundException for a nonexistent card', async () => {
      prismaMock.questCard.findUnique.mockResolvedValueOnce(null);
      await expect(service.getCard('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for another player's card", async () => {
      prismaMock.questCard.findUnique.mockResolvedValueOnce({ id: 'c1', userId: 'u2' });
      await expect(service.getCard('u1', 'c1')).rejects.toThrow(ForbiddenException);
    });

    it('returns the card when it belongs to the requester', async () => {
      prismaMock.questCard.findUnique.mockResolvedValueOnce({ id: 'c1', userId: 'u1' });
      const card = await service.getCard('u1', 'c1');
      expect(card.id).toBe('c1');
    });
  });

  describe('listShowcase', () => {
    it('returns only showcased cards, in showcase order', async () => {
      prismaMock.questCard.findMany.mockResolvedValueOnce([{ id: 'c1' }]);
      await service.listShowcase('u1');
      expect(prismaMock.questCard.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isShowcased: true },
        orderBy: { showcaseOrder: 'asc' },
      });
    });
  });

  describe('setShowcase (V19 Stabilization Spec §8: profile showcase / selection system)', () => {
    it('rejects more than MAX_SHOWCASE_CARDS ids', async () => {
      const tooMany = Array.from({ length: MAX_SHOWCASE_CARDS + 1 }, (_, i) => `c${i}`);
      await expect(service.setShowcase('u1', tooMany)).rejects.toThrow(BadRequestException);
      expect(prismaMock.questCard.count).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException if any id doesn't belong to the requester", async () => {
      prismaMock.questCard.count.mockResolvedValueOnce(1); // only 1 of 2 owned
      await expect(service.setShowcase('u1', ['c1', 'c2'])).rejects.toThrow(ForbiddenException);
      expect(prismaMock.questCard.update).not.toHaveBeenCalled();
    });

    it('clears any previously-showcased card not in the new set, and sets order on the new set', async () => {
      prismaMock.questCard.count.mockResolvedValueOnce(2);
      prismaMock.questCard.findMany.mockResolvedValueOnce([{ id: 'c2' }, { id: 'c1' }]);

      await service.setShowcase('u1', ['c2', 'c1']);

      expect(prismaMock.questCard.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isShowcased: true, id: { notIn: ['c2', 'c1'] } },
        data: { isShowcased: false, showcaseOrder: null },
      });
      expect(prismaMock.questCard.update).toHaveBeenCalledWith({
        where: { id: 'c2' },
        data: { isShowcased: true, showcaseOrder: 1 },
      });
      expect(prismaMock.questCard.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { isShowcased: true, showcaseOrder: 2 },
      });
    });

    it('an empty array clears the whole showcase without an ownership check', async () => {
      prismaMock.questCard.findMany.mockResolvedValueOnce([]);

      await service.setShowcase('u1', []);

      expect(prismaMock.questCard.count).not.toHaveBeenCalled();
      expect(prismaMock.questCard.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isShowcased: true, id: { notIn: [] } },
        data: { isShowcased: false, showcaseOrder: null },
      });
      expect(prismaMock.questCard.update).not.toHaveBeenCalled();
    });

    it('deduplicates repeated ids before checking the cap and ownership', async () => {
      prismaMock.questCard.count.mockResolvedValueOnce(1);
      prismaMock.questCard.findMany.mockResolvedValueOnce([{ id: 'c1' }]);

      await service.setShowcase('u1', ['c1', 'c1']);

      expect(prismaMock.questCard.count).toHaveBeenCalledWith({
        where: { id: { in: ['c1'] }, userId: 'u1' },
      });
    });
  });
});
