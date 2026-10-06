import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { usePendingGroupStore } from '@/state/pendingGroupStore';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { BackButton } from '@/components/BackButton';
import { ApiError } from '@/services/apiClient';
import { VERSUS_GAME_ROUTE, type VersusGame } from '@/services/arcadeVersus';
import {
  endGroup,
  extractGroupCode,
  formatGroupCode,
  getGroup,
  GROUP_WINDOW_CHOICES,
  groupShareUrl,
  joinGroup,
  leaveGroup,
  previewGroup,
  removeGroupMember,
  startGroupRound,
  type ArcadeGroup,
  type GroupMember,
  type GroupPreview,
} from '@/services/arcadeGroups';
import { canCopyText, copyText, shareMessage } from '@/utils/shareLink';
import { GroupMemberList } from './GroupMemberList';
import { formatClock } from './groupFormat';

type Props = NativeStackScreenProps<RootStackParamList, 'ArcadeGroup'>;

/** How often the lobby / round refreshes. Fifty players at this rate is ~17 requests a second for one group. */
const POLL_MS = 3000;
/** After the round ends the table stops changing, so it is only re-read now and then. */
const GAME_TITLE_KEY: Record<VersusGame, string> = {
  SCRAMBLE_QUEST: 'arcade:scrambleQuestTitle',
  COMPLETE_IT: 'arcade:completeItTitle',
  HANGMAN: 'arcade:hangmanTitle',
};

/**
 * One group, start to finish: the join screen an invite link opens, the
 * lobby (share link, roster, the host's Start button), the live round, and
 * the results (a ranked table for everyone the host allows, plus per-word
 * accuracy for the host).
 */
export function ArcadeGroupScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['arcade', 'common']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const setPendingCode = usePendingGroupStore((s) => s.setCode);

  const [groupId, setGroupId] = useState<string | undefined>(route.params.groupId);
  const code = useMemo(
    () => (route.params.code ? extractGroupCode(route.params.code) : null),
    [route.params.code],
  );

  const [group, setGroup] = useState<ArcadeGroup | null>(null);
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [windowMinutes, setWindowMinutes] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<'end' | 'leave' | string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A link opened while signed out: keep the code, sign in first.
  useEffect(() => {
    if (isHydrated && !accessToken && code) {
      setPendingCode(code);
      navigation.replace('Welcome');
    }
  }, [isHydrated, accessToken, code, navigation, setPendingCode]);

  // Opened from a link: show what the group is before joining it.
  useEffect(() => {
    if (!accessToken || groupId || !code) return;
    previewGroup(accessToken, code)
      .then((p) => alive.current && setPreview(p))
      .catch((err) => {
        if (alive.current) {
          setFatal(
            err instanceof ApiError && err.status !== 404
              ? err.message
              : t('arcade:group.join.invalid'),
          );
        }
      });
  }, [accessToken, groupId, code, t]);

  const load = useCallback(async () => {
    if (!accessToken || !groupId) return;
    try {
      const g = await getGroup(accessToken, groupId);
      if (alive.current) {
        setGroup(g);
        setFatal(null);
      }
    } catch (err) {
      if (!alive.current) return;
      // A removed member, or a group that no longer exists: stop polling.
      if (err instanceof ApiError && err.status === 404) setFatal(t('arcade:group.join.invalid'));
    }
  }, [accessToken, groupId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = group?.status;
  useEffect(() => {
    if (!accessToken || !groupId || fatal || status === 'ENDED') return undefined;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [accessToken, groupId, status, fatal, load]);

  // One-second tick for the countdown, only while a round is running.
  useEffect(() => {
    if (status !== 'ACTIVE') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (alive.current) {
        setError(err instanceof ApiError ? err.message : t('arcade:group.lobby.error'));
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const doJoin = () =>
    run(async () => {
      if (!accessToken || !code) return;
      const g = await joinGroup(accessToken, code);
      setGroupId(g.id);
      setGroup(g);
    });

  const gameName = (g: VersusGame) => t(GAME_TITLE_KEY[g]);

  /** Two taps for anything that cannot be undone: the first arms it. */
  const twoTap = (key: string, action: () => Promise<void>) => {
    if (confirm !== key) {
      setConfirm(key);
      return;
    }
    setConfirm(null);
    void run(action);
  };

  const play = (g: ArcadeGroup) => {
    navigation.replace(VERSUS_GAME_ROUTE[g.game], { groupId: g.id });
  };

  // ── Rendering ────────────────────────────────────────────────────────

  let body: JSX.Element;
  if (fatal) {
    body = (
      <View style={styles.center}>
        <Text style={styles.title}>{fatal}</Text>
        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('ArcadeGroupHub', {})}
          accessibilityRole="button"
          accessibilityLabel={t('arcade:group.hubTitle')}
        >
          <Text style={styles.buttonText}>{t('arcade:group.hubTitle')}</Text>
        </Pressable>
      </View>
    );
  } else if (!groupId && preview) {
    body = (
      <View style={styles.center}>
        <Text style={styles.title}>{preview.title ?? gameName(preview.game)}</Text>
        <Text style={styles.sub}>
          {gameName(preview.game)} · {t('arcade:group.join.host', { name: preview.hostUsername })}
        </Text>
        <Text style={styles.sub}>
          {t('arcade:group.join.players', { count: preview.memberCount, max: preview.maxMembers })}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {preview.full ? (
          <Text style={styles.error}>{t('arcade:group.join.full')}</Text>
        ) : (
          <Pressable
            style={[styles.button, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void doJoin()}
            accessibilityRole="button"
            accessibilityLabel={t('arcade:group.join.button')}
          >
            <Text style={styles.buttonText}>
              {busy ? t('arcade:group.join.joining') : t('arcade:group.join.button')}
            </Text>
          </Pressable>
        )}
      </View>
    );
  } else if (!group) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.arcaneSoft} size="large" />
      </View>
    );
  } else {
    const me = group.me;
    const link = groupShareUrl(group.code);
    const remaining = new Date(group.expiresAt).getTime() - now;
    const choice = windowMinutes ?? group.windowMinutes;

    const onRemove = (m: GroupMember) =>
      twoTap(`remove:${m.userId}`, async () => {
        if (!accessToken) return;
        setGroup(await removeGroupMember(accessToken, group.id, m.userId));
      });

    body = (
      <>
        <Text style={styles.title} accessibilityRole="header">
          {group.title ?? gameName(group.game)}
        </Text>
        <Text style={styles.sub}>
          {gameName(group.game)} · {t(`arcade:group.status.${group.status}`)}
          {group.status === 'ACTIVE'
            ? ` · ${t('arcade:group.active.timeLeft', { time: formatClock(remaining) })}`
            : ''}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {group.status !== 'ENDED' && group.isHost ? (
          <View style={styles.card}>
            <Text style={styles.label}>{t('arcade:group.lobby.shareTitle')}</Text>
            <Text style={styles.link} selectable>
              {link}
            </Text>
            <Text style={styles.hint}>
              {t('arcade:group.lobby.codeLabel')}: {formatGroupCode(group.code)}
            </Text>
            <Text style={styles.hint}>{t('arcade:group.lobby.shareHint')}</Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.smallButton}
                onPress={() =>
                  void shareMessage(
                    t('arcade:group.lobby.shareMessage', { game: gameName(group.game), url: link }),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={t('arcade:group.lobby.shareLink')}
              >
                <Text style={styles.buttonText}>{t('arcade:group.lobby.shareLink')}</Text>
              </Pressable>
              {canCopyText() ? (
                <Pressable
                  style={styles.ghostButton}
                  onPress={async () => {
                    if (await copyText(link)) {
                      setCopied(true);
                      setTimeout(() => alive.current && setCopied(false), 2000);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('arcade:group.lobby.copyLink')}
                >
                  <Text style={styles.ghostText}>
                    {copied ? t('arcade:group.lobby.linkCopied') : t('arcade:group.lobby.copyLink')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {group.status === 'LOBBY' && group.isHost ? (
          <View style={styles.card}>
            <Text style={styles.label}>{t('arcade:group.lobby.roundLength')}</Text>
            <View style={styles.chips}>
              {GROUP_WINDOW_CHOICES.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, choice === m && styles.chipOn]}
                  onPress={() => setWindowMinutes(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choice === m }}
                  accessibilityLabel={t('arcade:group.lobby.minutes', { count: m })}
                >
                  <Text style={[styles.chipText, choice === m && styles.chipTextOn]}>
                    {t('arcade:group.lobby.minutes', { count: m })}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.button, busy && styles.disabled]}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (!accessToken) return;
                  setGroup(await startGroupRound(accessToken, group.id, choice));
                })
              }
              accessibilityRole="button"
              accessibilityLabel={t('arcade:group.lobby.start')}
            >
              <Text style={styles.buttonText}>
                {busy ? t('arcade:group.lobby.starting') : t('arcade:group.lobby.start')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {group.status === 'LOBBY' && !group.isHost ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.arcaneSoft} />
            <Text style={styles.sub}>{t('arcade:group.lobby.waitingHost')}</Text>
          </View>
        ) : null}

        {group.status === 'ACTIVE' && me ? (
          <View style={styles.card}>
            {me.state === 'FINISHED' ? (
              <Text style={styles.sub}>{t('arcade:group.active.doneWaiting')}</Text>
            ) : (
              <Pressable
                style={styles.button}
                onPress={() => play(group)}
                accessibilityRole="button"
                accessibilityLabel={
                  me.state === 'PLAYING'
                    ? t('arcade:group.active.continue')
                    : t('arcade:group.active.playNow')
                }
              >
                <Text style={styles.buttonText}>
                  {me.state === 'PLAYING'
                    ? t('arcade:group.active.continue')
                    : t('arcade:group.active.playNow')}
                </Text>
              </Pressable>
            )}
            <Text style={styles.hint}>{t('arcade:group.active.hint')}</Text>
          </View>
        ) : null}

        {group.status === 'ENDED' ? (
          <View style={styles.card}>
            <Text style={styles.label}>{t('arcade:group.results.ended')}</Text>
            {me && me.rank !== null ? (
              <Text style={styles.sub}>
                {t('arcade:group.results.yourRank', {
                  rank: me.rank,
                  count: group.members.filter((m) => m.state !== 'NOT_STARTED').length,
                })}
              </Text>
            ) : null}
            {!group.isHost && !group.showLeaderboard ? (
              <Text style={styles.hint}>{t('arcade:group.results.hidden')}</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.heading}>
          {group.status === 'ENDED'
            ? t('arcade:group.results.title')
            : t('arcade:group.lobby.players', { count: group.memberCount, max: group.maxMembers })}
        </Text>
        <GroupMemberList
          colors={colors}
          members={group.members}
          wordsTotal={group.wordsTotal}
          showScores={group.status !== 'LOBBY'}
          onRemove={group.isHost && group.status !== 'ENDED' ? onRemove : undefined}
          confirmingRemoveId={confirm?.startsWith('remove:') ? confirm.slice(7) : null}
        />

        {group.wordBreakdown ? (
          <>
            <Text style={styles.heading}>{t('arcade:group.results.wordsHeading')}</Text>
            {group.wordBreakdown.every((w) => w.attempts === 0) ? (
              <Text style={styles.sub}>{t('arcade:group.results.noWords')}</Text>
            ) : (
              group.wordBreakdown.map((w) => (
                <View key={w.wordId} style={styles.wordRow}>
                  <View style={styles.wordText}>
                    <Text style={styles.wordName}>{w.word}</Text>
                    <Text style={styles.hint} numberOfLines={2}>
                      {w.definition}
                    </Text>
                  </View>
                  <Text style={styles.wordScore}>
                    {t('arcade:group.results.wordLine', {
                      correct: w.correct,
                      attempts: w.attempts,
                    })}
                  </Text>
                </View>
              ))
            )}
          </>
        ) : null}

        <View style={styles.actions}>
          {group.status === 'ENDED' ? (
            <Pressable
              style={styles.ghostButton}
              onPress={() => navigation.navigate('ArcadeGroupHub', { game: group.game })}
              accessibilityRole="button"
              accessibilityLabel={t('arcade:group.hubTitle')}
            >
              <Text style={styles.ghostText}>{t('arcade:group.hubTitle')}</Text>
            </Pressable>
          ) : group.isHost ? (
            <Pressable
              style={styles.ghostButton}
              disabled={busy}
              onPress={() =>
                twoTap('end', async () => {
                  if (!accessToken) return;
                  setGroup(await endGroup(accessToken, group.id));
                })
              }
              accessibilityRole="button"
              accessibilityLabel={
                group.status === 'ACTIVE'
                  ? t('arcade:group.lobby.endRound')
                  : t('arcade:group.lobby.end')
              }
            >
              <Text style={styles.dangerText}>
                {confirm === 'end'
                  ? t('arcade:group.lobby.confirmEnd')
                  : group.status === 'ACTIVE'
                    ? t('arcade:group.lobby.endRound')
                    : t('arcade:group.lobby.end')}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.ghostButton}
              disabled={busy}
              onPress={() =>
                twoTap('leave', async () => {
                  if (!accessToken) return;
                  await leaveGroup(accessToken, group.id);
                  navigation.navigate('ArcadeGroupHub', {});
                })
              }
              accessibilityRole="button"
              accessibilityLabel={t('arcade:group.lobby.leave')}
            >
              <Text style={styles.dangerText}>
                {confirm === 'leave'
                  ? t('arcade:group.lobby.confirmLeave')
                  : t('arcade:group.lobby.leave')}
              </Text>
            </Pressable>
          )}
        </View>
      </>
    );
  }

  return (
    <ScrollView style={styles.flexFill} contentContainerStyle={styles.container}>
      <View style={styles.column}>
        <BackButton onPress={() => navigation.goBack()} />
        {body}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    flexFill: { flex: 1, backgroundColor: colors.background },
    container: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.lg + topInset },
    column: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.md, flexGrow: 1 },
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
    heading: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      marginTop: spacing.sm,
    },
    label: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    hint: { color: colors.inkMuted, fontSize: typography.scale.sm },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    link: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surfaceRaised,
    },
    chipOn: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    chipText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    chipTextOn: { color: colors.ink },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      minWidth: 220,
    },
    smallButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
    },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    ghostButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
    },
    ghostText: { color: colors.inkMuted, fontSize: typography.scale.md, fontWeight: '600' },
    dangerText: { color: colors.danger, fontSize: typography.scale.md, fontWeight: '600' },
    disabled: { opacity: 0.5 },
    wordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    wordText: { flex: 1, gap: 2 },
    wordName: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    wordScore: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
