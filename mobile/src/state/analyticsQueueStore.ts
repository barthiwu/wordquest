import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnalyticsEventPayload } from '@/services/analytics';

const STORAGE_KEY = 'wordquest.analyticsQueue.v1';
/** Telemetry spec §24: "Maximum 200 pending events... oldest low-priority
 * events can be discarded if necessary." Every event this app currently
 * queues is equally low-priority for this purpose, so overflow simply
 * drops the oldest entries — gameplay must never be slowed down or
 * blocked waiting on telemetry, and a full queue is the one case where
 * that could otherwise happen (see analyticsClient.ts's trackEvent doc
 * comment). */
const MAX_QUEUE_SIZE = 200;

interface AnalyticsQueueState {
  events: AnalyticsEventPayload[];
  isHydrated: boolean;
  /** Loads the persisted queue at app launch — same non-blocking
   * philosophy as every other store here (tipsStore, languageStore):
   * never gate first paint on this resolving. A queue that hasn't
   * hydrated yet just means trackEvent() calls made in the first instant
   * of app launch enqueue into an empty in-memory array and get
   * persisted on the next write, same as any other enqueue. */
  hydrate: () => Promise<void>;
  enqueue: (event: AnalyticsEventPayload) => void;
  removeByClientEventIds: (clientEventIds: string[]) => void;
  /** Drops everything still queued. Called on sign-out so one player's events are never sent under the next player's account. */
  clear: () => void;
}

function persist(events: AnalyticsEventPayload[]): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events)).catch(() => {
    // Storage unavailable — the in-memory queue still flushes for the
    // rest of this app session; it just won't survive a restart. Never
    // worth surfacing to the player or retrying (spec §30: analytics
    // failures cannot break gameplay).
  });
}

export const useAnalyticsQueueStore = create<AnalyticsQueueState>((set, get) => ({
  events: [],
  isHydrated: false,

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          set({ events: parsed as AnalyticsEventPayload[], isHydrated: true });
          return;
        }
      }
    } catch {
      // Storage unavailable or corrupt — start from an empty queue
      // rather than blocking or throwing (spec §30).
    }
    set({ isHydrated: true });
  },

  enqueue: (event) => {
    const next = [...get().events, event];
    // Drop from the front (oldest first) rather than refusing the
    // newest event — a player mid-session generating events faster than
    // the network can drain them should never see THIS tap silently
    // dropped in favor of one from ten minutes ago.
    const bounded = next.length > MAX_QUEUE_SIZE ? next.slice(next.length - MAX_QUEUE_SIZE) : next;
    set({ events: bounded });
    persist(bounded);
  },

  clear: () => {
    set({ events: [] });
    persist([]);
  },

  removeByClientEventIds: (clientEventIds) => {
    const toRemove = new Set(clientEventIds);
    const next = get().events.filter((event) => !toRemove.has(event.clientEventId));
    set({ events: next });
    persist(next);
  },
}));
