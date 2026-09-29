import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import {
  getOverviewStats,
  getWordDuelDashboardStats,
  type OverviewStats,
  type WordDuelDashboardStats,
} from '@/services/adminAnalytics';
import { ApiError } from '@/services/apiClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminDashboard'>;

/**
 * Settings > Analytics Dashboard (Telemetry spec Phase 5/6, mobile
 * half). Admin/support-only — the entry point in SettingsScreen is
 * hidden for a plain USER role, and the two backend endpoints this
 * screen reads (GET /analytics/dashboard/overview, .../word-duel) are
 * themselves gated by RolesGuard, so a non-admin who somehow lands here
 * (a deep link, a stale build) sees this screen's 403 error state, not
 * real numbers -- the mobile-side hiding is a UX convenience, not the
 * actual security boundary.
 *
 * Deliberately plain bar/card visuals (View-width-percentage bars, no
 * charting library) rather than react-native-svg -- this data is a
 * handful of counts and one five-bucket funnel, not worth a new
 * dependency for. See ScoreRing/RadarChart if a future admin view ever
 * needs a real SVG chart.
 */
export function AdminDashboardScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('adminDashboard');
  const accessToken = useAuthStore((s) => s.accessToken);

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [wordDuel, setWordDuel] = useState<WordDuelDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!accessToken) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [overviewResult, wordDuelResult] = await Promise.all([
          getOverviewStats(accessToken),
          getWordDuelDashboardStats(accessToken),
        ]);
        setOverview(overviewResult);
        setWordDuel(wordDuelResult);
      } catch (err) {
        setError(err instanceof ApiError && err.status === 403 ? t('forbidden') : t('loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, t],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={colors.arcaneSoft}
        />
      }
    >
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{t('title')}</Text>
      </View>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.arcaneSoft} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && overview && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('overviewSection')}</Text>
          <View style={styles.cardGrid}>
            <StatCard
              label={t('registeredUsers')}
              value={overview.registeredUsers}
              styles={styles}
            />
            <StatCard
              label={t('activeLast24h')}
              value={overview.activeUsersLast24h}
              styles={styles}
            />
            <StatCard
              label={t('activeLast7d')}
              value={overview.activeUsersLast7d}
              styles={styles}
            />
            <StatCard label={t('questsStarted')} value={overview.questsStarted} styles={styles} />
            <StatCard
              label={t('questsCompleted')}
              value={overview.questsCompleted}
              styles={styles}
            />
            <StatCard
              label={t('arcadeSessionsStarted')}
              value={overview.arcadeSessionsStarted}
              styles={styles}
            />
            <StatCard
              label={t('bossBattlesJoined')}
              value={overview.bossBattlesJoined}
              styles={styles}
            />
            <StatCard label={t('shopPurchases')} value={overview.shopPurchases} styles={styles} />
          </View>
        </View>
      )}

      {!loading && !error && wordDuel && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('wordDuelSection')}</Text>
          <View style={styles.cardGrid}>
            <StatCard label={t('matchesWaiting')} value={wordDuel.matchesWaiting} styles={styles} />
            <StatCard label={t('matchesActive')} value={wordDuel.matchesActive} styles={styles} />
            <StatCard
              label={t('matchesCompleted')}
              value={wordDuel.matchesCompleted}
              styles={styles}
            />
            <StatCard
              label={t('matchesAbandonedWaiting')}
              value={wordDuel.matchesAbandonedWaiting}
              styles={styles}
            />
            <StatCard
              label={t('correctRate')}
              value={formatPercent(wordDuel.correctRate)}
              styles={styles}
            />
            <StatCard
              label={t('avgCluesUsed')}
              value={wordDuel.avgCluesUsed !== null ? wordDuel.avgCluesUsed.toFixed(1) : '—'}
              styles={styles}
            />
            <StatCard
              label={t('avgResponseTime')}
              value={formatSeconds(wordDuel.avgResponseTimeMs)}
              styles={styles}
            />
          </View>

          <Text style={styles.subheading}>{t('clueUsageFunnel')}</Text>
          <View style={styles.funnelCard}>
            {wordDuel.clueUsage.map((row) => (
              <View key={row.clueNumber} style={styles.funnelRow}>
                <Text style={styles.funnelLabel}>{t('clueN', { n: row.clueNumber })}</Text>
                <View style={styles.funnelBarTrack}>
                  <View
                    style={[styles.funnelBarFill, { width: `${Math.round(row.fraction * 100)}%` }]}
                  />
                </View>
                <Text style={styles.funnelPercent}>{Math.round(row.fraction * 100)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function formatPercent(fraction: number | null): string {
  if (fraction === null) return '—';
  return `${Math.round(fraction * 100)}%`;
}

function formatSeconds(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatCard({
  label,
  value,
  styles,
}: {
  label: string;
  value: number | string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingTop: topInset + spacing.md,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    centered: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
    },
    errorText: {
      color: colors.danger,
      fontSize: typography.scale.md,
      textAlign: 'center',
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      marginBottom: spacing.md,
    },
    subheading: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: '700',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    cardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    card: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    cardValue: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      marginBottom: spacing.xs,
    },
    cardLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
    },
    funnelCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    funnelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    funnelLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      width: 56,
    },
    funnelBarTrack: {
      flex: 1,
      height: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    funnelBarFill: {
      height: '100%',
      borderRadius: radius.sm,
      backgroundColor: colors.arcane,
    },
    funnelPercent: {
      color: colors.ink,
      fontSize: typography.scale.xs,
      width: 40,
      textAlign: 'right',
    },
  });
}
