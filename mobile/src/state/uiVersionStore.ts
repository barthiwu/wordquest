import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which visual direction the player is seeing.
 *
 *  - 'standard'  — the responsive WordQuest UI (default). The original
 *                  "classic" UI was retired in Oct 2026 (git tag
 *                  `classic-ui-final` keeps it recoverable).
 *  - 'prototype' — the illustrated "New look": scene backdrops, animated
 *                  ALI, gradient CTAs, from the Oct 2026 UI prototype.
 *
 * Presentation preference only — it never touches backend contracts,
 * progression, economy, scoring or timing, so it lives in local storage
 * exactly like themeStore. Reverting is one switch in Settings, or change
 * DEFAULT_UI_VERSION to ship either look to everyone.
 */
export type UiVersion = 'standard' | 'prototype';

export const DEFAULT_UI_VERSION: UiVersion = 'standard';

/** v2: the v1 key stored 'classic' | 'new' with different meanings. */
export const UI_VERSION_STORAGE_KEY = 'wordquest.uiVersion.v2';

interface UiVersionState {
  version: UiVersion;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setVersion: (version: UiVersion) => void;
}

export function parseUiVersion(raw: unknown): UiVersion | null {
  return raw === 'standard' || raw === 'prototype' ? raw : null;
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

/** True when the illustrated prototype "New look" is active. Call inside components. */
export function useIsPrototype(): boolean {
  return useUiVersionStore((s) => s.version === 'prototype');
}
