import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const prismaMock = { analyticsEvent: { create: jest.fn() } };
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(prismaMock as any);
  });

  it('logs an event with the given userId, name, and properties', () => {
    prismaMock.analyticsEvent.create.mockResolvedValue({});

    service.track('u1', 'quest_completed', { questId: 'q1' });

    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', eventName: 'quest_completed', properties: { questId: 'q1' } },
    });
  });

  it('defaults properties to an empty object when none are given', () => {
    prismaMock.analyticsEvent.create.mockResolvedValue({});

    service.track('u1', 'account_created');

    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', eventName: 'account_created', properties: {} },
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
