import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ShopService } from './shop.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('ShopService', () => {
  let service: ShopService;

  const prismaMock = {
    shopItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    shopPurchase: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  const progressionMock = {
    spendGlyphs: jest.fn().mockResolvedValue(undefined),
  };
  const analyticsMock = { track: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ShopService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: AnalyticsService, useValue: analyticsMock },
      ],
    }).compile();
    service = moduleRef.get(ShopService);
  });

  describe('getCatalog', () => {
    it('marks items the player has already purchased as owned', async () => {
      prismaMock.shopItem.findMany.mockResolvedValueOnce([
        {
          id: 'i1',
          key: 'ali-hat',
          name: 'Hat',
          description: 'A hat',
          category: 'ALI_ACCESSORY',
          priceGlyphs: 50,
        },
        {
          id: 'i2',
          key: 'ali-cape',
          name: 'Cape',
          description: 'A cape',
          category: 'ALI_OUTFIT',
          priceGlyphs: 100,
        },
      ]);
      prismaMock.shopPurchase.findMany.mockResolvedValueOnce([{ itemId: 'i1' }]);

      const catalog = await service.getCatalog('u1');

      expect(catalog).toEqual([
        expect.objectContaining({ id: 'i1', owned: true }),
        expect.objectContaining({ id: 'i2', owned: false }),
      ]);
    });
  });

  describe('purchase', () => {
    it('throws NotFoundException for an unknown or inactive item', async () => {
      prismaMock.shopItem.findUnique.mockResolvedValueOnce(null);
      await expect(service.purchase('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the player already owns the item', async () => {
      prismaMock.shopItem.findUnique.mockResolvedValueOnce({
        id: 'i1',
        isActive: true,
        key: 'ali-hat',
        name: 'Hat',
        priceGlyphs: 50,
      });
      prismaMock.shopPurchase.findFirst.mockResolvedValueOnce({ id: 'existing' });

      await expect(service.purchase('u1', 'i1')).rejects.toThrow(ConflictException);
    });

    it('spends Glyphs and records the purchase', async () => {
      prismaMock.shopItem.findUnique.mockResolvedValueOnce({
        id: 'i1',
        isActive: true,
        key: 'ali-hat',
        name: 'Hat',
        priceGlyphs: 50,
      });
      prismaMock.shopPurchase.findFirst.mockResolvedValueOnce(null);
      prismaMock.shopPurchase.create.mockResolvedValueOnce({
        id: 'p1',
        purchasedAt: new Date('2026-08-23'),
      });

      const result = await service.purchase('u1', 'i1');

      expect(progressionMock.spendGlyphs).toHaveBeenCalledWith(
        'u1',
        50,
        'SHOP_PURCHASE',
        'shop',
        'i1',
        prismaMock,
      );
      expect(prismaMock.shopPurchase.create).toHaveBeenCalledWith({
        data: { userId: 'u1', itemId: 'i1', priceGlyphs: 50 },
      });
      expect(result).toEqual({
        id: 'p1',
        itemId: 'i1',
        itemKey: 'ali-hat',
        itemName: 'Hat',
        priceGlyphs: 50,
        purchasedAt: new Date('2026-08-23'),
      });
    });

    it('translates an insufficient-balance error into a 400', async () => {
      prismaMock.shopItem.findUnique.mockResolvedValueOnce({
        id: 'i1',
        isActive: true,
        key: 'ali-hat',
        name: 'Hat',
        priceGlyphs: 5000,
      });
      prismaMock.shopPurchase.findFirst.mockResolvedValueOnce(null);
      progressionMock.spendGlyphs.mockRejectedValueOnce(new Error('Insufficient Glyph balance'));

      await expect(service.purchase('u1', 'i1')).rejects.toThrow(BadRequestException);
    });
  });
});
