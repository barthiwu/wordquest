import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { BackButton } from '@/components/BackButton';
import { AvatarBubble } from '@/components/AvatarBubble';
import { VersusResultCard } from '@/components/VersusResultCard';
import { ApiError } from '@/services/apiClient';
import {
  cancelVersus,
  getVersusMatch,
  inviteFriendToVersus,
  isVersusGame,
  queueVersus,
  respondToVersus,
  VERSUS_GAME_ROUTE,
  type VersusGame,
  type VersusMatch,
} from '@/services/arcadeVersus';

type Props = NativeStackScreenProps<RootStackParamList, 'ArcadeVersus'>;

const POLL_MS = 2000;
/** Pause on "opponent found" before a live match starts on its own. */
const AUTO_START_MS = 1600;

const GAME_TITLE_KEY: Record<VersusGame, string> = {
  SCRAMBLE_QUEST: 'arcade:scrambleQuestTitle',
  COMPLETE_IT: 'arcade:completeItTitle',
  HANGMAN: 'arcade:hangmanTitle',
};

/**
 * Where a head-to-head match begins and where challenges land. It opens in
 * one of three ways: queueing for a random opponent (`game`), challenging a
 * friend (`game` + `friendId`), or opening an existing match (`matchId`,
 * also the deep link from a challenge notification).
 */
export function ArcadeVersusLobbyScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['arcade', 'common']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { game: gameParam, matchId: matchIdParam, friendId } = route.params ?? {};

  const [match, setMatch] = useState<VersusMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const begin = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    setMatch(null);
    startedRef.current = false;
    try {
      let m: VersusMatch;
      if (matchIdParam) m = await getVersusMatch(accessToken, matchIdParam);
      else if (gameParam && friendId)
        m = await inviteFriendToVersus(accessToken, friendId, gameParam);
      else if (gameParam) m = await queueVersus(accessToken, gameParam);
      else throw new Error('missing params');
      if (alive.current) setMatch(m);
    } catch (err) {
      if (alive.current) {
        setError(err instanceof ApiError ? err.message : t('arcade:versus.lobby.error'));
      }
    }
  }, [accessToken, matchIdParam, gameParam, friendId, t]);

  useEffect(() => {
    void begin();
  }, [begin]);

  const matchId = match?.id;
  const status = match?.status;
  const meFinished = match?.me.finished ?? false;

  // Poll while the lobby is still waiting on something.
  useEffect(() => {
    if (!accessToken || !matchId) return undefined;
    if (status !== 'SEARCHING' && status !== 'INVITED' && !(status === 'ACTIVE' && meFinished)) {
      return undefined;
    }
    const id = setInterval(() => {
      getVersusMatch(accessToken, matchId)
        .then((m) => alive.current && setMatch(m))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [accessToken, matchId, status, meFinished]);

  const gameOf = (m: VersusMatch): VersusGame | null => (isVersusGame(m.game) ? m.game : null);

  const startPlaying = useCallback(
    (m: VersusMatch) => {
      const g = gameOf(m);
      if (!g || startedRef.current) return;
      startedRef.current = true;
      navigation.replace(VERSUS_GAME_ROUTE[g], { versusMatchId: m.id });
    },
    [navigation],
  );

  // A live (random) match starts by itself a moment after pairing.
  useEffect(() => {
    if (!match || match.status !== 'ACTIVE' || match.kind !== 'RANDOM' || match.me.finished) {
      return undefined;
    }
    const id = setTimeout(() => startPlaying(match), AUTO_START_MS);
    return () => clearTimeout(id);
  }, [match, startPlaying]);

  const act = async (fn: () => Promise<VersusMatch | void>) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next && alive.current) setMatch(next);
    } catch (err) {
      if (alive.current)
        setError(err instanceof ApiError ? err.message : t('arcade:versus.lobby.error'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const game = match ? gameOf(match) : (gameParam ?? null);
  const gameName = game ? t(GAME_TITLE_KEY[game]) : '';
  const name = match?.opponent?.username ?? '';

  const playSolo = () => {
    if (game) navigation.replace(VERSUS_GAME_ROUTE[game], {});
  };

  let body: JSX.Element;
  if (error) {
    body = (
      <>
        <Text style={styles.error}>{error}</Text>
        <Pressable
          style={styles.button}
          onPress={() => void begin()}
          accessibilityRole="button"
          accessibilityLabel={t('arcade:versus.lobby.tryAgain')}
        >
          <Text style={styles.buttonText}>{t('arcade:versus.lobby.tryAgain')}</Text>
        </Pressable>
      </>
    );
  } else if (!match) {
    body = <ActivityIndicator color={colors.arcaneSoft} />;
  } else if (match.status === 'SEARCHING') {
    body = (
      <>
        <ActivityIndicator color={colors.arcaneSoft} size="large" />
        <Text style={styles.title}>{t('arcade:versus.lobby.searchingTitle')}</Text>
        <Text style={styles.sub}>{t('arcade:versus.lobby.searchingBody', { game: gameName })}</Text>
        <Pressable
          style={styles.ghost}
          disabled={busy}
          onPress={() =>
            act(async () => {
              if (accessToken) await cancelVersus(accessToken, match.id);
              navigation.goBack();
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('arcade:versus.lobby.cancelSearch')}
        >
          <Text style={styles.ghostText}>{t('arcade:versus.lobby.cancelSearch')}</Text>
        </Pressable>
      </>
    );
  } else if (match.status === 'INVITED' && match.incoming) {
    body = (
      <>
        <Opponent match={match} colors={colors} styles={styles} />
        <Text style={styles.title}>{t('arcade:versus.lobby.incomingTitle', { name })}</Text>
        <Text style={styles.sub}>{t('arcade:versus.lobby.incomingBody', { game: gameName })}</Text>
        <Pressable
          style={[styles.button, busy && styles.disabled]}
          disabled={busy}
          onPress={() =>
            act(() =>
              accessToken ? respondToVersus(accessToken, match.id, true) : Promise.resolve(),
            )
          }
          accessibilityRole="button"
          accessibilityLabel={t('arcade:versus.lobby.accept')}
        >
          <Text style={styles.buttonText}>{t('arcade:versus.lobby.accept')}</Text>
        </Pressable>
        <Pressable
          style={styles.ghost}
          disabled={busy}
          onPress={() =>
            act(() =>
              accessToken ? respondToVersus(accessToken, match.id, false) : Promise.resolve(),
            )
          }
          accessibilityRole="button"
          accessibilityLabel={t('arcade:versus.lobby.decline')}
        >
          <Text style={styles.ghostText}>{t('arcade:versus.lobby.decline')}</Text>
        </Pressable>
      </>
    );
  } else if (match.status === 'INVITED') {
    body = (
      <>
        <Opponent match={match} colors={colors} styles={styles} />
        <Text style={styles.title}>{t('arcade:versus.lobby.waitingFriend', { name })}</Text>
        <Text style={styles.sub}>{t('arcade:versus.lobby.waitingFriendBody')}</Text>
        <Pressable
          style={styles.ghost}
          disabled={busy}
          onPress={() =>
            act(() => (accessToken ? cancelVersus(accessToken, match.id) : Promise.resolve()))
          }
          accessibilityRole="button"
          accessibilityLabel={t('arcade:versus.lobby.cancelChallenge')}
        >
          <Text style={styles.ghostText}>{t('arcade:versus.lobby.cancelChallenge')}</Text>
        </Pressable>
      </>
    );
  } else if (match.status === 'ACTIVE' && !match.me.finished) {
    body = (
      <>
        <Opponent match={match} colors={colors} styles={styles} />
        <Text style={styles.title}>{t('arcade:versus.lobby.foundTitle')}</Text>
        <Text style={styles.sub}>
          {t('arcade:versus.lobby.foundBody', { name, game: gameName })}
        </Text>
        {match.kind === 'RANDOM' ? (
          <ActivityIndicator color={colors.arcaneSoft} />
        ) : (
          <Pressable
            style={styles.button}
            onPress={() => startPlaying(match)}
            accessibilityRole="button"
            accessibilityLabel={t('arcade:versus.lobby.playNow')}
          >
            <Text style={styles.buttonText}>{t('arcade:versus.lobby.playNow')}</Text>
          </Pressable>
        )}
        {match.opponentProgress.answered > 0 && (
          <Text style={styles.sub}>{t('arcade:versus.lobby.theyStarted', { name })}</Text>
        )}
      </>
    );
  } else if (match.status === 'ACTIVE' || match.status === 'COMPLETED') {
    body = (
      <>
        <Opponent match={match} colors={colors} styles={styles} />
        <VersusResultCard matchId={match.id} />
        {game && (
          <Pressable
            style={styles.button}
            onPress={() => navigation.replace('ArcadeVersus', { game })}
            accessibilityRole="button"
            accessibilityLabel={t('arcade:versus.result.rematch')}
          >
            <Text style={styles.buttonText}>{t('arcade:versus.result.rematch')}</Text>
          </Pressable>
        )}
      </>
    );
  } else {
    const key =
      match.status === 'DECLINED'
        ? 'declined'
        : match.status === 'CANCELLED'
          ? 'cancelled'
          : match.kind === 'RANDOM'
            ? 'noOpponent'
            : 'expired';
    body = (
      <>
        <Text style={styles.title}>{t(`arcade:versus.lobby.${key}Title`, { name })}</Text>
        <Text style={styles.sub}>{t(`arcade:versus.lobby.${key}Body`, { name })}</Text>
        {match.kind === 'RANDOM' && game && (
          <Pressable
            style={styles.button}
            onPress={() => navigation.replace('ArcadeVersus', { game })}
            accessibilityRole="button"
            accessibilityLabel={t('arcade:versus.lobby.searchAgain')}
          >
            <Text style={styles.buttonText}>{t('arcade:versus.lobby.searchAgain')}</Text>
          </Pressable>
        )}
        {game && match.kind === 'RANDOM' && (
          <Pressable
            style={styles.ghost}
            onPress={playSolo}
            accessibilityRole="button"
            accessibilityLabel={t('arcade:versus.lobby.playSolo')}
          >
            <Text style={styles.ghostText}>{t('arcade:versus.lobby.playSolo')}</Text>
          </Pressable>
        )}
      </>
    );
  }

  return (
    <ScrollView style={styles.flexFill} contentContainerStyle={styles.container}>
      <View style={styles.column}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.center}>{body}</View>
      </View>
    </ScrollView>
  );
}

function Opponent({
  match,
  colors,
  styles,
}: {
  match: VersusMatch;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  if (!match.opponent) return null;
  return (
    <View style={styles.opponent}>
      <AvatarBubble
        colors={colors}
        avatarUrl={match.opponent.avatarUrl}
        username={match.opponent.username}
        size={72}
      />
      <Text style={styles.opponentName}>{match.opponent.username}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    flexFill: { flex: 1, backgroundColor: colors.background },
    container: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.lg + topInset },
    column: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.md, flexGrow: 1 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xl,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: '800',
      textAlign: 'center',
    },
    sub: { color: colors.inkMuted, fontSize: typography.scale.md, textAlign: 'center' },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    opponent: { alignItems: 'center', gap: spacing.sm },
    opponentName: { color: colors.ink, fontSize: typography.scale.lg, fontWeight: '700' },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      minWidth: 220,
    },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    ghost: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, alignItems: 'center' },
    ghostText: { color: colors.inkMuted, fontSize: typography.scale.md, fontWeight: '600' },
  });
}
