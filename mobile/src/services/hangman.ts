import { apiRequest } from './apiClient';
import type { ArcadePlayNotice } from './arcadePlays';
import type { AliExpressionCue, AliDisplayMessage } from './aliExpression';

/** Client-safe view of the current Hangman word (backend
 * HangmanChallengeView) -- the pattern has '_' for every hidden letter,
 * never the word itself. */
export interface HangmanChallenge {
  /** Only on the response that started a new play: today's standing, and the 50/70/90/100 percent milestone it crossed. */
  playLimit?: ArcadePlayNotice;
  sessionId: string;
  wordIndex: number;
  wordsTotal: number;
  pattern: string;
  wordLength: number;
  guessedLetters: string[];
  wrongLetters: string[];
  wrongCount: number;
  maxWrong: number;
  definition: string;
  synonyms: string[];
  hintsRemaining: number;
  maxHints: number;
  currentStreak: number;
  longestStreak: number;
}

export interface HangmanWordMeaning {
  definition: string;
  partOfSpeech: string;
  synonyms: string[];
}

export interface HangmanWordCompletion {
  outcome: 'WON' | 'LOST';
  correctAnswer: string;
  xpAwarded: number;
  currentStreak: number;
  longestStreak: number;
  sessionComplete: boolean;
  totalXpAwarded: number;
  correctCount: number;
  wordsTotal: number;
  nextChallenge: HangmanChallenge | null;
  meaning: HangmanWordMeaning;
  streakReaction: AliDisplayMessage | null;
  deferredAliReactions: AliDisplayMessage[];
  aliQuickReaction: string | null;
  aliQuickExpression: AliExpressionCue | null;
}

export interface HangmanGuessResult {
  letter: string;
  isHit: boolean;
  view: HangmanChallenge;
  /** Non-null once the word has finished (saved or hanged). */
  completion: HangmanWordCompletion | null;
}

export interface HangmanHintResult {
  letter: string;
  view: HangmanChallenge;
}

/** Starts a new session, or resumes one already in progress. */
export function startHangman(
  accessToken: string,
  versusMatchId?: string,
): Promise<HangmanChallenge> {
  return apiRequest<HangmanChallenge>('/arcade/hangman/start', {
    method: 'POST',
    accessToken,
    ...(versusMatchId ? { body: { versusMatchId } } : {}),
  });
}

export function guessHangmanLetter(
  accessToken: string,
  sessionId: string,
  letter: string,
): Promise<HangmanGuessResult> {
  return apiRequest<HangmanGuessResult>(`/arcade/hangman/${sessionId}/guess`, {
    method: 'POST',
    body: { letter },
    accessToken,
  });
}

export function requestHangmanHint(
  accessToken: string,
  sessionId: string,
): Promise<HangmanHintResult> {
  return apiRequest<HangmanHintResult>(`/arcade/hangman/${sessionId}/hint`, {
    method: 'POST',
    accessToken,
  });
}
