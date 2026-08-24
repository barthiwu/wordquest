import { Test } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { PrismaService } from '../prisma/prisma.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  const prismaMock = {
    idempotencyKey: {
      findUnique: jest.fn(),
    },
  };

  const txMock = {
    idempotencyKey: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [IdempotencyService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(IdempotencyService);
  });

  describe('checkCache', () => {
    it('reports a miss without querying the database when no key is given', async () => {
      const result = await service.checkCache('u1', undefined, 'boss-battle.submitAnswer');
      expect(result).toEqual({ cached: false });
      expect(prismaMock.idempotencyKey.findUnique).not.toHaveBeenCalled();
    });

    it('reports a miss when no matching record exists', async () => {
      prismaMock.idempotencyKey.findUnique.mockResolvedValueOnce(null);
      const result = await service.checkCache('u1', 'key-1', 'boss-battle.submitAnswer');
      expect(result).toEqual({ cached: false });
    });

    it('returns the cached response on a hit, scoped by user, key, and endpoint together', async () => {
      prismaMock.idempotencyKey.findUnique.mockResolvedValueOnce({
        responseBody: { xpAwarded: 15 },
      });

      const result = await service.checkCache('u1', 'key-1', 'boss-battle.submitAnswer');

      expect(result).toEqual({ cached: true, response: { xpAwarded: 15 } });
      expect(prismaMock.idempotencyKey.findUnique).toHaveBeenCalledWith({
        where: {
          userId_key_endpoint: { userId: 'u1', key: 'key-1', endpoint: 'boss-battle.submitAnswer' },
        },
      });
    });
  });

  describe('recordInTransaction', () => {
    it('does nothing when no key is given', async () => {
      await service.recordInTransaction(
        txMock as any,
        'u1',
        undefined,
        'boss-battle.submitAnswer',
        { xpAwarded: 15 },
      );
      expect(txMock.idempotencyKey.create).not.toHaveBeenCalled();
    });

    it('persists the response under the (user, key, endpoint) scope', async () => {
      await service.recordInTransaction(txMock as any, 'u1', 'key-1', 'boss-battle.submitAnswer', {
        xpAwarded: 15,
      });

      expect(txMock.idempotencyKey.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          key: 'key-1',
          endpoint: 'boss-battle.submitAnswer',
          responseBody: { xpAwarded: 15 },
        },
      });
    });

    it('swallows a unique-constraint error from a concurrent duplicate write, without throwing', async () => {
      const err: any = new Error('duplicate');
      err.code = 'P2002';
      txMock.idempotencyKey.create.mockRejectedValueOnce(err);

      await expect(
        service.recordInTransaction(txMock as any, 'u1', 'key-1', 'boss-battle.submitAnswer', {
          xpAwarded: 15,
        }),
      ).resolves.toBeUndefined();
    });

    it('rethrows a non-unique-constraint database error', async () => {
      txMock.idempotencyKey.create.mockRejectedValueOnce(new Error('connection lost'));

      await expect(
        service.recordInTransaction(txMock as any, 'u1', 'key-1', 'boss-battle.submitAnswer', {
          xpAwarded: 15,
        }),
      ).rejects.toThrow('connection lost');
    });
  });
});
