import { apiRequest } from './apiClient';

/** Client-safe view of the current word — scrambled letters only, never
 * the target word (backend ScrambleQuestChallengeView). */
export interface ScrambleQuestChallenge {
  sessionId: string;
  wordIndex: number;
  wordsTotal: number;
  scrambledLetters: string;
  wordLength: number;
  timeLimitSeconds: number;
  /** ISO timestamp — server-authoritative deadline for this word. Render
   * a countdown from it; the server, not this clock, decides timeout. */
  deadlineAt: string;
  hintsRemaining: number;
  maxHints: number;
  revealedLetters: { position: number; letter: string }[];
  currentStreak: number;
  longestStreak: number;
}

export interface ScrambleQuestHint {
  position: number;
  letter: string;
  hintsRemaining: number;
}

/** A completed word's meaning — populated only once the word has been
 * answered (correct, wrong, or timed out), never while it's still the
 * active puzzle. */
export interface ScrambleQuestWordMeaning {
  definition: string;
  partOfSpeech: string;
  synonyms: string[];
}

export interface ScrambleQuestAnswerResult {
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
  nextChallenge: ScrambleQuestChallenge | null;
  meaning: ScrambleQuestWordMeaning;
}

/** Starts a new session, or resumes one already in progress. */
export function startScrambleQuest(accessToken: string): Promise<ScrambleQuestChallenge> {
  return apiRequest<ScrambleQuestChallenge>('/arcade/scramble-quest/start', {
    method: 'POST',
    accessToken,
  });
}

export function requestScrambleHint(
  accessToken: string,
  sessionId: string,
): Promise<ScrambleQuestHint> {
  return apiRequest<ScrambleQuestHint>(`/arcade/scramble-quest/${sessionId}/hint`, {
    method: 'POST',
    accessToken,
  });
}

export function submitScrambleAnswer(
  accessToken: string,
  sessionId: string,
  answer: string,
): Promise<ScrambleQuestAnswerResult> {
  return apiRequest<ScrambleQuestAnswerResult>(`/arcade/scramble-quest/${sessionId}/answer`, {
    method: 'POST',
    body: { answer },
    accessToken,
  });
}
