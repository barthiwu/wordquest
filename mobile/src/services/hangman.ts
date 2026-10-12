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
  /** Seconds allowed for this word (45). */
  timeLimitSeconds: number;
  /** ISO timestamp, server-authoritative: the countdown is drawn from it. */
  deadlineAt: string;
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
  /** True when the word was lost because the 45 seconds ran out. */
  timedOut: boolean;
  /** Every letter the player tried on this word, in order. */
  guessedLetters: string[];
  correctAnswer: string;
  xpAwarded: number;
  currentStreak: number;
  longestStreak: number;
  sessionComplete: boolean;
  /** Only on the final answer of a head-to-head play: that play now counts toward today's cap. */
  playLimit?: ArcadePlayNotice;
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
  groupId?: string,
): Promise<HangmanChallenge> {
  return apiRequest<HangmanChallenge>('/arcade/hangman/start', {
    method: 'POST',
    accessToken,
    ...(versusMatchId || groupId
      ? { body: { ...(versusMatchId ? { versusMatchId } : {}), ...(groupId ? { groupId } : {}) } }
      : {}),
  });
}

export function guessHangmanLetter(
  accessToken: string,
  sessionId: string,
  letter: string,
): Promise<HangmanGuessResult> {
  return apiRequest<HangmanGuessResult>(`/arcade/hangman/${sessionId}/guess`, {
    method: 'POST',
    // deferNext: don't send the next word yet (its 45s clock starts on Continue).
    body: { letter, deferNext: true },
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

/** The countdown reached zero: asks the server to settle the word as lost. The server only agrees once its own deadline has passed. */
export function timeoutHangmanWord(
  accessToken: string,
  sessionId: string,
): Promise<HangmanGuessResult> {
  return apiRequest<HangmanGuessResult>(`/arcade/hangman/${sessionId}/timeout`, {
    method: 'POST',
    body: { deferNext: true },
    accessToken,
  });
}

/** The player tapped Continue: starts the held-back next word's 45s clock and returns the word. Safe to repeat. */
export function beginHangmanWord(
  accessToken: string,
  sessionId: string,
): Promise<HangmanChallenge> {
  return apiRequest<HangmanChallenge>(`/arcade/hangman/${sessionId}/begin`, {
    method: 'POST',
    accessToken,
  });
}
