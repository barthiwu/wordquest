import { apiRequest } from './apiClient';
import type { AliExpressionCue, AliDisplayMessage } from './aliExpression';

/** Opponent's live score only — never their current word or answers
 * (backend WordDuelOpponentView; matches the server's own "score only,
 * never their current word" comment). userId/username/avatarUrl are
 * populated as soon as an opponent has actually joined the match (ACTIVE
 * or COMPLETED) — 2026-09-29, Barth: the live scoreboard shows both
 * players' real usernames, not just after the match ends. Still absent
 * (undefined) while the match is WAITING (no opponent yet). The avatar-
 * tap "Profile / Add Friend / Block" popup still only opens from the
 * post-match result screen. */
export interface WordDuelOpponentView {
  correctCount: number;
  totalXp: number;
  userId?: string;
  username?: string;
  avatarUrl?: string | null;
}

/** One of this player's current word's three clues, in fixed reveal
 * order: synonym, then origin/etymology, then a hint that reveals ~60%
 * of the word's letters (see `displayHint` below, which is what actually
 * changes for the hint clue — its own `text` is always null). `text` is
 * null when this word has no data for that clue type — most notably
 * ORIGIN, which is always null right now: the vocabulary corpus has no
 * origin/etymology content yet (a real content gap, not a bug — see
 * WordDuelScreen for how this renders). */
export interface WordDuelClueView {
  type: 'SYNONYM' | 'ORIGIN' | 'HINT';
  text: string | null;
}

/** A letter-by-letter display of this player's current word — spaces
 * between positions, revealed letters uppercase, hidden ones `_`. Clues
 * are player-triggered via `revealWordDuelClue` (a real "Clues" button,
 * 2026-09-29), same on-demand shape as ScrambleQuest's hint button —
 * `displayHint` only reveals letters once the 3rd (HINT) clue has
 * actually been tapped. */
export interface WordDuelCurrentWordView {
  /** The word's dictionary meaning — always shown, never gated behind a clue. */
  meaning: string;
  displayHint: string;
  cluesRevealed: number;
  maxClues: number;
  /** One entry per clue revealed so far, oldest first. */
  clues: WordDuelClueView[];
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

/** Reveals this player's next clue on their current word (the "Clues"
 * button, 2026-09-29) — returns the full refreshed state, same as
 * `getWordDuelState`/`joinWordDuelQueue`, so the caller can just
 * `applyState` it directly. */
export function revealWordDuelClue(
  accessToken: string,
  matchId: string,
): Promise<WordDuelStateView> {
  return apiRequest<WordDuelStateView>(`/arcade/word-duel/${matchId}/clue`, {
    method: 'POST',
    accessToken,
  });
}
