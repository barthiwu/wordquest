import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wordquest.seenTips.v1';

interface TipsState {
  seen: Set<string>;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  markSeen: (id: string) => void;
}

/**
 * Which FirstTimeTip callouts a player has already dismissed (Sept 2026
 * "does the app need a mechanics explainer" follow-up -- see
 * AppIntroScreen's doc comment for the pairing: that screen handles the
 * one-time "what is this app" orientation at signup, this store backs
 * the contextual "here's how this actually works" tips that show the
 * first time a player opens the thing being explained). Same
 * per-device-preference reasoning as themeStore/languageStore: which
 * tips you've seen isn't progression data worth round-tripping to the
 * backend, so AsyncStorage is the right layer, not the API.
 *
 * Stored as a plain string array (Set isn't JSON-serializable) and
 * rehydrated into a Set for O(1) lookups. Never blocks first paint --
 * same non-blocking hydrate() philosophy as every other store here: a
 * tip that flashes once for a player who already dismissed it (because
 * hydrate() hasn't resolved yet) is a far smaller cost than gating the
 * whole app's first paint on an AsyncStorage read.
 */
export const useTipsStore = create<TipsState>((set, get) => ({
  seen: new Set(),
  isHydrated: false,

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const ids = parsed.filter((id): id is string => typeof id === 'string');
          set({ seen: new Set(ids), isHydrated: true });
          return;
        }
      }
    } catch {
      // Storage unavailable or corrupt -- fall through to "nothing seen
      // yet." Worst case a tip a player already dismissed shows again
      // once; never worth blocking the app over.
    }
    set({ isHydrated: true });
  },

  markSeen: (id) => {
    const next = new Set(get().seen);
    next.add(id);
    set({ seen: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next))).catch(() => {});
  },
}));
