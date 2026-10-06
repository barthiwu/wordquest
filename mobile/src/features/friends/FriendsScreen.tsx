import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { AvatarBubble } from '@/components/AvatarBubble';
import { ApiError } from '@/services/apiClient';
import {
  getFriendRequests,
  getFriends,
  searchByUsername,
  type FriendPublicView,
  type FriendRequestsView,
} from '@/services/friends';
import { useFriendActions } from './useFriendActions';
import { ChallengeGameSheet } from '@/components/ChallengeGameSheet';
import {
  listMyVersus,
  type ChallengeGame,
  type VersusMatch,
  type VersusMine,
} from '@/services/arcadeVersus';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Friends'>;

/**
 * Add-a-friend-by-username flow, plus the incoming/outgoing request
 * inbox and the player's current friends list (2026-09, Barth). Reached
 * from a "Friends" row on the Profile/Passport screen.
 */
export function FriendsScreen({ navigation, route }: Props) {
  const challengeGame = route.params?.challengeGame;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['friends', 'common', 'arcade']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { addFriend, accept, decline, cancelRequest } = useFriendActions();

  const [friends, setFriends] = useState<FriendPublicView[] | null>(null);
  const [requests, setRequests] = useState<FriendRequestsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<VersusMine | null>(null);
  const [challengeTarget, setChallengeTarget] = useState<FriendPublicView | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<FriendPublicView | null | undefined>(undefined);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    setError(null);
    Promise.all([getFriends(accessToken), getFriendRequests(accessToken)])
      .then(([friendsList, requestsView]) => {
        setFriends(friendsList);
        setRequests(requestsView);
      })
      .catch(() => setError(t('friends:list.genericError')));
    // Head-to-head challenges are secondary: a failure here never hides the list.
    listMyVersus(accessToken)
      .then(setChallenges)
      .catch(() => setChallenges(null));
  }, [accessToken, t]);

  useFocusEffect(load);

  const onSearch = async () => {
    if (!accessToken || !query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(undefined);
    try {
      const result = await searchByUsername(accessToken, query.trim());
      setSearchResult(result);
      if (!result) setSearchError(t('friends:list.searchNoResults'));
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : t('common:errorGeneric'));
      setSearchResult(undefined);
    } finally {
      setSearching(false);
    }
  };

  const onAdd = async (username: string, userId: string) => {
    setBusyUserId(userId);
    const result = await addFriend(username);
    setBusyUserId(null);
    if (result) {
      setSearchResult(null);
      setQuery('');
      load();
    }
  };

  const onAccept = async (requestId: string) => {
    setBusyUserId(requestId);
    const ok = await accept(requestId);
    setBusyUserId(null);
    if (ok) load();
  };

  const onDecline = async (requestId: string) => {
    setBusyUserId(requestId);
    const ok = await decline(requestId);
    setBusyUserId(null);
    if (ok) load();
  };

  const onCancel = async (requestId: string) => {
    setBusyUserId(requestId);
    const ok = await cancelRequest(requestId);
    setBusyUserId(null);
    if (ok) load();
  };

  const startChallenge = (friend: FriendPublicView, game: ChallengeGame) => {
    setChallengeTarget(null);
    if (game === 'WORD_DUEL') {
      navigation.navigate('WordDuel', {
        challengeFriendId: friend.userId,
        challengeFriendName: friend.username,
      });
    } else {
      navigation.navigate('ArcadeVersus', { game, friendId: friend.userId });
    }
  };

  const onChallenge = (friend: FriendPublicView) => {
    if (challengeGame) startChallenge(friend, challengeGame);
    else setChallengeTarget(friend);
  };

  const gameLabel = (game: string) =>
    t(
      game === 'SCRAMBLE_QUEST'
        ? 'arcade:scrambleQuestTitle'
        : game === 'COMPLETE_IT'
          ? 'arcade:completeItTitle'
          : game === 'HANGMAN'
            ? 'arcade:hangmanTitle'
            : 'arcade:wordDuelTitle',
    );

  const openMatch = (m: VersusMatch) => navigation.navigate('ArcadeVersus', { matchId: m.id });

  const matchRows = (
    list: VersusMatch[],
    label: (m: VersusMatch) => string,
    cta: (m: VersusMatch) => string,
  ): React.ReactNode =>
    list.map((m) => (
      <PlayerRow
        key={m.id}
        colors={colors}
        styles={styles}
        player={m.opponent ?? { userId: m.id, username: '?', avatarUrl: null }}
        onPress={() => openMatch(m)}
        trailing={
          <View style={styles.matchTrail}>
            <Text style={styles.matchLabel} numberOfLines={1}>
              {label(m)}
            </Text>
            <View style={styles.addButton}>
              <Text style={styles.addButtonText}>{cta(m)}</Text>
            </View>
          </View>
        }
      />
    ));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('friends:list.title')}</Text>

      {challengeGame && (
        <View style={styles.challengeBanner} accessibilityRole="alert">
          <Text style={styles.challengeBannerText}>
            {t('friends:challenge.pickFriend', { game: gameLabel(challengeGame) })}
          </Text>
        </View>
      )}

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('friends:list.searchPlaceholder')}
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={onSearch}
          returnKeyType="search"
          accessibilityLabel={t('friends:list.searchPlaceholder')}
        />
        <Pressable
          style={styles.searchButton}
          onPress={onSearch}
          disabled={searching || !query.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('friends:list.searchButton')}
        >
          {searching ? (
            <ActivityIndicator color={colors.ink} size="small" />
          ) : (
            <Text style={styles.searchButtonText}>{t('friends:list.searchButton')}</Text>
          )}
        </Pressable>
      </View>

      {searchError && <Text style={styles.error}>{searchError}</Text>}
      {searchResult && (
        <PlayerRow
          colors={colors}
          styles={styles}
          player={searchResult}
          onPress={() => navigation.navigate('PublicProfile', { userId: searchResult.userId })}
          trailing={
            <Pressable
              style={styles.addButton}
              onPress={() => onAdd(searchResult.username, searchResult.userId)}
              disabled={busyUserId === searchResult.userId}
              accessibilityRole="button"
              accessibilityLabel={t('friends:list.add')}
            >
              <Text style={styles.addButtonText}>{t('friends:list.add')}</Text>
            </Pressable>
          }
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {challenges && challenges.incoming.length > 0 && (
        <Section title={t('friends:challenge.incomingTitle')} styles={styles}>
          {matchRows(
            challenges.incoming,
            (m) => gameLabel(m.game),
            () => t('friends:challenge.respond'),
          )}
        </Section>
      )}

      {challenges && challenges.active.length > 0 && (
        <Section title={t('friends:challenge.activeTitle')} styles={styles}>
          {matchRows(
            challenges.active,
            (m) => gameLabel(m.game),
            (m) => (m.me.finished ? t('friends:challenge.waiting') : t('friends:challenge.play')),
          )}
        </Section>
      )}

      {challenges && challenges.outgoing.length > 0 && (
        <Section title={t('friends:challenge.sentTitle')} styles={styles}>
          {matchRows(
            challenges.outgoing,
            (m) => gameLabel(m.game),
            () => t('friends:challenge.open'),
          )}
        </Section>
      )}

      {challenges && challenges.recent.length > 0 && (
        <Section title={t('friends:challenge.recentTitle')} styles={styles}>
          {matchRows(
            challenges.recent,
            (m) =>
              m.result
                ? `${gameLabel(m.game)} · ${t(`friends:challenge.outcome.${m.result.outcome}`)}`
                : gameLabel(m.game),
            () => t('friends:challenge.open'),
          )}
        </Section>
      )}

      {requests && requests.incoming.length > 0 && (
        <Section title={t('friends:list.incomingRequestsTitle')} styles={styles}>
          {requests.incoming.map((r) => (
            <PlayerRow
              key={r.id}
              colors={colors}
              styles={styles}
              player={r.user}
              onPress={() => navigation.navigate('PublicProfile', { userId: r.user.userId })}
              trailing={
                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.acceptButton}
                    onPress={() => onAccept(r.id)}
                    disabled={busyUserId === r.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends:list.accept')}
                  >
                    <Text style={styles.acceptButtonText}>{t('friends:list.accept')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.declineButton}
                    onPress={() => onDecline(r.id)}
                    disabled={busyUserId === r.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends:list.decline')}
                  >
                    <Text style={styles.declineButtonText}>{t('friends:list.decline')}</Text>
                  </Pressable>
                </View>
              }
            />
          ))}
        </Section>
      )}

      {requests && requests.outgoing.length > 0 && (
        <Section title={t('friends:list.outgoingRequestsTitle')} styles={styles}>
          {requests.outgoing.map((r) => (
            <PlayerRow
              key={r.id}
              colors={colors}
              styles={styles}
              player={r.user}
              onPress={() => navigation.navigate('PublicProfile', { userId: r.user.userId })}
              trailing={
                <View style={styles.actionRow}>
                  <View style={styles.mutedPill}>
                    <Text style={styles.mutedPillText}>{t('friends:list.pending')}</Text>
                  </View>
                  <Pressable
                    style={styles.declineButton}
                    onPress={() => onCancel(r.id)}
                    disabled={busyUserId === r.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends:list.cancelRequest')}
                  >
                    <Text style={styles.declineButtonText}>{t('friends:list.cancelRequest')}</Text>
                  </Pressable>
                </View>
              }
            />
          ))}
        </Section>
      )}

      <Section title={t('friends:list.myFriendsTitle')} styles={styles}>
        {friends === null ? (
          <ActivityIndicator color={colors.arcaneSoft} />
        ) : friends.length === 0 ? (
          <Text style={styles.emptyText}>{t('friends:list.emptyFriends')}</Text>
        ) : (
          friends.map((f) => (
            <PlayerRow
              key={f.userId}
              colors={colors}
              styles={styles}
              player={f}
              onPress={() => navigation.navigate('PublicProfile', { userId: f.userId })}
              trailing={
                <Pressable
                  style={styles.challengeButton}
                  onPress={() => onChallenge(f)}
                  accessibilityRole="button"
                  accessibilityLabel={t('friends:challenge.button', { name: f.username })}
                >
                  <Text style={styles.challengeButtonText}>{t('friends:challenge.cta')}</Text>
                </Pressable>
              }
            />
          ))
        )}
      </Section>

      <ChallengeGameSheet
        friendName={challengeTarget?.username ?? null}
        onClose={() => setChallengeTarget(null)}
        onPick={(game) => challengeTarget && startChallenge(challengeTarget, game)}
      />
    </ScrollView>
  );
}

function Section({
  title,
  styles,
  children,
}: {
  title: string;
  styles: ReturnType<typeof createStyles>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionRows}>{children}</View>
    </View>
  );
}

function PlayerRow({
  colors,
  styles,
  player,
  onPress,
  trailing,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  player: FriendPublicView;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={player.username}
    >
      <AvatarBubble colors={colors} avatarUrl={player.avatarUrl} username={player.username} />
      <Text style={styles.rowUsername} numberOfLines={1}>
        {player.username}
      </Text>
      {trailing}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.lg },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    searchRow: { flexDirection: 'row', gap: spacing.sm },
    searchInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.ink,
      fontSize: typography.scale.md,
    },
    searchButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchButtonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    section: { gap: spacing.sm },
    sectionTitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    sectionRows: { gap: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    rowUsername: { flex: 1, color: colors.ink, fontSize: typography.scale.md },
    addButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    addButtonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    actionRow: { flexDirection: 'row', gap: spacing.xs },
    acceptButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    acceptButtonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    declineButton: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    declineButtonText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    challengeBanner: {
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    challengeBannerText: {
      color: colors.ink,
      fontSize: typography.scale.sm,
      fontWeight: '600',
      textAlign: 'center',
    },
    challengeButton: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: 1.5,
      borderColor: colors.arcaneSoft,
    },
    challengeButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
    },
    matchTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
    matchLabel: { color: colors.inkMuted, fontSize: typography.scale.xs, flexShrink: 1 },
    mutedPill: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    mutedPillText: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
  });
}
