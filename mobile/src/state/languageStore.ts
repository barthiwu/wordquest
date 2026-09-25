import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LANGUAGE_CODE, LANGUAGES, type Language } from '@/constants/languages';
import { useAuthStore } from '@/state/authStore';
import { updateMe } from '@/services/users';
import i18n from '@/i18n';

const STORAGE_KEY = 'wordquest.languageCode.v1';

interface LanguageState {
  code: string;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setCode: (code: string) => void;
}

/**
 * The player's native/comprehension language (Settings > Language) --
 * NOT the language they're learning (WordQuest only ever teaches
 * English). As of the Sept 2026 UI-translation rollout, this now ALSO
 * drives the app's own UI chrome (buttons, headers, labels, via
 * src/i18n) -- previously this only affected ALI's explanatory
 * language, before that was even wired up. What it has never changed,
 * and still doesn't: the English words/sentences WordQuest teaches,
 * which always stay in English regardless of this setting, per the
 * game's whole pedagogy.
 *
 * Every language switch -- including Arabic/Farsi, whose SCRIPT reads
 * right-to-left (see src/i18n/rtlText.ts) -- applies instantly via
 * i18next's own re-render. There is no native reload step: WordQuest's
 * UI layout intentionally stays left-to-right for every language, by
 * product decision, so there's nothing native-side (like
 * I18nManager.forceRTL) to catch up on. This is a deliberate change
 * from an earlier revision of this rollout, which did mirror layout
 * for RTL languages and needed a restart prompt for it -- that prompt
 * and its plumbing are gone now.
 *
 * Mirrored to the backend's User.nativeLanguage on every change (see
 * setCode) so it's available server-side wherever ALI's explanatory
 * text gets generated -- but the local AsyncStorage copy is still the
 * source of truth for instant, offline-friendly UI (same reasoning as
 * themeStore), and the backend sync is fire-and-forget: a failed or
 * offline sync never blocks or reverts the on-device selection.
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

    // Switches the UI's own text immediately -- i18next re-renders
    // every mounted useTranslation() consumer on this. No layout
    // direction to apply separately anymore (see doc comment above).
    i18n.changeLanguage(code).catch(() => {});

    // Best-effort: an unauthenticated player (rare -- Settings is
    // behind login) or an offline one simply keeps the on-device
    // selection until this succeeds on a later change.
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) {
      updateMe(accessToken, { nativeLanguage: code }).catch(() => {});
    }
  },
}));

/** The player's currently selected Language record (falls back to English if somehow unset). */
export function useSelectedLanguage(): Language {
  const code = useLanguageStore((s) => s.code);
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
