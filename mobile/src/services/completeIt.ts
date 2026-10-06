import { apiRequest } from './apiClient';
import type { ArcadePlayNotice } from './arcadePlays';
import type { AliExpressionCue, AliDisplayMessage } from './aliExpression';

/** Client-safe view of the current word — the word's own example
 * sentence with the target word blanked out, never the target word
 * itself (backend CompleteItChallengeView). Hints work the same way
 * ScrambleQuest's do -- an on-demand, server-tracked reveal -- just
 * sized differently (60% of the word's own letter count, rounded,
 * rather than ScrambleQuest's flat 3-hint cap; see backend
 * CompleteItService.maxHintsFor). */
export interface CompleteItChallenge {
  /** Only on the response that started a new play: today's standing, and the 50/70/90/100 percent milestone it crossed. */
  playLimit?: ArcadePlayNotice;
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
  hintsRemaining: number;
  maxHints: number;
  revealedLetters: { position: number; letter: string }[];
  currentStreak: number;
  longestStreak: number;
}

export interface CompleteItHint {
  position: number;
  letter: string;
  hintsRemaining: number;
}

export interface CompleteItAnswerResult {
  isCorrect: boolean;
  timedOut: boolean;
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
  nextChallenge: CompleteItChallenge | null;
  /** Populated only when sessionComplete — see AliStreakPopout. null otherwise, and null even then when no milestone was hit. */
  streakReaction: AliDisplayMessage | null;
  /** Populated only when sessionComplete — a "while you were playing..." recap of any Level-up/Journey reaction fired earlier this session. Always [] otherwise. */
  deferredAliReactions: AliDisplayMessage[];
  /** A short, zero-cost ALI reaction to this specific answer (task #100). Null only when timedOut. */
  aliQuickReaction: string | null;
  /** The visual pairing for aliQuickReaction — rendered by components/AliCharacter.tsx. Null only alongside aliQuickReaction (timedOut). */
  aliQuickExpression: AliExpressionCue | null;
}

/** Starts a new session, or resumes one already in progress. */
export function startCompleteIt(
  accessToken: string,
  versusMatchId?: string,
): Promise<CompleteItChallenge> {
  return apiRequest<CompleteItChallenge>('/arcade/complete-it/start', {
    method: 'POST',
    accessToken,
    ...(versusMatchId ? { body: { versusMatchId } } : {}),
  });
}

export function requestCompleteItHint(
  accessToken: string,
  sessionId: string,
): Promise<CompleteItHint> {
  return apiRequest<CompleteItHint>(`/arcade/complete-it/${sessionId}/hint`, {
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
