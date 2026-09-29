import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAnalyticsQueueStore } from './analyticsQueueStore';
import type { AnalyticsEventPayload } from '@/services/analytics';

function makeEvent(clientEventId: string): AnalyticsEventPayload {
  return {
    clientEventId,
    eventName: 'SCREEN_VIEWED',
    sessionId: 's1',
    occurredAt: '2026-09-29T12:00:00.000Z',
  };
}

describe('useAnalyticsQueueStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useAnalyticsQueueStore.setState({ events: [], isHydrated: false });
  });

  it('starts empty and not hydrated', () => {
    expect(useAnalyticsQueueStore.getState().events).toEqual([]);
    expect(useAnalyticsQueueStore.getState().isHydrated).toBe(false);
  });

  it('enqueue appends an event and persists it', async () => {
    useAnalyticsQueueStore.getState().enqueue(makeEvent('c1'));

    expect(useAnalyticsQueueStore.getState().events).toEqual([makeEvent('c1')]);
    // persist() is fire-and-forget — flush microtasks before asserting.
    await Promise.resolve();
    const stored = await AsyncStorage.getItem('wordquest.analyticsQueue.v1');
    expect(JSON.parse(stored as string)).toEqual([makeEvent('c1')]);
  });

  it('drops the OLDEST events once the queue exceeds 200, keeping the newest', () => {
    for (let i = 0; i < 205; i++) {
      useAnalyticsQueueStore.getState().enqueue(makeEvent(`c${i}`));
    }

    const events = useAnalyticsQueueStore.getState().events;
    expect(events).toHaveLength(200);
    expect(events[0].clientEventId).toBe('c5'); // c0-c4 dropped
    expect(events[events.length - 1].clientEventId).toBe('c204');
  });

  it('removeByClientEventIds removes only the matching events', async () => {
    useAnalyticsQueueStore.getState().enqueue(makeEvent('c1'));
    useAnalyticsQueueStore.getState().enqueue(makeEvent('c2'));
    useAnalyticsQueueStore.getState().enqueue(makeEvent('c3'));

    useAnalyticsQueueStore.getState().removeByClientEventIds(['c1', 'c3']);

    expect(useAnalyticsQueueStore.getState().events.map((e) => e.clientEventId)).toEqual(['c2']);
    await Promise.resolve();
    const stored = await AsyncStorage.getItem('wordquest.analyticsQueue.v1');
    expect(JSON.parse(stored as string).map((e: AnalyticsEventPayload) => e.clientEventId)).toEqual(
      ['c2'],
    );
  });

  describe('hydrate', () => {
    it('loads a previously persisted queue', async () => {
      await AsyncStorage.setItem('wordquest.analyticsQueue.v1', JSON.stringify([makeEvent('c1')]));

      await useAnalyticsQueueStore.getState().hydrate();

      expect(useAnalyticsQueueStore.getState().events).toEqual([makeEvent('c1')]);
      expect(useAnalyticsQueueStore.getState().isHydrated).toBe(true);
    });

    it('resolves to an empty, hydrated queue when nothing was stored', async () => {
      await useAnalyticsQueueStore.getState().hydrate();

      expect(useAnalyticsQueueStore.getState().events).toEqual([]);
      expect(useAnalyticsQueueStore.getState().isHydrated).toBe(true);
    });

    it('falls back to an empty queue when the stored value is corrupt JSON', async () => {
      await AsyncStorage.setItem('wordquest.analyticsQueue.v1', 'not-json{{{');

      await useAnalyticsQueueStore.getState().hydrate();

      expect(useAnalyticsQueueStore.getState().events).toEqual([]);
      expect(useAnalyticsQueueStore.getState().isHydrated).toBe(true);
    });
  });
});
