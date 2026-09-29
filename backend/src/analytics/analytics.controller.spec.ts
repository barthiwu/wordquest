import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  const analyticsMock = { trackClientBatch: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    // Direct instantiation, not Test.createTestingModule — same reason
    // as AliController/SkillsController's specs: @UseGuards(JwtAuthGuard)
    // would pull in JwtAuthGuard's own DI chain for no reason here.
    controller = new AnalyticsController(analyticsMock as any);
  });

  it('delegates to trackClientBatch with events mapped to Date occurredAt and batch-level platform/appVersion', async () => {
    analyticsMock.trackClientBatch.mockResolvedValue({ accepted: 1, rejected: 0 });

    const result = await controller.submitEvents('u1', {
      platform: 'ios',
      appVersion: '1.0.0-beta.3',
      events: [
        {
          clientEventId: 'c1',
          eventName: 'DUEL_CLUE_USED',
          sessionId: 's1',
          screen: 'WordDuel',
          occurredAt: '2026-09-29T12:00:00.000Z',
          properties: { clueNumber: 1 },
        },
      ],
    });

    expect(analyticsMock.trackClientBatch).toHaveBeenCalledWith(
      'u1',
      [
        {
          clientEventId: 'c1',
          eventName: 'DUEL_CLUE_USED',
          sessionId: 's1',
          screen: 'WordDuel',
          occurredAt: new Date('2026-09-29T12:00:00.000Z'),
          properties: { clueNumber: 1 },
        },
      ],
      { platform: 'ios', appVersion: '1.0.0-beta.3' },
    );
    expect(result).toEqual({ accepted: 1, rejected: 0 });
  });

  it('passes through an empty batch-level platform/appVersion as undefined', async () => {
    analyticsMock.trackClientBatch.mockResolvedValue({ accepted: 0, rejected: 0 });

    await controller.submitEvents('u1', {
      events: [
        { clientEventId: 'c1', eventName: 'SCREEN_VIEWED', occurredAt: '2026-09-29T12:00:00.000Z' },
      ],
    });

    expect(analyticsMock.trackClientBatch).toHaveBeenCalledWith('u1', expect.any(Array), {
      platform: undefined,
      appVersion: undefined,
    });
  });
});
