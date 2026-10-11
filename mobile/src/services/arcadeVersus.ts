import { apiRequest } from './apiClient';
import type { FriendPublicView } from './friends';
import type { ChatInput, ChatMessage } from './quickChat';

/** The games that have a head-to-head mode. Word Duel is its own,
 * real-time, multiplayer-only game. */
export type VersusGame = 'SCRAMBLE_QUEST' | 'COMPLETE_IT' | 'HANGMAN';

/** Every Arcade game a friend can be challenged to. Word Duel is a live
 * duel with its own challenge flow; the rest are head-to-head matches. */
export type ChallengeGame = VersusGame | 'WORD_DUEL';

export type VersusKind = 'RANDOM' | 'FRIEND';
export type VersusStatus =
  'SEARCHING' | 'INVITED' | 'ACTIVE' | 'COMPLETED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';

export interface VersusProgress {
  answered: number;
  finished: boolean;
}

export interface VersusResult {
  outcome: 'WIN' | 'LOSS' | 'DRAW' | 'NO_CONTEST';
  /** FORFEIT = someone left or ran out of time. */
  reason: 'WIN' | 'DRAW' | 'FORFEIT' | 'NO_CONTEST';
  myCorrect: number;
  theirCorrect: number;
  myTimeMs: number;
  theirTimeMs: number;
  bonusXp: number;
}

export interface VersusMatch {
  id: string;
  game: VersusGame | 'WORD_DUEL';
  kind: VersusKind;
  status: VersusStatus;
  /** True when the viewer is the one being challenged. */
  incoming: boolean;
  opponent: FriendPublicView | null;
  expiresAt: string;
  wordsTotal: number | null;
  me: VersusProgress;
  opponentProgress: VersusProgress;
  result: VersusResult | null;
}

export interface VersusMine {
  incoming: VersusMatch[];
  outgoing: VersusMatch[];
  active: VersusMatch[];
  recent: VersusMatch[];
}

/** The stack route each game lives at. */
export const VERSUS_GAME_ROUTE = {
  SCRAMBLE_QUEST: 'ScrambleQuest',
  COMPLETE_IT: 'CompleteIt',
  HANGMAN: 'Hangman',
} as const;

export function isVersusGame(game: string): game is VersusGame {
  return game in VERSUS_GAME_ROUTE;
}

/** Joins the random queue (or returns the search/match already in progress). */
export function queueVersus(accessToken: string, game: VersusGame): Promise<VersusMatch> {
  return apiRequest<VersusMatch>('/arcade/versus/queue', {
    method: 'POST',
    body: { game },
    accessToken,
  });
}

/** Challenges a friend (friends only; the server checks). */
export function inviteFriendToVersus(
  accessToken: string,
  friendId: string,
  game: VersusGame,
): Promise<VersusMatch> {
  return apiRequest<VersusMatch>('/arcade/versus/invite', {
    method: 'POST',
    body: { friendId, game },
    accessToken,
  });
}

export function getVersusMatch(accessToken: string, matchId: string): Promise<VersusMatch> {
  return apiRequest<VersusMatch>(`/arcade/versus/${matchId}`, { accessToken });
}

export function listMyVersus(accessToken: string): Promise<VersusMine> {
  return apiRequest<VersusMine>('/arcade/versus/mine', { accessToken });
}

export function respondToVersus(
  accessToken: string,
  matchId: string,
  accept: boolean,
): Promise<VersusMatch> {
  return apiRequest<VersusMatch>(`/arcade/versus/${matchId}/respond`, {
    method: 'POST',
    body: { accept },
    accessToken,
  });
}

export function cancelVersus(accessToken: string, matchId: string): Promise<VersusMatch> {
  return apiRequest<VersusMatch>(`/arcade/versus/${matchId}/cancel`, {
    method: 'POST',
    accessToken,
  });
}

/** The chat for a head-to-head challenge, plus what this player may send right now. */
export interface VersusChatList {
  messages: ChatMessage[];
  /** Quick (emoji) chat is open. */
  canQuick: boolean;
  /** Typed chat is open (friends only). */
  canType: boolean;
}

/** Messages after the `after` cursor (pass 0 the first time). */
export function getVersusChat(
  accessToken: string,
  matchId: string,
  after: number,
): Promise<VersusChatList> {
  return apiRequest<VersusChatList>(`/arcade/versus/${matchId}/chat?after=${after}`, {
    accessToken,
  });
}

/** Sends typed text or a quick-chat code to the opponent. The server filters links, contact details and bad language and returns a message safe to show. */
export function sendVersusChat(
  accessToken: string,
  matchId: string,
  input: ChatInput,
): Promise<ChatMessage> {
  return apiRequest<ChatMessage>(`/arcade/versus/${matchId}/chat`, {
    method: 'POST',
    body: input,
    accessToken,
  });
}
