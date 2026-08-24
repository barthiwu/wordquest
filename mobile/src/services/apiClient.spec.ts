import { apiRequest, ApiError } from './apiClient';
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
