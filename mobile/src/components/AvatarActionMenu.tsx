import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { AvatarBubble } from './AvatarBubble';
import { getPublicProfile, type FriendRelationship } from '@/services/friends';
import { useFriendActions } from '@/features/friends/useFriendActions';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  avatarUrl?: string | null;
  /** Pass when already known (e.g. the caller already has a
   * PublicProfileView) to skip a redundant GET /friends/profile/:userId
   * fetch. Left undefined, the menu fetches it itself on open. */
  relationship?: FriendRelationship;
  /** Wires to whatever navigation the caller has — kept navigation-
   * agnostic here so this menu can open from a leaderboard row, a Word
   * Duel result, or anywhere else an avatar is tappable. */
  onOpenProfile: (userId: string) => void;
}

/**
 * Avatar-tap popup — Profile / Add Friend / Block (2026-09, Barth).
 * A small centered Modal rather than a bottom sheet: no bottom-sheet
 * primitive exists yet in src/components (checked), and three rows is
 * simple enough not to justify building one from scratch for this.
 */
export function AvatarActionMenu({
  visible,
  onClose,
  userId,
  username,
  avatarUrl,
  relationship: relationshipProp,
  onOpenProfile,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation(['friends', 'common']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { addFriend, confirmAndBlock, unblock } = useFriendActions();

  const [relationship, setRelationship] = useState<FriendRelationship | null>(
    relationshipProp ?? null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (relationshipProp) {
      setRelationship(relationshipProp);
      return;
    }
    if (!accessToken) return;
    let cancelled = false;
    setRelationship(null);
    getPublicProfile(accessToken, userId)
      .then((profile) => {
        if (!cancelled) setRelationship(profile.relationship);
      })
      .catch(() => {
        if (!cancelled) setRelationship('NONE');
      });
    return () => {
      cancelled = true;
    };
  }, [visible, relationshipProp, accessToken, userId]);

  const openProfile = () => {
    onClose();
    onOpenProfile(userId);
  };

  const onAddFriend = async () => {
    setBusy(true);
    const result = await addFriend(username);
    setBusy(false);
    if (result === 'sent') setRelationship('REQUEST_SENT');
    else if (result === 'friends') setRelationship('FRIENDS');
    if (result) onClose();
  };

  const onBlock = async () => {
    setBusy(true);
    const blocked = await confirmAndBlock(userId, username);
    setBusy(false);
    if (blocked) {
      setRelationship('BLOCKED');
      onClose();
    }
  };

  const onUnblock = async () => {
    setBusy(true);
    const unblocked = await unblock(userId);
    setBusy(false);
    if (unblocked) {
      setRelationship('NONE');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common:close')}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <AvatarBubble colors={colors} avatarUrl={avatarUrl} username={username} size={44} />
            <Text style={styles.username} numberOfLines={1}>
              {username}
            </Text>
          </View>

          {relationship === null ? (
            <ActivityIndicator color={colors.arcaneSoft} style={styles.loading} />
          ) : (
            <View style={styles.rows}>
              <Pressable
                style={styles.row}
                onPress={openProfile}
                accessibilityRole="button"
                accessibilityLabel={t('friends:popup.profile')}
              >
                <Text style={styles.rowText}>{t('friends:popup.profile')}</Text>
              </Pressable>

              {relationship !== 'SELF' && relationship !== 'BLOCKED' && (
                <View style={styles.row}>
                  {relationship === 'NONE' && (
                    <Pressable
                      onPress={onAddFriend}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={t('friends:popup.addFriend')}
                      style={styles.rowPressableFill}
                    >
                      <Text style={styles.rowText}>{t('friends:popup.addFriend')}</Text>
                    </Pressable>
                  )}
                  {relationship === 'REQUEST_SENT' && (
                    <Text style={styles.rowTextMuted}>{t('friends:popup.requestSent')}</Text>
                  )}
                  {relationship === 'FRIENDS' && (
                    <Text style={styles.rowTextMuted}>{t('friends:popup.friends')}</Text>
                  )}
                  {relationship === 'REQUEST_RECEIVED' && (
                    <Pressable
                      onPress={openProfile}
                      accessibilityRole="button"
                      accessibilityLabel={t('friends:popup.respondToRequest')}
                      style={styles.rowPressableFill}
                    >
                      <Text style={styles.rowText}>{t('friends:popup.respondToRequest')}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {relationship !== 'SELF' && (
                <Pressable
                  style={styles.row}
                  onPress={relationship === 'BLOCKED' ? onUnblock : onBlock}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={
                    relationship === 'BLOCKED'
                      ? t('friends:popup.unblock')
                      : t('friends:popup.block')
                  }
                >
                  <Text style={styles.rowTextDanger}>
                    {relationship === 'BLOCKED'
                      ? t('friends:popup.unblock')
                      : t('friends:popup.block')}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <Pressable
            style={styles.cancelRow}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common:cancel')}
          >
            <Text style={styles.cancelText}>{t('common:cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    username: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: typography.display.weight,
      flexShrink: 1,
    },
    loading: { paddingVertical: spacing.lg },
    rows: { gap: spacing.xs },
    row: {
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowPressableFill: { width: '100%' },
    rowText: { color: colors.ink, fontSize: typography.scale.md },
    rowTextMuted: { color: colors.inkMuted, fontSize: typography.scale.md },
    rowTextDanger: { color: colors.danger, fontSize: typography.scale.md },
    cancelRow: { alignItems: 'center', paddingTop: spacing.xs },
    cancelText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
