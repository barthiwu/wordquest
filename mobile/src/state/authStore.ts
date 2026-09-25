import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthResult, AuthUser } from '@/services/auth';
import { getMe } from '@/services/users';

const ACCESS_TOKEN_KEY = 'wordquest.accessToken.v2';
const REFRESH_TOKEN_KEY = 'wordquest.refreshToken.v2';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (result: AuthResult) => Promise<void>;
  clearSession: () => Promise<void>;
  /** Merges a partial profile update (e.g. from Settings' Profile section) into the in-memory user, so a saved displayName/username shows up immediately without a re-login. */
  updateUser: (patch: Partial<AuthUser>) => void;
}

/**
 * Tokens live in SecureStore (Keychain/Keystore-backed), not AsyncStorage —
 * they're credentials, not preferences. The store only mirrors them in
 * memory for the current session. User's chosen clan, XP, etc. are NOT
 * cached here — those come from the backend on demand (BUILD_HANDOFF §40:
 * frontend owns presentation/local prefs, backend owns progression truth).
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isHydrated: false,

  hydrate: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken, refreshToken, isHydrated: true });

    // Tokens alone don't carry the profile -- only setSession (a fresh
    // login/register/refresh response) does. A relaunch that skips those
    // (restoring a session from SecureStore instead) would otherwise leave
    // `user` null forever even though the tokens are perfectly valid,
    // which is why displayName/avatar show as blank/placeholder until the
    // next explicit login. Fetch it once here so a restored session looks
    // the same as a fresh one. Failure (offline, or a dead refresh token --
    // apiRequest already clears the session itself in that case) just
    // leaves `user` null, same as before this existed.
    if (accessToken) {
      try {
        const user = await getMe(accessToken);
        set({ user });
      } catch {
        // handled above
      }
    }
  },

  setSession: async (result: AuthResult) => {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, result.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refreshToken),
    ]);
    set({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken });
  },

  clearSession: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  updateUser: (patch: Partial<AuthUser>) => {
    set((state) => (state.user ? { user: { ...state.user, ...patch } } : state));
  },
}));
