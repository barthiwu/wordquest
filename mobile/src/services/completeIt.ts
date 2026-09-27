import { apiRequest } from './apiClient';

/** Client-safe view of the current word — the word's own example
 * sentence with the target word blanked out, never the target word
 * itself (backend CompleteItChallengeView). No hint fields at all:
 * Complete It never offers hints (COMPLETE_IT_CONFIG.HINTS_ENABLED is
 * false), unlike ScrambleQuest. */
export interface CompleteItChallenge {
  sessionId: string;
  wordIndex: number;
  wordsTotal: number;
  sentenceWithBlank: string;
  definition: string;
  partOfSpeech: string;
  wordLength: number;
  timeLimitSeconds: number;
  /** ISO timestamp — server-authoritative deadline for this word. Render
   * a countdown from it; the server, not this clock, decides timeout. */
  deadlineAt: string;
  currentStreak: number;
  longestStreak: number;
}

export interface CompleteItAnswerResult {
  isCorrect: boolean;
  timedOut: boolean;
  correctAnswer: string;
  xpAwarded: number;
  currentStreak: number;
  longestStreak: number;
  sessionComplete: boolean;
  totalXpAwarded: number;
  correctCount: number;
  wordsTotal: number;
  nextChallenge: CompleteItChallenge | null;
}

/** Starts a new session, or resumes one already in progress. */
export function startCompleteIt(accessToken: string): Promise<CompleteItChallenge> {
  return apiRequest<CompleteItChallenge>('/arcade/complete-it/start', {
    method: 'POST',
    accessToken,
  });
}

export function submitCompleteItAnswer(
  accessToken: string,
  sessionId: string,
  answer: string,
): Promise<CompleteItAnswerResult> {
  return apiRequest<CompleteItAnswerResult>(`/arcade/complete-it/${sessionId}/answer`, {
    method: 'POST',
    body: { answer },
    accessToken,
  });
}
