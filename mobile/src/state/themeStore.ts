import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type ThemeColors } from '@/constants/theme';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'wordquest.themeMode.v1';

interface ThemeState {
  mode: ThemeMode;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

/**
 * Light/dark preference (Sept 2026 request: a floating sun/moon toggle
 * that switches WordQuest's whole look). This is a per-device UI
 * preference, not progression data, so — same reasoning as
 * evidenceModeStore's doc comment — it belongs in local storage, not the
 * backend. AsyncStorage rather than SecureStore (authStore's choice):
 * this isn't a credential, and SecureStore's keychain/keystore backing
 * would be the wrong tool for a plain preference flag.
 *
 * Defaults to 'dark' (the world-at-night look WordQuest shipped with)
 * until hydrate() resolves, so a first paint before storage loads never
 * flashes the wrong theme for a returning player who chose light.
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'dark',
  isHydrated: false,

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        set({ mode: stored, isHydrated: true });
        return;
      }
    } catch {
      // Storage unavailable — fall through to the default and move on;
      // this is a cosmetic preference, never worth blocking the app for.
    }
    set({ isHydrated: true });
  },

  toggle: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    set({ mode: next });
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  },

  setMode: (mode: ThemeMode) => {
    set({ mode });
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  },
}));

/** The current theme's color palette, reactive to the toggle. Screens
 * that want to support light mode call this INSIDE the component (not
 * at module scope) and build their StyleSheet from the result — see
 * HomeScreen for the pattern. */
export function useThemeColors(): ThemeColors {
  const mode = useThemeStore((s) => s.mode);
  return mode === 'light' ? lightColors : darkColors;
}
