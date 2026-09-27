import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'wordquest.accessToken.v2';
const REFRESH_TOKEN_KEY = 'wordquest.refreshToken.v2';

interface TokenState {
  accessToken: string | null;
  refreshToken: string | null;
  /** Reads both tokens from SecureStore into memory (app launch) and returns them. */
  loadTokens: () => Promise<{ accessToken: string | null; refreshToken: string | null }>;
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
 */
export const useTokenStore = create<TokenState>((set) => ({
  accessToken: null,
  refreshToken: null,

  loadTokens: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken, refreshToken });
    return { accessToken, refreshToken };
  },

  setTokens: async (accessToken: string, refreshToken: string) => {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },

  clearTokens: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken: null, refreshToken: null });
  },
}));
