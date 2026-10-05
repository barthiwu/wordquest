import { Platform } from 'react-native';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'wordquest.accessToken.v2';
const REFRESH_TOKEN_KEY = 'wordquest.refreshToken.v2';

interface TokenState {
  accessToken: string | null;
  refreshToken: string | null;
  /** Reads both tokens from SecureStore into memory (app launch) and returns them. */
  loadTokens: () => Promise<{ accessToken: string | null; refreshToken: string | null }>;
  /** Reads the stored tokens WITHOUT touching memory (no subscriber fires). */
  peekTokens: () => Promise<{ accessToken: string | null; refreshToken: string | null }>;
  /** Persists a fresh access/refresh pair (login, register, or a silent refresh). */
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  /** Wipes both tokens from SecureStore and memory (logout, or a dead refresh token). */
  clearTokens: () => Promise<void>;
}

/**
 * Tokens live here, split out of authStore.ts (which still owns the
 * player-facing session: `user`, `isHydrated`, etc.) so that
 * services/apiClient.ts -- which needs to read the refresh token and clear
 * the session on a failed refresh -- can depend on this tiny module
 * instead of the full authStore.
 *
 * Why that split matters: authStore.ts pulls in services/users.ts (to
 * fetch the profile right after hydrate), and services/users.ts imports
 * apiClient.ts. If apiClient.ts also imported authStore.ts directly, that
 * closes apiClient -> authStore -> users -> apiClient into a require
 * cycle -- confirmed via `madge --circular` as
 * "services/apiClient.ts > state/authStore.ts > services/users.ts", the
 * same one Metro was warning about at bundle time. Making the authStore ->
 * users edge a dynamic `import()` (an earlier attempt at this fix) did NOT
 * break the cycle -- Metro's dependency graph tracks dynamic imports too,
 * it only changes *when* the module executes, not whether it's a graph
 * edge. The only way to actually remove the cycle is to remove one of the
 * three edges outright: apiClient -> tokenStore has no path back to
 * itself, so there's nothing left to warn about.
 *
 * Tokens live in SecureStore (Keychain/Keystore-backed), not AsyncStorage
 * -- they're credentials, not preferences.
 *
 * On web there's no Keychain/Keystore to back SecureStore -- its web
 * shim doesn't implement the read path (confirmed via the browser
 * console: "getValueWithKeyAsync is not a function"), so hydrate()
 * silently failed and every page load looked logged-out even right
 * after a successful login. `storage` below swaps in a thin
 * localStorage-backed shim on web only; native (iOS/Android) keeps using
 * real SecureStore unchanged. localStorage is per-browser, unencrypted,
 * origin-scoped storage -- an acceptable tradeoff for the browser-play
 * build (see docs), not a claim that it's as secure as Keychain/Keystore.
 */
const webStorage = {
  getItemAsync: async (key: string): Promise<string | null> => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Private-browsing / storage-blocked contexts can throw on access --
      // treat that the same as "nothing stored" rather than crashing.
      return null;
    }
  },
  setItemAsync: async (key: string, value: string): Promise<void> => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage full or blocked -- the token still lives in memory for
      // this page load, it just won't survive a refresh. Non-fatal.
    }
  },
  deleteItemAsync: async (key: string): Promise<void> => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clean up if storage was never writable.
    }
  },
};

const storage = Platform.OS === 'web' ? webStorage : SecureStore;

export const useTokenStore = create<TokenState>((set) => ({
  accessToken: null,
  refreshToken: null,

  loadTokens: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      storage.getItemAsync(ACCESS_TOKEN_KEY),
      storage.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken, refreshToken });
    return { accessToken, refreshToken };
  },

  peekTokens: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      storage.getItemAsync(ACCESS_TOKEN_KEY),
      storage.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    return { accessToken, refreshToken };
  },

  setTokens: async (accessToken: string, refreshToken: string) => {
    await Promise.all([
      storage.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      storage.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },

  clearTokens: async () => {
    await Promise.all([
      storage.deleteItemAsync(ACCESS_TOKEN_KEY),
      storage.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken: null, refreshToken: null });
  },
}));
