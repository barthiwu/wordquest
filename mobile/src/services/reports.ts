import { apiRequest } from './apiClient';

export type ReportTargetType = 'USER' | 'CLAN' | 'WORD_IN_THE_WILD_SUBMISSION';

/** Files a moderation report — see backend ModerationService.fileReport. Reviewed by admin/support only; the reporter never sees the outcome in-app. */
export function fileReport(
  accessToken: string,
  input: { targetType: ReportTargetType; targetId: string; reason: string },
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>('/reports', { method: 'POST', body: input, accessToken });
}
