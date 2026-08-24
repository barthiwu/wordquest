import { env } from '@/app/config/env';

/**
 * Thin fetch wrapper — every network call the app makes goes through here.
 * The mobile app NEVER calls an AI provider or third-party service directly;
 * everything routes through the WordQuest backend (BUILD_HANDOFF §13).
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, accessToken, headers } = options;

  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : undefined;

  if (!response.ok) {
    throw new ApiError(
      (payload && (payload as { message?: string }).message) || response.statusText,
      response.status,
      payload,
    );
  }

  return payload as T;
}
