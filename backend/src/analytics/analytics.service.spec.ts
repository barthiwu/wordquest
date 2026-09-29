import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const prismaMock = {
    analyticsEvent: { create: jest.fn(), createMany: jest.fn() },
  };
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(prismaMock as any);
  });

  describe('track', () => {
    it('logs an event with the given userId, name, and properties', () => {
      prismaMock.analyticsEvent.create.mockResolvedValue({});

      service.track('u1', 'quest_completed', { questId: 'q1' });

      expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          eventName: 'quest_completed',
          properties: { questId: 'q1' },
          sessionId: undefined,
          clientEventId: undefined,
          platform: undefined,
          appVersion: undefined,
          screen: undefined,
        },
      });
    });

    it('defaults properties to an empty object when none are given', () => {
      prismaMock.analyticsEvent.create.mockResolvedValue({});

      service.track('u1', 'account_created');

      expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          eventName: 'account_created',
          properties: {},
        }),
      });
    });

    it('passes through optional meta fields (sessionId, screen, etc.)', () => {
      prismaMock.analyticsEvent.create.mockResolvedValue({});
      const occurredAt = new Date('2026-09-29T12:00:00Z');

      service.track(
        'u1',
        'DUEL_LOCK_IN',
        { cluesUsed: 2 },
        {
          sessionId: 's1',
          screen: 'WordDuel',
          platform: 'ios',
          appVersion: '1.0.0-beta.3',
          occurredAt,
        },
      );

      expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 's1',
          screen: 'WordDuel',
          platform: 'ios',
          appVersion: '1.0.0-beta.3',
          occurredAt,
        }),
      });
    });

    it('never throws or rejects when the write fails (fire-and-forget)', () => {
      prismaMock.analyticsEvent.create.mockRejectedValue(new Error('connection lost'));

      expect(() => service.track('u1', 'quest_completed')).not.toThrow();
    });

    it('returns void synchronously without waiting for the write to resolve', () => {
      let resolveCreate: () => void = () => undefined;
      prismaMock.analyticsEvent.create.mockReturnValue(
        new Promise((resolve) => {
          resolveCreate = () => resolve({});
        }),
      );

      const result = service.track('u1', 'quest_completed');

      expect(result).toBeUndefined();
      resolveCreate();
    });
  });

  describe('trackClientBatch', () => {
    const occurredAt = new Date('2026-09-29T12:00:00Z');

    it('inserts valid events via createMany with skipDuplicates and returns the accepted count', async () => {
      prismaMock.analyticsEvent.createMany.mockResolvedValue({ count: 2 });

      const result = await service.trackClientBatch(
        'u1',
        [
          { clientEventId: 'c1', eventName: 'DUEL_CLUE_USED', sessionId: 's1', occurredAt },
          { clientEventId: 'c2', eventName: 'SCREEN_VIEWED', sessionId: 's1', occurredAt },
        ],
        { platform: 'ios', appVersion: '1.0.0-beta.3' },
      );

      expect(prismaMock.analyticsEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            userId: 'u1',
            eventName: 'DUEL_CLUE_USED',
            clientEventId: 'c1',
            platform: 'ios',
            appVersion: '1.0.0-beta.3',
          }),
          expect.objectContaining({
            userId: 'u1',
            eventName: 'SCREEN_VIEWED',
            clientEventId: 'c2',
          }),
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual({ accepted: 2, rejected: 0 });
    });

    it('drops events with an unknown event name instead of failing the whole batch', async () => {
      prismaMock.analyticsEvent.createMany.mockResolvedValue({ count: 1 });

      const result = await service.trackClientBatch(
        'u1',
        [
          { clientEventId: 'c1', eventName: 'DUEL_CLUE_USED', occurredAt },
          { clientEventId: 'c2', eventName: 'totally_made_up_event', occurredAt },
        ],
        {},
      );

      expect(prismaMock.analyticsEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ eventName: 'DUEL_CLUE_USED' })],
        }),
      );
      expect(result).toEqual({ accepted: 1, rejected: 1 });
    });

    it('returns accepted: 0 without calling createMany when every event is unknown', async () => {
      const result = await service.trackClientBatch(
        'u1',
        [{ clientEventId: 'c1', eventName: 'not_a_real_event', occurredAt }],
        {},
      );

      expect(prismaMock.analyticsEvent.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ accepted: 0, rejected: 1 });
    });

    it('never throws when the DB write fails, and reports every event as rejected', async () => {
      prismaMock.analyticsEvent.createMany.mockRejectedValue(new Error('connection lost'));

      const result = await service.trackClientBatch(
        'u1',
        [{ clientEventId: 'c1', eventName: 'DUEL_CLUE_USED', occurredAt }],
        {},
      );

      expect(result).toEqual({ accepted: 0, rejected: 1 });
    });

    it('is idempotent for a retried duplicate clientEventId — skipDuplicates handles it server-side', async () => {
      // First submission inserts 1 row; a retry of the same event hits
      // skipDuplicates and createMany legitimately reports count: 0.
      prismaMock.analyticsEvent.createMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.analyticsEvent.createMany.mockResolvedValueOnce({ count: 0 });

      const event = { clientEventId: 'dup-1', eventName: 'DUEL_CLUE_USED' as const, occurredAt };

      const first = await service.trackClientBatch('u1', [event], {});
      const retry = await service.trackClientBatch('u1', [event], {});

      expect(first).toEqual({ accepted: 1, rejected: 0 });
      expect(retry).toEqual({ accepted: 0, rejected: 0 });
    });
  });
});
