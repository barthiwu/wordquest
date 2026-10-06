import { apiRequest } from './apiClient';
import type { ArcadePlayNotice } from './arcadePlays';
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

/** One of this player's current word's five clues, in fixed reveal
 * order (2026-09-30 spec, Barth: "This makes it more like a game, and
 * less like an exam hall" — supersedes the 2026-09-29 synonym+hint
 * two-clue design):
 *   1. CATEGORY   — the word's category (e.g. "Nature").
 *   2. SYNONYM    — the word's first recorded synonym.
 *   3. FIRST_LAST — reveals the word's first and last letter (see
 *      `displayHint`); `text` is always null.
 *   4. EXAMPLE    — the word's own example sentence, with the target
 *      word blanked out.
 *   5. LETTERS    — reveals ~60% of the word's letters (always
 *      including the two FIRST_LAST already revealed) — see
 *      `displayHint`; `text` is always null.
 * `text` is otherwise null when this word has no data for that clue
 * type — e.g. no synonym or category recorded. */
export interface WordDuelClueView {
  type: 'CATEGORY' | 'SYNONYM' | 'FIRST_LAST' | 'EXAMPLE' | 'LETTERS';
  text: string | null;
}

/** A letter-by-letter display of this player's current word — spaces
 * between positions, revealed letters uppercase, hidden ones `_`. Clues
 * are player-triggered via `revealWordDuelClue` (a real "Clues" button,
 * 2026-09-29), same on-demand shape as ScrambleQuest's hint button —
 * `displayHint` only reveals letters once the 2nd/last (HINT) clue has
 * actually been tapped. */
export interface WordDuelCurrentWordView {
  /** The word's dictionary meaning — always shown, never gated behind a clue. */
  meaning: string;
  /** The word's letter count — always shown alongside `meaning`, same
   * "shown when a new word drops" treatment (2026-09-30 spec). */
  wordLength: number;
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
  /** Only on the response that started a new play: today's standing, and the 50/70/90/100 percent milestone it crossed. */
  playLimit?: ArcadePlayNotice;
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
  /** In-game chat messages newer than the `chatAfter` cursor the poll sent. Only present on getWordDuelState calls that passed a cursor. */
  chat?: WordDuelChatMessage[];
}

/** One in-game chat message (backend WordDuelChatMessageView). `seq` is the polling cursor. */
export interface WordDuelChatMessage {
  id: string;
  seq: number;
  senderId: string;
  /** True when this player wrote it. */
  mine: boolean;
  body: string;
  createdAt: string;
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
export function getWordDuelState(
  accessToken: string,
  matchId: string,
  /** When set, the response also carries chat messages with seq above this (pass 0 for the first call). */
  chatAfter?: number,
): Promise<WordDuelStateView> {
  const query = chatAfter === undefined ? '' : `?chatAfter=${chatAfter}`;
  return apiRequest<WordDuelStateView>(`/arcade/word-duel/${matchId}${query}`, { accessToken });
}

/** Sends a chat message to the opponent. The server rejects links, contact details, bad language and spam with a message that is safe to show the player. */
export function sendWordDuelMessage(
  accessToken: string,
  matchId: string,
  body: string,
): Promise<WordDuelChatMessage> {
  return apiRequest<WordDuelChatMessage>(`/arcade/word-duel/${matchId}/chat`, {
    method: 'POST',
    body: { body },
    accessToken,
  });
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

/** Cancels the opponent search: closes this player's WAITING match (no-op once it's ACTIVE). */
export function leaveWordDuelQueue(accessToken: string, matchId: string): Promise<{ left: boolean }> {
  return apiRequest<{ left: boolean }>(`/arcade/word-duel/${matchId}/leave`, {
    method: 'POST',
    accessToken,
  });
}

/** What a challenged friend sees before deciding (backend WordDuelInviteView). */
export interface WordDuelInviteView {
  matchId: string;
  /** OPEN = can be accepted; ACCEPTED = already joined; CLOSED = expired,
   * declined, cancelled or taken. */
  status: 'OPEN' | 'ACCEPTED' | 'CLOSED';
  from: { userId: string; username: string; avatarUrl: string | null } | null;
  expiresAt: string;
}

/** Challenges a friend to a live Word Duel. Returns the WAITING match the
 * host sits on while the friend decides (same shape as joinWordDuelQueue). */
export function inviteWordDuelFriend(
  accessToken: string,
  friendId: string,
): Promise<WordDuelStateView> {
  return apiRequest<WordDuelStateView>('/arcade/word-duel/invite', {
    method: 'POST',
    body: { friendId },
    accessToken,
  });
}

export function getWordDuelInvite(
  accessToken: string,
  matchId: string,
): Promise<WordDuelInviteView> {
  return apiRequest<WordDuelInviteView>(`/arcade/word-duel/${matchId}/invite`, { accessToken });
}

export function acceptWordDuelInvite(
  accessToken: string,
  matchId: string,
): Promise<WordDuelStateView> {
  return apiRequest<WordDuelStateView>(`/arcade/word-duel/${matchId}/accept`, {
    method: 'POST',
    accessToken,
  });
}

export function declineWordDuelInvite(
  accessToken: string,
  matchId: string,
): Promise<{ declined: boolean }> {
  return apiRequest<{ declined: boolean }>(`/arcade/word-duel/${matchId}/decline`, {
    method: 'POST',
    accessToken,
  });
}
