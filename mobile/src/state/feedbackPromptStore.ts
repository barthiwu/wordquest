import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wordquest.lastFeedbackPromptShownAt.v1';
/** Telemetry spec §19: "Maximum: 1 lightweight feedback prompt / 3
 * days / player." Deliberately ONE shared cooldown across every
 * lightweight prompt surface (Word Duel today, Daily Quest/others
 * later per the spec's own event dictionary) — the limit is about not
 * pestering the player with reaction surveys in general, not a
 * per-surface budget. */
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

interface FeedbackPromptState {
  lastShownAt: number | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  /** True once hydrated and outside the cooldown window. Returns false
   * (never shows a prompt) until hydration finishes, rather than risk
   * flashing a prompt the player was just shown moments before their
   * last app close. */
  canShowPrompt: () => boolean;
  /** Records that a prompt was just shown — called the moment the
   * prompt actually renders, regardless of whether the player answers
   * it or dismisses it, since the cooldown is about how often we ASK,
   * not how often they respond (spec §19). */
  recordShown: () => void;
}

export const useFeedbackPromptStore = create<FeedbackPromptState>((set, get) => ({
  lastShownAt: null,
  isHydrated: false,

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = stored ? Number(stored) : null;
      set({ lastShownAt: Number.isFinite(parsed) ? parsed : null, isHydrated: true });
      return;
    } catch {
      // Storage unavailable — treat as "never shown," same fallback as
      // every other AsyncStorage-backed store here.
    }
    set({ isHydrated: true });
  },

  canShowPrompt: () => {
    const { isHydrated, lastShownAt } = get();
    if (!isHydrated) return false;
    if (lastShownAt === null) return true;
    return Date.now() - lastShownAt >= COOLDOWN_MS;
  },

  recordShown: () => {
    const now = Date.now();
    set({ lastShownAt: now });
    AsyncStorage.setItem(STORAGE_KEY, String(now)).catch(() => {});
  },
}));
