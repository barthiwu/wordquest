import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getBattleLeaderboard, type BattleLeaderboardView } from '@/services/bossBattle';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'BossBattleLeaderboard'>;

/**
 * Screen 37 of the UI/UX Screen Bible — the player's own group. Boss
 * Battle stays self-paced with no live visibility into other players
 * (Correction & Completion Spec §4): while `status` is SCHEDULED or
 * LIVE, the server returns only the requesting player's own entry (no
 * rank), so this screen shows a private "your progress" view — battle
 * XP and answer counts, nothing about anyone else. The full ranked
 * group only renders once `status` is COMPLETED.
 *
 * No WebSocket/push infrastructure backs this (a deliberate scope call —
 * see notification-scheduler.service.ts's sibling decision on Boss
 * Battle reminders for the same reasoning): while the board is LIVE
 * this polls on a short interval so the player's own XP feels like it's
 * moving in real time without a new transport layer. Polling stops the
 * instant the board reports COMPLETED, and stops entirely when the
 * screen loses focus, so it never runs in the background.
 *
 * i18n note: this screen shares the `bossBattle` namespace with
 * BossBattleScreen, with its own copy nested under `leaderboard.*` so
 * its keys never collide with BossBattleScreen's top-level ones.
 */
const LIVE_POLL_INTERVAL_MS = 4000;

export function BossBattleLeaderboardScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('bossBattle');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [board, setBoard] = useState<BattleLeaderboardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getBattleLeaderboard(accessToken)
      .then(setBoard)
      .catch(() => setError(t('leaderboard.genericError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useFocusEffect(load);

  useFocusEffect(
    useCallback(() => {
      if (board?.status !== 'LIVE') return undefined;
      const interval = setInterval(load, LIVE_POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [board?.status, load]),
  );

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!board) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  if (board.status !== 'COMPLETED') {
    const you = board.entries.find((entry) => entry.isYou) ?? board.entries[0] ?? null;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{t('leaderboard.yourProgress')}</Text>
        <Text style={styles.subtitle}>
          {t('leaderboard.progressSubtitle', {
            status: board.status === 'LIVE' ? t('leaderboard.live') : t('leaderboard.startingSoon'),
          })}
        </Text>

        {you ? (
          <View style={[styles.row, styles.rowYou]}>
            <Text style={styles.name}>{you.username}</Text>
            <Text style={styles.xp}>{t('xpValue', { xp: you.battleXp })}</Text>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('leaderboard.notAnsweredYet')}</Text>
          </View>
        )}

        {you && (
          <Text style={styles.subtitle}>
            {t('leaderboard.answerSummary', {
              correct: you.correctAnswers,
              incorrect: you.incorrectAnswers,
            })}
          </Text>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('leaderboard.title')}</Text>
      <Text style={styles.subtitle}>{t('leaderboard.final')}</Text>

      {board.entries.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('leaderboard.emptyGroup')}</Text>
        </View>
      )}

      {board.entries.map((entry) => (
        <View
          key={entry.userId}
          style={[styles.row, styles.rowColumn, entry.isYou && styles.rowYou]}
        >
          <View style={styles.rowTop}>
            <Text style={styles.rank}>#{entry.rank}</Text>
            <Text style={styles.name}>{entry.username}</Text>
            <Text style={styles.xp}>{t('xpValue', { xp: entry.battleXp })}</Text>
          </View>
          {/* Performance summary + Rewards (V19 Stabilization Spec §4:
              "After Completion: Show... Rewards. Performance summary.") */}
          <Text style={styles.rowDetail}>
            {t('leaderboard.answerSummary', {
              correct: entry.correctAnswers,
              incorrect: entry.incorrectAnswers,
            })}
            {entry.rewardXp != null && entry.rewardGlyphs != null
              ? t('leaderboard.rewardSuffix', { xp: entry.rewardXp, glyphs: entry.rewardGlyphs })
              : ''}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.sm },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: { color: colors.danger, fontSize: typography.scale.md },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm, marginBottom: spacing.sm },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
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
    rowYou: { borderColor: colors.arcaneSoft },
    rowColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.xs },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rank: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700', width: 32 },
    name: { color: colors.ink, fontSize: typography.scale.md, flex: 1 },
    xp: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
    rowDetail: { color: colors.inkMuted, fontSize: typography.scale.xs, paddingLeft: 32 },
  });
}
