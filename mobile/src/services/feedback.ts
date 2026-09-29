import { apiRequest } from './apiClient';

export type FeedbackType = 'PROMPT' | 'FREEFORM';
export type FeedbackCategory =
  'GAMEPLAY' | 'DIFFICULTY' | 'WORD_DUEL' | 'ARCADE' | 'ALI' | 'BUG' | 'UI' | 'OTHER';

export interface SubmitFeedbackInput {
  type: FeedbackType;
  category: FeedbackCategory;
  /** 1-5, the emoji-scale ordinal. Omit for a message-only FREEFORM submission. */
  rating?: number;
  message?: string;
  screen?: string;
  context?: Record<string, unknown>;
}

/** POST /api/v1/feedback — backs both the targeted lightweight prompts
 * (spec §18) and the standalone Settings -> Send Feedback screen
 * (spec §20). */
export function submitFeedback(accessToken: string, input: SubmitFeedbackInput): Promise<unknown> {
  return apiRequest('/feedback', {
    method: 'POST',
    accessToken,
    body: input,
  });
}
