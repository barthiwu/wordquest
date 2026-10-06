import { create } from 'zustand';
import type { AuthResult, AuthUser } from '@/services/auth';
import { useTokenStore } from './tokenStore';
import { useAnalyticsQueueStore } from './analyticsQueueStore';

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
 * The player-facing session: who's logged in (`user`) and whether we've
 * finished reading tokens back from disk (`isHydrated`). The tokens
 * themselves live in tokenStore.ts, not here -- see that file's header
 * comment for why (breaking a require cycle with services/apiClient.ts).
 * This store mirrors tokenStore's accessToken/refreshToken into its own
 * state below so every existing `useAuthStore((s) => s.accessToken)` call
 * site across the app keeps working unchanged, including when apiClient.ts
 * rotates the access token on a silent 401 refresh -- a change made
 * directly against tokenStore, not through this store.
 *
 * User's chosen clan, XP, etc. are NOT cached here -- those come from the
 * backend on demand (BUILD_HANDOFF §40: frontend owns presentation/local
 * prefs, backend owns progression truth).
 */
export const useAuthStore = create<AuthState>((set) => {
  useTokenStore.subscribe((tokenState) => {
    set({
      accessToken: tokenState.accessToken,
      refreshToken: tokenState.refreshToken,
      // Signed out (logout, or the server rejected the session): drop the
      // cached profile too, so nothing shows the old player's name.
      ...(tokenState.refreshToken ? {} : { user: null }),
    });
  });

  // Both SplashScreen (the normal cold-start path) and RootNavigator (so a
  // deep link that bypasses Splash entirely still hydrates the store --
  // see RootNavigator.tsx's comment) call hydrate() on mount, which for a
  // normal cold start means both fire within the same tick. This caches
  // the in-flight promise so the second caller awaits the first one's
  // work instead of reading tokens and re-fetching the profile a second
  // time in parallel. The cache is cleared once hydration settles (rather
  // than kept forever) so a later, genuinely separate hydrate() call --
  // in a test, or any future re-hydrate after a session change -- still
  // does real work instead of replaying a stale result.
  let hydratePromise: Promise<void> | undefined;

  return {
    user: null,
    accessToken: null,
    refreshToken: null,
    isHydrated: false,

    hydrate: () => {
      if (hydratePromise) return hydratePromise;

      hydratePromise = (async () => {
        try {
          const { accessToken } = await useTokenStore.getState().loadTokens();
          set({ isHydrated: true });

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
              const { getMe } = await import('@/services/users');
              const user = await getMe(accessToken);
              set({ user });
            } catch {
              // handled above
            }
          }
        } finally {
          hydratePromise = undefined;
        }
      })();

      return hydratePromise;
    },

    setSession: async (result: AuthResult) => {
      await useTokenStore.getState().setTokens(result.accessToken, result.refreshToken);
      set({ user: result.user });
    },

    clearSession: async () => {
      await useTokenStore.getState().clearTokens();
      // Anything still queued belongs to the player who just left.
      useAnalyticsQueueStore.getState().clear();
      set({ user: null });
    },

    updateUser: (patch: Partial<AuthUser>) => {
      set((state) => (state.user ? { user: { ...state.user, ...patch } } : state));
    },
  };
});
