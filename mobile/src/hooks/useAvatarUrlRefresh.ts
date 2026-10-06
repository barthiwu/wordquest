import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@/state/authStore';
import { signedUrlExpiresAt } from '@/utils/signedUrl';

/** Fetch a fresh link this long before the current one stops working. */
const REFRESH_AHEAD_MS = 5 * 60 * 1000;
/** Used when the URL carries no expiry we can read. */
const FALLBACK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Keeps the signed profile-picture link in the auth store valid for as long
 * as the app is open: refreshes shortly before it expires, and again when the
 * app returns to the foreground (timers pause while it is backgrounded).
 * Mount once, near the app root.
 */
export function useAvatarUrlRefresh(): void {
  const avatarUrl = useAuthStore((s) => s.user?.avatarUrl ?? null);

  useEffect(() => {
    if (!avatarUrl) return;
    const expiresAt = signedUrlExpiresAt(avatarUrl);
    const wait = expiresAt ? Math.max(5_000, expiresAt - Date.now() - REFRESH_AHEAD_MS) : FALLBACK_INTERVAL_MS;
    const timer = setTimeout(() => void useAuthStore.getState().refreshAvatar({ force: true }), wait);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!expiresAt || expiresAt - Date.now() < REFRESH_AHEAD_MS) {
        void useAuthStore.getState().refreshAvatar();
      }
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [avatarUrl]);
}
