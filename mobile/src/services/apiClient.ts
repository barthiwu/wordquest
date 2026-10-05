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

/**
 * Statuses that mean "the server isn't answering right now", not "your
 * request was wrong": the hosting proxy returns these while the backend is
 * restarting, redeploying or waking from sleep. A tab left open for hours
 * and resumed lands exactly there.
 */
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
/** Back-off between attempts, ~10s in all: long enough for a cold backend. */
const RETRY_DELAYS_MS = [1000, 3000, 6000];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `send`, retrying network failures and transient 5xx responses when
 * `retry` is set. Only requests that are safe to repeat (GETs, the token
 * refresh) retry; a quest answer or purchase is never sent twice from here.
 */
async function fetchWithRetry(send: () => Promise<Response>, retry: boolean): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = !retry || attempt >= RETRY_DELAYS_MS.length;
    try {
      const response = await send();
      if (last || !TRANSIENT_STATUSES.has(response.status)) return response;
    } catch (error) {
      if (last) throw error;
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

/** Fire-and-forget ping that starts waking a sleeping backend before the screen asks it for data. */
export function wakeBackend(): void {
  fetch(`${env.apiUrl}/health`).catch(() => undefined);
}

/**
 * accessToken = the new token; rejected = the server refused the refresh
 * token (sign in again). Neither = the server couldn't be reached, so the
 * session must be KEPT: logging someone out because the backend was asleep
 * is what made long-idle tabs come back signed out.
 */
interface RefreshOutcome {
  accessToken: string | null;
  rejected: boolean;
}

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function refreshAccessToken(): Promise<RefreshOutcome> {
  const { refreshToken } = useTokenStore.getState();
  if (!refreshToken) return { accessToken: null, rejected: true };

  try {
    const response = await fetchWithRetry(
      () =>
        fetch(`${env.apiUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        }),
      true,
    );
    if (!response.ok) {
      return { accessToken: null, rejected: [400, 401, 403].includes(response.status) };
    }

    const result = await response.json();
    // Only accessToken/refreshToken -- /auth/refresh never returns `user`
    // (see AuthService.refresh's AuthTokens return type on the backend).
    // Route this through tokenStore, not authStore.setSession, so a
    // silent refresh rotates the tokens without clobbering the cached
    // user profile with an undefined one.
    await useTokenStore.getState().setTokens(result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken as string, rejected: false };
  } catch {
    return { accessToken: null, rejected: false };
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

  const retry = method === 'GET';
  let response = await fetchWithRetry(() => doFetch(accessToken), retry);

  if (response.status === 401 && accessToken && path !== '/auth/refresh') {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const outcome = await refreshPromise;

    if (outcome.accessToken) {
      const token = outcome.accessToken;
      response = await fetchWithRetry(() => doFetch(token), retry);
    } else if (outcome.rejected) {
      await useTokenStore.getState().clearTokens();
    } else {
      throw new ApiError('WordQuest is reconnecting. Please try again in a moment.', 503);
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
