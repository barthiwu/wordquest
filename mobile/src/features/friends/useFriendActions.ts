import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/state/authStore';
import { ApiError } from '@/services/apiClient';
import { confirmAction, notify } from '@/utils/dialogs';
import {
  acceptFriendRequest,
  blockPlayer,
  declineFriendRequest,
  sendFriendRequest,
  unblockPlayer,
  unfriend as unfriendRequest,
} from '@/services/friends';

/**
 * Shared friend-action logic — block/unfriend confirmation, add-friend
 * feedback, and accept/decline, all in one place so the avatar-tap
 * popup (AvatarActionMenu) and the Public Profile screen never
 * duplicate this (2026-09, Barth: "don't duplicate the block-
 * confirmation logic"). Every action returns a boolean success flag
 * (or null when the player cancelled a confirmation) so a caller can
 * update its own local state (e.g. optimistic relationship) without
 * this hook needing to know about any particular screen's state shape.
 */
export function useFriendActions() {
  const { t } = useTranslation(['friends', 'common']);
  const accessToken = useAuthStore((s) => s.accessToken);

  function confirm(title: string, message: string, confirmLabel: string): Promise<boolean> {
    return confirmAction(title, message, confirmLabel, t('common:cancel'));
  }

  function reportError(title: string, err: unknown) {
    notify(title, err instanceof ApiError ? err.message : t('common:errorGeneric'));
  }

  /** Sends a friend request by username and surfaces the result — a
   * fresh pending request, or an immediate "Friends" state when the
   * other player had already requested the viewer (see
   * SendFriendRequestResult). Never fires silently. */
  async function addFriend(username: string): Promise<'sent' | 'friends' | null> {
    if (!accessToken) return null;
    try {
      const result = await sendFriendRequest(accessToken, username);
      if ('accepted' in result) {
        notify(
          t('friends:popup.nowFriendsTitle'),
          t('friends:popup.nowFriendsMessage', { username }),
        );
        return 'friends';
      }
      notify(
        t('friends:popup.addFriendSentTitle'),
        t('friends:popup.addFriendSentMessage', { username }),
      );
      return 'sent';
    } catch (err) {
      reportError(t('friends:popup.addFriendErrorTitle'), err);
      return null;
    }
  }

  /** Blocking is a real, consequential, hard-to-undo-cleanly action
   * (removes any existing friendship both ways, hides the player from
   * search, blocks Word Duel matchmaking) — always confirmed first,
   * matching this app's own destructive-action convention (see
   * AboutScreen's delete-account confirmation). */
  async function confirmAndBlock(userId: string, username: string): Promise<boolean> {
    if (!accessToken) return false;
    const confirmed = await confirm(
      t('friends:popup.blockConfirmTitle', { username }),
      t('friends:popup.blockConfirmMessage'),
      t('friends:popup.blockConfirmBlock'),
    );
    if (!confirmed) return false;
    try {
      await blockPlayer(accessToken, userId);
      return true;
    } catch (err) {
      reportError(t('friends:popup.blockErrorTitle'), err);
      return false;
    }
  }

  async function unblock(userId: string): Promise<boolean> {
    if (!accessToken) return false;
    try {
      await unblockPlayer(accessToken, userId);
      return true;
    } catch (err) {
      reportError(t('friends:profile.unblockErrorTitle'), err);
      return false;
    }
  }

  async function confirmAndUnfriend(userId: string, username: string): Promise<boolean> {
    if (!accessToken) return false;
    const confirmed = await confirm(
      t('friends:profile.unfriendConfirmTitle', { username }),
      t('friends:profile.unfriendConfirmMessage'),
      t('friends:profile.unfriendConfirmUnfriend'),
    );
    if (!confirmed) return false;
    try {
      await unfriendRequest(accessToken, userId);
      return true;
    } catch (err) {
      reportError(t('friends:profile.unfriendErrorTitle'), err);
      return false;
    }
  }

  async function accept(requestId: string): Promise<boolean> {
    if (!accessToken) return false;
    try {
      await acceptFriendRequest(accessToken, requestId);
      return true;
    } catch (err) {
      reportError(t('friends:list.acceptErrorTitle'), err);
      return false;
    }
  }

  async function decline(requestId: string): Promise<boolean> {
    if (!accessToken) return false;
    try {
      await declineFriendRequest(accessToken, requestId);
      return true;
    } catch (err) {
      reportError(t('friends:list.declineErrorTitle'), err);
      return false;
    }
  }

  return { addFriend, confirmAndBlock, unblock, confirmAndUnfriend, accept, decline };
}
