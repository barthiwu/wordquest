import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '@/constants/theme';
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
 */
const LIVE_POLL_INTERVAL_MS = 4000;

export function BossBattleLeaderboardScreen({ navigation }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [board, setBoard] = useState<BattleLeaderboardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getBattleLeaderboard(accessToken)
      .then(setBoard)
      .catch(() => setError('Could not load the leaderboard.'));
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
        <Text style={styles.title}>Your progress</Text>
        <Text style={styles.subtitle}>
          {board.status === 'LIVE' ? 'Live' : 'Starting soon'} — the group leaderboard unlocks once
          the battle ends
        </Text>

        {you ? (
          <View style={[styles.row, styles.rowYou]}>
            <Text style={styles.name}>{you.displayName}</Text>
            <Text style={styles.xp}>{you.battleXp} XP</Text>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>You haven&apos;t answered a challenge yet.</Text>
          </View>
        )}

        {you && (
          <Text style={styles.subtitle}>
            {you.correctAnswers} correct · {you.incorrectAnswers} incorrect
          </Text>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Group leaderboard</Text>
      <Text style={styles.subtitle}>Final</Text>

      {board.entries.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No one has answered a challenge in this group yet.</Text>
        </View>
      )}

      {board.entries.map((entry) => (
        <View
          key={entry.userId}
          style={[styles.row, styles.rowColumn, entry.isYou && styles.rowYou]}
        >
          <View style={styles.rowTop}>
            <Text style={styles.rank}>#{entry.rank}</Text>
            <Text style={styles.name}>{entry.displayName}</Text>
            <Text style={styles.xp}>{entry.battleXp} XP</Text>
          </View>
          {/* Performance summary + Rewards (V19 Stabilization Spec §4:
              "After Completion: Show... Rewards. Performance summary.") */}
          <Text style={styles.rowDetail}>
            {entry.correctAnswers} correct · {entry.incorrectAnswers} incorrect
            {entry.rewardXp != null && entry.rewardGlyphs != null
              ? ` · +${entry.rewardXp} XP, +${entry.rewardGlyphs} Glyphs`
              : ''}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.sm },
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
