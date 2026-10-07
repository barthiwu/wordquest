import { apiRequest } from './apiClient';
import type { AuthResult } from './auth';
import type { VersusGame } from './arcadeVersus';

/** The games that have a Group Play mode (Word Duel is a live 1v1 duel). */
export type GroupGame = VersusGame;
export type GroupStatus = 'LOBBY' | 'ACTIVE' | 'ENDED';
export type GroupMemberState = 'NOT_STARTED' | 'PLAYING' | 'FINISHED';

/** Most players one group holds (the server enforces it). */
export const GROUP_MAX_MEMBERS = 50;
/** Round lengths the host can choose, in minutes. */
export const GROUP_WINDOW_CHOICES = [15, 30, 60, 120] as const;
export const GROUP_DEFAULT_WINDOW_MINUTES = 60;
/** An invite link stops working this long after the group is created (backend LINK_TTL_HOURS). */
export const GROUP_LINK_HOURS = 48;
/** Length of the secret in an invite link (backend ARCADE_GROUP_CONFIG.CODE_LENGTH). */
export const GROUP_CODE_LENGTH = 10;

export interface GroupMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  isHost: boolean;
  isMe: boolean;
  state: GroupMemberState;
  /** Null when the host has turned the leaderboard off and this is not you. */
  rank: number | null;
  correct: number | null;
  answered: number | null;
  timeMs: number | null;
}

export interface GroupWordStat {
  wordIndex: number;
  wordId: string;
  word: string;
  definition: string;
  attempts: number;
  correct: number;
}

export interface ArcadeGroup {
  id: string;
  code: string;
  game: GroupGame;
  status: GroupStatus;
  title: string | null;
  isHost: boolean;
  maxMembers: number;
  memberCount: number;
  showLeaderboard: boolean;
  /** false = only people with an account can join. */
  allowGuests: boolean;
  /** When the invite link stops working for new people. */
  linkExpiresAt: string;
  windowMinutes: number;
  wordsTotal: number | null;
  expiresAt: string;
  activatedAt: string | null;
  endedAt: string | null;
  me: GroupMember | null;
  members: GroupMember[];
  /** Host only, once the round has ended. */
  wordBreakdown: GroupWordStat[] | null;
}

export interface GroupPreview {
  code: string;
  game: GroupGame;
  title: string | null;
  hostUsername: string;
  status: GroupStatus;
  memberCount: number;
  maxMembers: number;
  full: boolean;
  /** false = the host only lets people with an account join. */
  allowGuests: boolean;
}

export interface GroupSummary {
  id: string;
  code: string | null;
  game: GroupGame;
  status: GroupStatus;
  title: string | null;
  isHost: boolean;
  memberCount: number;
  createdAt: string;
  endedAt: string | null;
}

/**
 * The web address that opens a group's join screen. Private by design: the
 * code in it is the only way in, so it is shared like a password-protected
 * door key, not published.
 */
export const GROUP_LINK_BASE = 'https://barthiwu.github.io/wordquest';

export function groupShareUrl(code: string, base: string = GROUP_LINK_BASE): string {
  return `${base}/g/${code}`;
}

/**
 * Pulls a group code out of whatever a person pasted: the bare code, a code
 * with spaces or dashes, or the whole link. Returns null when it cannot be
 * a code. Case is normalised; characters the server never issues are
 * rejected here too, so a typo is caught before a round trip.
 */
export function extractGroupCode(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromLink = /\/g\/([^/?#\s]+)/i.exec(text);
  const raw = (fromLink ? fromLink[1] : text).toUpperCase().replace(/[\s-]/g, '');
  return new RegExp(`^[A-HJKMNP-Z2-9]{${GROUP_CODE_LENGTH}}$`).test(raw) ? raw : null;
}

/** "ABCDE FGHJK": the code in the halves people can read out loud. */
export function formatGroupCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

export function createGroup(
  accessToken: string,
  input: { game: GroupGame; title?: string; showLeaderboard?: boolean; allowGuests?: boolean },
): Promise<ArcadeGroup> {
  return apiRequest<ArcadeGroup>('/arcade/groups', {
    method: 'POST',
    body: input,
    accessToken,
  });
}

export function previewGroup(accessToken: string, code: string): Promise<GroupPreview> {
  return apiRequest<GroupPreview>(`/arcade/groups/preview/${encodeURIComponent(code)}`, {
    accessToken,
  });
}

/** What a group link shows to someone who is not signed in. */
export function previewGroupPublic(code: string): Promise<GroupPreview> {
  return apiRequest<GroupPreview>(`/arcade/guest-join/preview/${encodeURIComponent(code)}`);
}

export interface GuestJoinResult extends AuthResult {
  group: ArcadeGroup;
}

/** Joins a group with just a nickname (no account). Returns a guest session. */
export function joinGroupAsGuest(code: string, nickname: string): Promise<GuestJoinResult> {
  return apiRequest<GuestJoinResult>('/arcade/guest-join', {
    method: 'POST',
    body: { code, nickname, ageConfirmed: true },
  });
}

export function joinGroup(accessToken: string, code: string): Promise<ArcadeGroup> {
  return apiRequest<ArcadeGroup>('/arcade/groups/join', {
    method: 'POST',
    body: { code },
    accessToken,
  });
}

export function getGroup(accessToken: string, groupId: string): Promise<ArcadeGroup> {
  return apiRequest<ArcadeGroup>(`/arcade/groups/${groupId}`, { accessToken });
}

export function listMyGroups(accessToken: string): Promise<GroupSummary[]> {
  return apiRequest<GroupSummary[]>('/arcade/groups/mine', { accessToken });
}

export function startGroupRound(
  accessToken: string,
  groupId: string,
  windowMinutes?: number,
): Promise<ArcadeGroup> {
  return apiRequest<ArcadeGroup>(`/arcade/groups/${groupId}/start`, {
    method: 'POST',
    body: windowMinutes ? { windowMinutes } : {},
    accessToken,
  });
}

export function endGroup(accessToken: string, groupId: string): Promise<ArcadeGroup> {
  return apiRequest<ArcadeGroup>(`/arcade/groups/${groupId}/end`, {
    method: 'POST',
    accessToken,
  });
}

export function leaveGroup(accessToken: string, groupId: string): Promise<void> {
  return apiRequest<void>(`/arcade/groups/${groupId}/leave`, {
    method: 'POST',
    accessToken,
  });
}

export function removeGroupMember(
  accessToken: string,
  groupId: string,
  userId: string,
): Promise<ArcadeGroup> {
  return apiRequest<ArcadeGroup>(`/arcade/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
    accessToken,
  });
}
