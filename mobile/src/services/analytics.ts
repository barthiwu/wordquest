import { apiRequest } from './apiClient';

/** Mirrors the backend's AnalyticsEventDto (Telemetry spec §5/§23). */
export interface AnalyticsEventPayload {
  clientEventId: string;
  eventName: string;
  sessionId?: string;
  screen?: string;
  /** ISO timestamp — when the event actually happened on this device. */
  occurredAt: string;
  properties?: Record<string, unknown>;
}

export interface SubmitAnalyticsEventsResult {
  accepted: number;
  rejected: number;
}

/**
 * POST /api/v1/analytics/events — the one network call analyticsClient.ts
 * makes. Kept as a thin, separate function (rather than inlined in the
 * client) so the client's queue/batch/retry logic can be tested without
 * mocking fetch directly, same separation every other services/*.ts file
 * in this app already has from its own store/screen callers.
 */
export function submitAnalyticsEvents(
  accessToken: string,
  events: AnalyticsEventPayload[],
  batchMeta: { platform: 'ios' | 'android' | 'web'; appVersion: string },
): Promise<SubmitAnalyticsEventsResult> {
  return apiRequest<SubmitAnalyticsEventsResult>('/analytics/events', {
    method: 'POST',
    accessToken,
    body: { ...batchMeta, events },
  });
}
