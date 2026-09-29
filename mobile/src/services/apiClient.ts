import { env } from '@/app/config/env';
import { useTokenStore } from '@/state/tokenStore';
import { trackEvent } from './analyticsClient';

/**
 * Thin fetch wrapper — every network call the app makes goes through here.
 * The mobile app NEVER calls an AI provider or third-party service directly;
 * everything routes through the WordQuest backend (BUILD_HANDOFF §13).
 *
 * Access tokens are short-lived (JWT_ACCESS_EXPIRES_IN, 15m by default) so
 * a 401 on an authenticated request is the common case, not the exception
 * — this transparently spends the (30-day) refresh token to get a new
 * access token and retries once before giving up. Concurrent 401s share
 * one in-flight refresh (refreshPromise) instead of each firing their own
 * /auth/refresh call. If refresh itself fails (refresh token also expired
 * or revoked), the session is cleared so the app's own stale-session
 * handling takes over rather than looping on 401s forever.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  /** Extra headers layered on top of Content-Type/Authorization — e.g. Idempotency-Key for Boss Battle's answer submission. */
  headers?: Record<string, string>;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useTokenStore.getState();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${env.apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return null;

    const result = await response.json();
    // Only accessToken/refreshToken -- /auth/refresh never returns `user`
    // (see AuthService.refresh's AuthTokens return type on the backend).
    // Route this through tokenStore, not authStore.setSession, so a
    // silent refresh rotates the tokens without clobbering the cached
    // user profile with an undefined one.
    await useTokenStore.getState().setTokens(result.accessToken, result.refreshToken);
    return result.accessToken as string;
  } catch {
    return null;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, accessToken, headers } = options;

  const doFetch = (token?: string) =>
    fetch(`${env.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let response = await doFetch(accessToken);

  if (response.status === 401 && accessToken && path !== '/auth/refresh') {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newAccessToken = await refreshPromise;

    if (newAccessToken) {
      response = await doFetch(newAccessToken);
    } else {
      await useTokenStore.getState().clearTokens();
    }
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : undefined;

  if (!response.ok) {
    const message = (payload && (payload as { message?: string }).message) || response.statusText;
    // Single choke point (Telemetry spec, generic error tracking) --
    // every failed API call in the app funnels through this one throw
    // site, so this is the one place API_ERROR needs to fire rather
    // than instrumenting every services/*.ts caller individually. Not
    // wrapped in the 401-refresh-retry branch above: by the time
    // execution reaches here, `response` is already the final
    // (post-retry, if any) response, so a request that succeeded after
    // a silent token refresh never reports an error at all.
    trackEvent('API_ERROR', { path, method, status: response.status, message });
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
