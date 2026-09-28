import { apiRequest } from './apiClient';
import type { AliExpressionCue, AliDisplayMessage } from './aliExpression';

/** Opponent's live score only — never their current word or answers
 * (backend WordDuelOpponentView; matches the server's own "score only,
 * never their current word" comment). userId/username/avatarUrl are
 * deliberately absent (undefined) while the match is WAITING/ACTIVE —
 * they are populated only once `status` is COMPLETED, backing the
 * avatar-tap "Profile / Add Friend / Block" popup on the post-match
 * result (2026-09). Never render/use these three fields outside a
 * COMPLETED state. */
export interface WordDuelOpponentView {
  correctCount: number;
  totalXp: number;
  userId?: string;
  username?: string;
  avatarUrl?: string | null;
}

/** A letter-by-letter display of this player's current word — spaces
 * between positions, revealed letters uppercase, hidden ones `_`. Clues
 * reveal automatically over time server-side (WORD_DUEL_CONFIG.
 * CLUE_INTERVAL_SECONDS); there is no hint button, unlike ScrambleQuest —
 * polling `getWordDuelState` is what picks up a newly-revealed letter. */
export interface WordDuelCurrentWordView {
  displayHint: string;
  cluesRevealed: number;
  maxClues: number;
}

export interface WordDuelResultView {
  winnerId: string | null;
  /** null on a genuine draw. */
  youWon: boolean | null;
  tieBreakReason: string | null;
}

export interface WordDuelStateView {
  matchId: string;
  status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  /** ISO timestamp — server-authoritative match deadline. null while WAITING. */
  matchEndsAt: string | null;
  wordsTotal: number;
  wordIndex: number;
  /** null while WAITING, once COMPLETED/ABANDONED, or once this player
   * has answered every word before the match clock ran out (they just
   * wait for the opponent / the clock). */
  current: WordDuelCurrentWordView | null;
  currentStreak: number;
  longestStreak: number;
  correctCount: number;
  totalXp: number;
  /** null only while WAITING (no opponent has joined yet). */
  opponent: WordDuelOpponentView | null;
  /** null until status is COMPLETED. */
  result: WordDuelResultView | null;
  /** Populated once status is COMPLETED — Word Duel has no in-play streak container, so this surfaces on the result view instead of live. null before COMPLETED or when no milestone was hit. */
  streakReaction: AliDisplayMessage | null;
  /** Populated once status is COMPLETED — a "while your match ran..." recap of any Level-up/Journey/Mastery/Achievement reaction. Always [] before COMPLETED. */
  deferredAliReactions: AliDisplayMessage[];
}

export interface WordDuelAnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  xpAwarded: number;
  currentStreak: number;
  longestStreak: number;
  state: WordDuelStateView;
  /** A short, zero-cost ALI reaction to this specific answer (task #100). Word Duel has no per-word timeout, so this is never null. */
  aliQuickReaction: string;
  /** The visual pairing for aliQuickReaction — rendered by components/AliCharacter.tsx. */
  aliQuickExpression: AliExpressionCue;
}

/** Joins matchmaking: resumes an in-progress match if this player
 * already has one, claims a waiting opponent's match if one is
 * available, or starts a fresh WAITING match otherwise. Call this once
 * to enter the queue/match; poll `getWordDuelState` afterward to watch
 * it progress. */
export function joinWordDuelQueue(accessToken: string): Promise<WordDuelStateView> {
  return apiRequest<WordDuelStateView>('/arcade/word-duel/join', {
    method: 'POST',
    accessToken,
  });
}

/** Refreshes the live view of a match — what a polling client calls on
 * a short interval to pick up the opponent joining, clues revealing
 * over time, and the match ending. No REST push/socket exists yet
 * (REST + client polling was the deliberate, Barth-approved transport
 * choice for now — see WordDuelService's own doc comment). */
export function getWordDuelState(accessToken: string, matchId: string): Promise<WordDuelStateView> {
  return apiRequest<WordDuelStateView>(`/arcade/word-duel/${matchId}`, { accessToken });
}

export function submitWordDuelAnswer(
  accessToken: string,
  matchId: string,
  answer: string,
): Promise<WordDuelAnswerResult> {
  return apiRequest<WordDuelAnswerResult>(`/arcade/word-duel/${matchId}/answer`, {
    method: 'POST',
    body: { answer },
    accessToken,
  });
}
