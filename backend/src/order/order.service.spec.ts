import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../prisma/prisma.service';
import { AliService } from '../ali/ali.service';
import { JOURNEY_STAGES } from '../config/journey-stages';
import { ORDER_CHANGE_COOLDOWN_MS } from './order-catalog';

describe('OrderService', () => {
  let service: OrderService;

  const prismaMock = {
    orderSelection: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    userProgression: {
      findUniqueOrThrow: jest.fn(),
    },
  };

  const kingdomStage = JOURNEY_STAGES.find((s) => s.key === 'kingdom')!.stage;
  const townStage = JOURNEY_STAGES.find((s) => s.key === 'town')!.stage;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AliService, useValue: { reactFireAndForget: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(OrderService);
  });

  describe('listCatalog', () => {
    it('returns exactly the four fixed Orders', () => {
      const catalog = service.listCatalog();
      expect(catalog.map((o) => o.key).sort()).toEqual([
        'ARTISANS',
        'ORATORS',
        'SCRIBES',
        'SEEKERS',
      ]);
    });

    it('gives every Order a name, symbol, motto, and philosophy', () => {
      service.listCatalog().forEach((entry) => {
        expect(entry.name.length).toBeGreaterThan(0);
        expect(entry.symbol.length).toBeGreaterThan(0);
        expect(entry.motto.length).toBeGreaterThan(0);
        expect(entry.philosophy.length).toBeGreaterThan(0);
      });
    });

    it('gives every Order a banner asset and an identity colour', () => {
      service.listCatalog().forEach((entry) => {
        expect(entry.banner.length).toBeGreaterThan(0);
        expect(entry.colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('getMyOrder', () => {
    it('returns all-null when the player has never selected an Order', async () => {
      prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);
      const result = await service.getMyOrder('u1');
      expect(result).toEqual({ current: null, selectedAt: null, changeEligibleAt: null });
    });

    it('computes changeEligibleAt as exactly 30 days after the current selection', async () => {
      const selectedAt = new Date('2026-08-01T00:00:00Z');
      prismaMock.orderSelection.findFirst.mockResolvedValueOnce({ order: 'SCRIBES', selectedAt });

      const result = await service.getMyOrder('u1');

      expect(result.current).toBe('SCRIBES');
      expect(result.changeEligibleAt!.getTime() - selectedAt.getTime()).toBe(
        ORDER_CHANGE_COOLDOWN_MS,
      );
    });
  });

  describe('getMyOrderHistory', () => {
    it('returns every past selection, most recent first', async () => {
      prismaMock.orderSelection.findMany.mockResolvedValueOnce([
        { order: 'ORATORS', selectedAt: new Date('2026-09-01') },
        { order: 'SCRIBES', selectedAt: new Date('2026-08-01') },
      ]);

      const history = await service.getMyOrderHistory('u1');

      expect(history).toHaveLength(2);
      expect(history[0].order).toBe('ORATORS');
      expect(prismaMock.orderSelection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' }, orderBy: { selectedAt: 'desc' } }),
      );
    });
  });

  describe('selectOrder', () => {
    it('throws ForbiddenException below Kingdom stage, without touching OrderSelection', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        journeyStage: townStage,
      });

      await expect(service.selectOrder('u1', 'SCRIBES')).rejects.toThrow(ForbiddenException);
      expect(prismaMock.orderSelection.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.orderSelection.create).not.toHaveBeenCalled();
    });

    it('allows a first-time selection at Kingdom with no prior history', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        journeyStage: kingdomStage,
      });
      prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);
      prismaMock.orderSelection.create.mockResolvedValueOnce({
        order: 'SEEKERS',
        selectedAt: new Date('2026-08-20'),
      });

      const result = await service.selectOrder('u1', 'SEEKERS');

      expect(result.current).toBe('SEEKERS');
      expect(prismaMock.orderSelection.create).toHaveBeenCalledWith({
        data: { userId: 'u1', order: 'SEEKERS' },
      });
    });

    it('throws BadRequestException when the 30-day cooldown has not elapsed', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        journeyStage: kingdomStage,
      });
      const recentSelection = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      prismaMock.orderSelection.findFirst.mockResolvedValueOnce({
        order: 'SCRIBES',
        selectedAt: recentSelection,
      });

      await expect(service.selectOrder('u1', 'ARTISANS')).rejects.toThrow(BadRequestException);
      expect(prismaMock.orderSelection.create).not.toHaveBeenCalled();
    });

    it('allows a change once the 30-day cooldown has fully elapsed', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        journeyStage: kingdomStage,
      });
      const oldSelection = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      prismaMock.orderSelection.findFirst.mockResolvedValueOnce({
        order: 'SCRIBES',
        selectedAt: oldSelection,
      });
      prismaMock.orderSelection.create.mockResolvedValueOnce({
        order: 'ARTISANS',
        selectedAt: new Date(),
      });

      const result = await service.selectOrder('u1', 'ARTISANS');

      expect(result.current).toBe('ARTISANS');
    });

    it('rejects re-selecting the same Order the player is already in', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        journeyStage: kingdomStage,
      });
      const oldSelection = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      prismaMock.orderSelection.findFirst.mockResolvedValueOnce({
        order: 'SCRIBES',
        selectedAt: oldSelection,
      });

      await expect(service.selectOrder('u1', 'SCRIBES')).rejects.toThrow(BadRequestException);
      expect(prismaMock.orderSelection.create).not.toHaveBeenCalled();
    });

    it('creates a new history row rather than overwriting the previous one (identity history is append-only)', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        journeyStage: kingdomStage,
      });
      prismaMock.orderSelection.findFirst.mockResolvedValueOnce(null);
      prismaMock.orderSelection.create.mockResolvedValueOnce({
        order: 'SCRIBES',
        selectedAt: new Date(),
      });

      await service.selectOrder('u1', 'SCRIBES');

      // create(), never update() or delete() — no such methods even exist on the mock,
      // so this is enforced by construction, but assert the call shape explicitly too.
      expect(prismaMock.orderSelection.create).toHaveBeenCalledTimes(1);
    });
  });
});
