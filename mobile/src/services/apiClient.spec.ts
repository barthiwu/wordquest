import { apiRequest, ApiError } from './apiClient';
import { useTokenStore } from '@/state/tokenStore';
import { env } from '@/app/config/env';

function mockFetchResponse(options: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  isJson?: boolean;
}) {
  const { ok, status = 200, statusText = '', json, isJson = true } = options;
  return {
    ok,
    status,
    statusText,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' && isJson ? 'application/json' : null,
    },
    json: async () => json,
  } as unknown as Response;
}

describe('apiRequest', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('builds the request against env.apiUrl with the given path', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ ok: true, json: { id: '1' } }),
    );

    await apiRequest('/api/v1/quests/daily');

    expect(global.fetch).toHaveBeenCalledWith(
      `${env.apiUrl}/api/v1/quests/daily`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('defaults to a GET request with no body', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockFetchResponse({ ok: true, json: {} }));

    await apiRequest('/api/v1/health');

    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(requestInit.method).toBe('GET');
    expect(requestInit.body).toBeUndefined();
  });

  it('serializes the body and sets the method for a POST request', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ ok: true, json: { ok: true } }),
    );

    await apiRequest('/api/v1/quests/answer', { method: 'POST', body: { answer: 'hello' } });

    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(requestInit.method).toBe('POST');
    expect(requestInit.body).toBe(JSON.stringify({ answer: 'hello' }));
  });

  it('attaches an Authorization header only when an access token is given', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockFetchResponse({ ok: true, json: {} }));
    await apiRequest('/api/v1/quests/daily', { accessToken: 'tok123' });
    let [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(requestInit.headers.Authorization).toBe('Bearer tok123');

    (global.fetch as jest.Mock).mockResolvedValueOnce(mockFetchResponse({ ok: true, json: {} }));
    await apiRequest('/api/v1/quests/daily');
    [, requestInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(requestInit.headers.Authorization).toBeUndefined();
  });

  it('layers extra headers on top of Content-Type/Authorization', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockFetchResponse({ ok: true, json: {} }));
    await apiRequest('/api/v1/boss-battle/answer', {
      method: 'POST',
      accessToken: 'tok123',
      headers: { 'Idempotency-Key': 'abc-123' },
    });
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(requestInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok123',
      'Idempotency-Key': 'abc-123',
    });
  });

  it('returns the parsed JSON body on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ ok: true, json: { xpAwarded: 10 } }),
    );

    const result = await apiRequest<{ xpAwarded: number }>('/api/v1/quests/answer');

    expect(result).toEqual({ xpAwarded: 10 });
  });

  it('returns undefined when the response has no JSON body', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ ok: true, isJson: false }),
    );

    const result = await apiRequest('/api/v1/health');

    expect(result).toBeUndefined();
  });

  it('throws an ApiError with the server message and status on a non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({
        ok: false,
        status: 400,
        json: { message: 'Quest attempt has no remaining words' },
      }),
    );

    await expect(apiRequest('/api/v1/quests/answer')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Quest attempt has no remaining words',
    });
  });

  it('falls back to statusText when an error response has no message field', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        isJson: false,
      }),
    );

    await expect(apiRequest('/api/v1/quests/daily')).rejects.toMatchObject({
      status: 500,
      message: 'Internal Server Error',
    });
  });

  it('is an instance of ApiError (not a generic Error) on failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ ok: false, status: 404, json: {} }),
    );

    await expect(apiRequest('/api/v1/quests/missing')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiRequest resilience (backend asleep / redeploying)', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    // Skip the real back-off waits.
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  it('retries a GET through transient 503s and returns the eventual success', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 503 }))
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 504 }))
      .mockResolvedValueOnce(mockFetchResponse({ ok: true, json: { id: 'me' } }));

    await expect(apiRequest('/users/me')).resolves.toEqual({ id: 'me' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries a GET after a network failure', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(mockFetchResponse({ ok: true, json: { ok: true } }));

    await expect(apiRequest('/users/me')).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('never repeats a POST on a transient error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ ok: false, status: 503 }),
    );

    await expect(apiRequest('/quests/answer', { method: 'POST', body: {} })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the token refresh fails because the server is down', async () => {
    useTokenStore.setState({ accessToken: 'old', refreshToken: 'rt' });
    const clear = jest.spyOn(useTokenStore.getState(), 'clearTokens');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 401 }))
      .mockResolvedValue(mockFetchResponse({ ok: false, status: 503 }));

    await expect(apiRequest('/users/me', { accessToken: 'old' })).rejects.toMatchObject({
      status: 503,
    });
    expect(clear).not.toHaveBeenCalled();
  });

  it('never re-sends the single-use refresh token after a 504 (it may already have been used)', async () => {
    useTokenStore.setState({ accessToken: 'old', refreshToken: 'rt' });
    const clear = jest.spyOn(useTokenStore.getState(), 'clearTokens');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 401 }))
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 504 }));

    await expect(apiRequest('/users/me', { accessToken: 'old' })).rejects.toMatchObject({ status: 503 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(clear).not.toHaveBeenCalled();
  });

  it('uses the token another tab already rotated instead of refreshing again', async () => {
    useTokenStore.setState({ accessToken: 'old', refreshToken: 'rt-old' });
    jest
      .spyOn(useTokenStore.getState(), 'peekTokens')
      .mockResolvedValue({ accessToken: 'fresh', refreshToken: 'rt-new' });
    jest.spyOn(useTokenStore.getState(), 'setTokens').mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 401 }))
      .mockResolvedValueOnce(mockFetchResponse({ ok: true, json: { id: 'me' } }));

    await expect(apiRequest('/users/me', { accessToken: 'old' })).resolves.toEqual({ id: 'me' });
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/auth/refresh'))).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('signs out only when the server rejects the refresh token', async () => {
    useTokenStore.setState({ accessToken: 'old', refreshToken: 'rt' });
    const clear = jest.spyOn(useTokenStore.getState(), 'clearTokens').mockResolvedValue(undefined);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 401 }))
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 401 }));

    await expect(apiRequest('/users/me', { accessToken: 'old' })).rejects.toBeInstanceOf(ApiError);
    expect(clear).toHaveBeenCalled();
  });
});
