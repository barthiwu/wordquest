import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { AvatarBubble } from '@/components/AvatarBubble';
import { getFriendRequests, getPublicProfile, type PublicProfileView } from '@/services/friends';
import { useFriendActions } from './useFriendActions';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicProfile'>;

/**
 * A player's public profile — reached from the avatar-tap popup's
 * "Profile" option, or by tapping a friend/request row in the Friends
 * screen (2026-09, Barth). Deliberately the same narrow field set
 * FriendsService.getProfile returns (username, never email/
 * displayName/dateOfBirth — see PublicProfileView's own doc comment).
 */
export function PublicProfileScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['friends', 'common']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { addFriend, confirmAndBlock, unblock, confirmAndUnfriend, accept, decline } =
    useFriendActions();

  const [profile, setProfile] = useState<PublicProfileView | null>(null);
  // Only populated while relationship is REQUEST_RECEIVED -- accept/
  // decline are keyed by the Friendship row's own id, which
  // PublicProfileView doesn't carry, so it's resolved separately from
  // GET /friends/requests (matched by the other player's userId).
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    setError(null);
    getPublicProfile(accessToken, userId)
      .then((view) => {
        setProfile(view);
        if (view.relationship !== 'REQUEST_RECEIVED') {
          setIncomingRequestId(null);
          return;
        }
        return getFriendRequests(accessToken).then((requests) => {
          const match = requests.incoming.find((r) => r.user.userId === userId);
          setIncomingRequestId(match?.id ?? null);
        });
      })
      .catch(() => setError(t('friends:profile.genericError')));
  }, [accessToken, userId, t]);

  useFocusEffect(load);

  const refresh = () => {
    setProfile(null);
    load();
  };

  const onAddFriend = async () => {
    if (!profile) return;
    setBusy(true);
    const result = await addFriend(profile.username);
    setBusy(false);
    if (result) refresh();
  };

  const onUnfriend = async () => {
    if (!profile) return;
    setBusy(true);
    const ok = await confirmAndUnfriend(profile.userId, profile.username);
    setBusy(false);
    if (ok) refresh();
  };

  const onBlock = async () => {
    if (!profile) return;
    setBusy(true);
    const ok = await confirmAndBlock(profile.userId, profile.username);
    setBusy(false);
    if (ok) refresh();
  };

  const onUnblock = async () => {
    if (!profile) return;
    setBusy(true);
    const ok = await unblock(profile.userId);
    setBusy(false);
    if (ok) refresh();
  };

  const onAccept = async () => {
    if (!incomingRequestId) return;
    setBusy(true);
    const ok = await accept(incomingRequestId);
    setBusy(false);
    if (ok) refresh();
  };

  const onDecline = async () => {
    if (!incomingRequestId) return;
    setBusy(true);
    const ok = await decline(incomingRequestId);
    setBusy(false);
    if (ok) refresh();
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />

      <View style={styles.identity}>
        <AvatarBubble
          colors={colors}
          avatarUrl={profile.avatarUrl}
          username={profile.username}
          size={84}
        />
        <Text style={styles.username}>{profile.username}</Text>
        {profile.relationship === 'SELF' && (
          <Text style={styles.youBadge}>{t('friends:profile.youLabel')}</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.level}</Text>
          <Text style={styles.statLabel}>{t('friends:profile.levelStatLabel')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.currentStreak}</Text>
          <Text style={styles.statLabel}>{t('friends:profile.streakStatLabel')}</Text>
        </View>
      </View>

      <View style={styles.metaRows}>
        <Text style={styles.metaLine}>
          {profile.clanName
            ? t('friends:profile.clanLabel', { clanName: profile.clanName })
            : t('friends:profile.noClan')}
        </Text>
        <Text style={styles.metaLine}>
          {t('friends:profile.joinedLabel', {
            date: new Date(profile.joinedAt).toLocaleDateString(),
          })}
        </Text>
      </View>

      {profile.relationship !== 'SELF' && (
        <View style={styles.actions}>
          {profile.relationship === 'NONE' && (
            <Pressable
              style={styles.primaryButton}
              onPress={onAddFriend}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('friends:popup.addFriend')}
            >
              <Text style={styles.primaryButtonText}>{t('friends:popup.addFriend')}</Text>
            </Pressable>
          )}

          {profile.relationship === 'REQUEST_SENT' && (
            <View style={styles.mutedPill}>
              <Text style={styles.mutedPillText}>{t('friends:popup.requestSent')}</Text>
            </View>
          )}

          {profile.relationship === 'REQUEST_RECEIVED' && (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.primaryButton}
                onPress={onAccept}
                disabled={busy || !incomingRequestId}
                accessibilityRole="button"
                accessibilityLabel={t('friends:profile.acceptRequest')}
              >
                <Text style={styles.primaryButtonText}>{t('friends:profile.acceptRequest')}</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={onDecline}
                disabled={busy || !incomingRequestId}
                accessibilityRole="button"
                accessibilityLabel={t('friends:profile.declineRequest')}
              >
                <Text style={styles.secondaryButtonText}>
                  {t('friends:profile.declineRequest')}
                </Text>
              </Pressable>
            </View>
          )}

          {profile.relationship === 'FRIENDS' && (
            <Pressable
              style={styles.secondaryButton}
              onPress={onUnfriend}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('friends:profile.unfriend')}
            >
              <Text style={styles.secondaryButtonText}>{t('friends:profile.unfriend')}</Text>
            </Pressable>
          )}

          <Pressable
            style={styles.dangerButton}
            onPress={profile.relationship === 'BLOCKED' ? onUnblock : onBlock}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={
              profile.relationship === 'BLOCKED'
                ? t('friends:popup.unblock')
                : t('friends:popup.block')
            }
          >
            <Text style={styles.dangerButtonText}>
              {profile.relationship === 'BLOCKED'
                ? t('friends:popup.unblock')
                : t('friends:popup.block')}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.lg },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    error: { color: colors.danger, fontSize: typography.scale.md },
    identity: { alignItems: 'center', gap: spacing.sm },
    username: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    youBadge: { color: colors.inkMuted, fontSize: typography.scale.xs },
    statsRow: { flexDirection: 'row', gap: spacing.sm },
    statCard: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
    },
    statValue: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    statLabel: { color: colors.inkMuted, fontSize: typography.scale.xs, marginTop: 2 },
    metaRows: { gap: spacing.xs },
    metaLine: { color: colors.inkMuted, fontSize: typography.scale.sm },
    actions: { gap: spacing.sm, marginTop: spacing.sm },
    actionRow: { flexDirection: 'row', gap: spacing.sm },
    primaryButton: {
      flex: 1,
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    primaryButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    secondaryButton: {
      flex: 1,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
    dangerButton: {
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.danger,
    },
    dangerButtonText: { color: colors.danger, fontSize: typography.scale.md, fontWeight: '700' },
    mutedPill: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    mutedPillText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
