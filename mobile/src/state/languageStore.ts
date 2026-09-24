import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANGUAGE_CODE, LANGUAGES, type Language } from '@/constants/languages';

const STORAGE_KEY = 'wordquest.languageCode.v1';

interface LanguageState {
  code: string;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setCode: (code: string) => void;
}

/**
 * WordQuest's display-language preference (Settings > Language). Same
 * shape and reasoning as themeStore: a per-device UI preference, not
 * progression data, so it lives in AsyncStorage rather than the
 * backend, and defaults to something sensible (English) before
 * hydrate() resolves so first paint never shows an empty selection.
 */
export const useLanguageStore = create<LanguageState>((set) => ({
  code: DEFAULT_LANGUAGE_CODE,
  isHydrated: false,

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored && LANGUAGES.some((l) => l.code === stored)) {
        set({ code: stored, isHydrated: true });
        return;
      }
    } catch {
      // Storage unavailable — fall through to the default; a cosmetic
      // preference is never worth blocking the app for.
    }
    set({ isHydrated: true });
  },

  setCode: (code: string) => {
    set({ code });
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  },
}));

/** The player's currently selected Language record (falls back to English if somehow unset). */
export function useSelectedLanguage(): Language {
  const code = useLanguageStore((s) => s.code);
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
