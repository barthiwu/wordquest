import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which visual direction the player is seeing.
 *
 *  - 'classic' — the shipped WordQuest UI (default; also the "revert" target).
 *  - 'new'     — the UI-only redesign from the Sept 2026 UI specification
 *                (responsive shell, restyled Home / Compete hub / Journey…).
 *
 * This is a presentation preference only — it never touches backend
 * contracts, progression, economy, scoring or timing, so it lives in
 * local storage exactly like themeStore (BUILD_HANDOFF §40: frontend owns
 * local prefs, backend owns progression truth). Reverting is one flag:
 * flip it back in Settings, or change DEFAULT_UI_VERSION below to ship
 * either look to everyone.
 */
export type UiVersion = 'classic' | 'new';

/** Flip this single constant to make the redesign (or the old UI) the
 * default for players who have never touched the Settings switch. */
export const DEFAULT_UI_VERSION: UiVersion = 'classic';

export const UI_VERSION_STORAGE_KEY = 'wordquest.uiVersion.v1';

interface UiVersionState {
  version: UiVersion;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setVersion: (version: UiVersion) => void;
}

export function parseUiVersion(raw: unknown): UiVersion | null {
  return raw === 'classic' || raw === 'new' ? raw : null;
}

export const useUiVersionStore = create<UiVersionState>((set) => ({
  version: DEFAULT_UI_VERSION,
  isHydrated: false,

  hydrate: async () => {
    try {
      const stored = parseUiVersion(await AsyncStorage.getItem(UI_VERSION_STORAGE_KEY));
      if (stored) {
        set({ version: stored, isHydrated: true });
        return;
      }
    } catch {
      // Storage unavailable — keep the default; cosmetic preference only.
    }
    set({ isHydrated: true });
  },

  setVersion: (version) => {
    set({ version });
    AsyncStorage.setItem(UI_VERSION_STORAGE_KEY, version).catch(() => {});
  },
}));

/** True when the redesigned UI is active. Call inside components. */
export function useIsNewLook(): boolean {
  return useUiVersionStore((s) => s.version === 'new');
}
