import { apiRequest } from './apiClient';

export interface AliMessage {
  text: string;
  recommendation: string | null;
  tone: string;
  promptVersion: string;
}

/**
 * ALI is reactive, not conversational (spec §4) — there's no "send a
 * message to ALI" endpoint. This is a read-only feed of what ALI has
 * already said in reaction to real events (level-ups, achievements,
 * Boss Battle results, streaks, Order selection).
 */
export function getMyAliMessages(accessToken: string, limit?: number): Promise<AliMessage[]> {
  const params = limit ? `?limit=${limit}` : '';
  return apiRequest<AliMessage[]>(`/ali/me${params}`, { accessToken });
}

/**
 * Learning Assistant (spec §4.2): explains why an answer was wrong and
 * gives one practice tip, on demand — the endpoint already existed
 * server-side (V22 §6 finding: nothing in the app called it).
 */
export function explainMistake(
  accessToken: string,
  params: {
    word: string;
    playerAnswer: string;
    correctAnswer: string;
    stage: 'GUESS' | 'SENTENCE' | 'PARAGRAPH';
  },
): Promise<AliMessage> {
  return apiRequest<AliMessage>('/ali/explain-mistake', {
    method: 'POST',
    accessToken,
    body: params,
  });
}
