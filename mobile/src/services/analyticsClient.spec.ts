import { useAnalyticsQueueStore } from '@/state/analyticsQueueStore';
import { useTokenStore } from '@/state/tokenStore';
import { submitAnalyticsEvents } from './analytics';

jest.mock('./analytics', () => ({ submitAnalyticsEvents: jest.fn() }));

// Imported AFTER the mock above so analyticsClient picks up the mocked
// submitAnalyticsEvents.
import { trackEvent, flushAnalyticsQueue, __resetAnalyticsClientForTests } from './analyticsClient';

describe('analyticsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useAnalyticsQueueStore.setState({ events: [], isHydrated: true });
    useTokenStore.setState({ accessToken: 'tok', refreshToken: 'ref' });
    __resetAnalyticsClientForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('trackEvent', () => {
    it('enqueues an event with a clientEventId, sessionId, and ISO occurredAt', () => {
      trackEvent('SCREEN_VIEWED', { screenName: 'Home' }, 'Home');

      const [event] = useAnalyticsQueueStore.getState().events;
      expect(event.eventName).toBe('SCREEN_VIEWED');
      expect(event.properties).toEqual({ screenName: 'Home' });
      expect(event.screen).toBe('Home');
      expect(typeof event.clientEventId).toBe('string');
      expect(event.clientEventId).toHaveLength(36);
      expect(typeof event.sessionId).toBe('string');
      expect(() => new Date(event.occurredAt).toISOString()).not.toThrow();
    });

    it('uses the same sessionId across multiple calls (one session per app process)', () => {
      trackEvent('SCREEN_VIEWED');
      trackEvent('DUEL_CLUE_USED');

      const [first, second] = useAnalyticsQueueStore.getState().events;
      expect(first.sessionId).toBe(second.sessionId);
    });

    it('assigns a distinct clientEventId to each event', () => {
      trackEvent('SCREEN_VIEWED');
      trackEvent('SCREEN_VIEWED');

      const [first, second] = useAnalyticsQueueStore.getState().events;
      expect(first.clientEventId).not.toBe(second.clientEventId);
    });

    it('never throws even if the queue store enqueue somehow fails (gameplay must never see a telemetry exception)', () => {
      const spy = jest
        .spyOn(useAnalyticsQueueStore.getState(), 'enqueue')
        .mockImplementation(() => {
          throw new Error('boom');
        });

      expect(() => trackEvent('SCREEN_VIEWED')).not.toThrow();
      spy.mockRestore();
    });

    it('schedules a debounced flush rather than firing a request per event', () => {
      trackEvent('SCREEN_VIEWED');
      trackEvent('SCREEN_VIEWED');

      expect(submitAnalyticsEvents).not.toHaveBeenCalled();
      jest.advanceTimersByTime(3_000);
      expect(submitAnalyticsEvents).toHaveBeenCalledTimes(1);
    });

    it('flushes immediately once the queue reaches the immediate-flush threshold', () => {
      for (let i = 0; i < 20; i++) {
        trackEvent('SCREEN_VIEWED');
      }
      expect(submitAnalyticsEvents).toHaveBeenCalledTimes(1);
    });
  });

  describe('flushAnalyticsQueue', () => {
    it('does nothing when there is no access token yet', async () => {
      useTokenStore.setState({ accessToken: null, refreshToken: null });
      trackEvent('SCREEN_VIEWED');

      await flushAnalyticsQueue();

      expect(submitAnalyticsEvents).not.toHaveBeenCalled();
      expect(useAnalyticsQueueStore.getState().events).toHaveLength(1);
    });

    it('does nothing when the queue is empty', async () => {
      await flushAnalyticsQueue();
      expect(submitAnalyticsEvents).not.toHaveBeenCalled();
    });

    it('removes every event in the batch from the queue on success, including ones the backend reports as rejected', async () => {
      (submitAnalyticsEvents as jest.Mock).mockResolvedValueOnce({ accepted: 1, rejected: 1 });
      trackEvent('SCREEN_VIEWED');
      trackEvent('DUEL_CLUE_USED');

      await flushAnalyticsQueue();

      expect(submitAnalyticsEvents).toHaveBeenCalledTimes(1);
      expect(useAnalyticsQueueStore.getState().events).toHaveLength(0);
    });

    it('leaves the queue untouched when the request fails, for a later retry', async () => {
      (submitAnalyticsEvents as jest.Mock).mockRejectedValueOnce(new Error('network down'));
      trackEvent('SCREEN_VIEWED');

      await flushAnalyticsQueue();

      expect(useAnalyticsQueueStore.getState().events).toHaveLength(1);
    });

    it('does not run two flushes concurrently', async () => {
      let resolveFirst: (value: { accepted: number; rejected: number }) => void = () => undefined;
      (submitAnalyticsEvents as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      );
      trackEvent('SCREEN_VIEWED');

      const firstFlush = flushAnalyticsQueue();
      const secondFlush = flushAnalyticsQueue(); // should see isFlushing and no-op

      resolveFirst({ accepted: 1, rejected: 0 });
      await Promise.all([firstFlush, secondFlush]);

      expect(submitAnalyticsEvents).toHaveBeenCalledTimes(1);
    });
  });
});
