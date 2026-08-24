import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthResult, AuthUser } from '@/services/auth';

const ACCESS_TOKEN_KEY = 'wordquest.accessToken';
const REFRESH_TOKEN_KEY = 'wordquest.refreshToken';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (result: AuthResult) => Promise<void>;
  clearSession: () => Promise<void>;
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
}));
