import { apiRequest } from './apiClient';

/** Client-safe view of another player — never email/displayName/dateOfBirth,
 * matching the backend's own FriendPublicView (username is the only
 * identity other players see). */
export interface FriendPublicView {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface FriendRequestView {
  id: string;
  user: FriendPublicView;
  createdAt: string;
}

export interface FriendRequestsView {
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

/** How the viewer relates to the profile they're looking at — drives which
 * action(s) the avatar-tap popup (Profile / Add Friend / Block) and the
 * Public Profile screen offer. */
export type FriendRelationship =
  'SELF' | 'FRIENDS' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'BLOCKED' | 'NONE';

/** Public profile view for the avatar-tap "Profile" popup option and the
 * Public Profile screen. */
export interface PublicProfileView {
  userId: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  currentStreak: number;
  clanName: string | null;
  joinedAt: string;
  relationship: FriendRelationship;
}

/** Sending a friend request auto-accepts instead of creating a redundant
 * pending row when the addressee already requested the viewer — the
 * response shape reflects which of those two things happened. */
export type SendFriendRequestResult = FriendRequestView | { accepted: true };

/** A player's full public profile — backs the avatar-tap "Profile" popup
 * option and the Public Profile screen. */
export function getPublicProfile(accessToken: string, userId: string): Promise<PublicProfileView> {
  return apiRequest<PublicProfileView>(`/friends/profile/${encodeURIComponent(userId)}`, {
    accessToken,
  });
}

/** Exact (case-sensitive) username lookup — never a partial/fuzzy match.
 * Returns null (via the backend) for self, a nonexistent username, or a
 * player blocked either way with the viewer. */
export function searchByUsername(
  accessToken: string,
  username: string,
): Promise<FriendPublicView | null> {
  return apiRequest<FriendPublicView | null>(
    `/friends/search?username=${encodeURIComponent(username)}`,
    { accessToken },
  );
}

/** The viewer's accepted friends. */
export function getFriends(accessToken: string): Promise<FriendPublicView[]> {
  return apiRequest<FriendPublicView[]>('/friends', { accessToken });
}

/** Incoming (received) and outgoing (sent) pending friend requests. */
export function getFriendRequests(accessToken: string): Promise<FriendRequestsView> {
  return apiRequest<FriendRequestsView>('/friends/requests', { accessToken });
}

/** Sends a friend request by username — auto-accepts if the addressee
 * already sent one to the viewer (see SendFriendRequestResult). */
export function sendFriendRequest(
  accessToken: string,
  username: string,
): Promise<SendFriendRequestResult> {
  return apiRequest<SendFriendRequestResult>('/friends/requests', {
    method: 'POST',
    body: { username },
    accessToken,
  });
}

export function acceptFriendRequest(accessToken: string, requestId: string): Promise<void> {
  return apiRequest<void>(`/friends/requests/${encodeURIComponent(requestId)}/accept`, {
    method: 'POST',
    accessToken,
  });
}

/** The sender withdrawing a request that is still pending. */
export function cancelFriendRequest(accessToken: string, requestId: string): Promise<void> {
  return apiRequest<void>(`/friends/requests/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
    accessToken,
  });
}

export function declineFriendRequest(accessToken: string, requestId: string): Promise<void> {
  return apiRequest<void>(`/friends/requests/${encodeURIComponent(requestId)}/decline`, {
    method: 'POST',
    accessToken,
  });
}

/** Unfriends an existing accepted friend. */
export function unfriend(accessToken: string, userId: string): Promise<void> {
  return apiRequest<void>(`/friends/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    accessToken,
  });
}

/** Full, mutual block — removes any existing friendship both ways, hides
 * the blocked player from search, and blocks Word Duel matchmaking. A
 * real, consequential, hard-to-undo-cleanly action — callers should
 * confirm with the player before calling this (see useBlockConfirmation). */
export function blockPlayer(accessToken: string, userId: string): Promise<void> {
  return apiRequest<void>(`/friends/${encodeURIComponent(userId)}/block`, {
    method: 'POST',
    accessToken,
  });
}

export function unblockPlayer(accessToken: string, userId: string): Promise<void> {
  return apiRequest<void>(`/friends/${encodeURIComponent(userId)}/unblock`, {
    method: 'POST',
    accessToken,
  });
}
