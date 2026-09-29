import { submitAnalyticsEvents } from './analytics';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('analytics service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POSTs the batch with events plus batch-level platform/appVersion', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({ accepted: 1, rejected: 0 });

    const events = [
      {
        clientEventId: 'c1',
        eventName: 'DUEL_CLUE_USED',
        sessionId: 's1',
        screen: 'WordDuel',
        occurredAt: '2026-09-29T12:00:00.000Z',
        properties: { clueNumber: 1 },
      },
    ];

    const result = await submitAnalyticsEvents('tok', events, {
      platform: 'ios',
      appVersion: '0.1.0',
    });

    expect(apiRequest).toHaveBeenCalledWith('/analytics/events', {
      method: 'POST',
      accessToken: 'tok',
      body: { platform: 'ios', appVersion: '0.1.0', events },
    });
    expect(result).toEqual({ accepted: 1, rejected: 0 });
  });
});
