import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { localIsoWeekKey } from '@/utils/timeOfDay';
import type { LeaderboardEntry } from '@/services/leaderboards';

const STORAGE_KEY = 'wordquest.clanRank.weeklyBaseline.v1';

interface WeeklyBaseline {
  weekKey: string;
  rank: number;
}

interface Props {
  colors: ThemeColors;
  /** The player's own row on /leaderboards/clan — null when they haven't joined a clan yet. */
  viewer: LeaderboardEntry | null;
  onPress: () => void;
}

/**
 * Home's Clan Rank card (mockup B1 Refined). Rank and clan name are the
 * real getClanLeaderboard() viewer row — nothing invented there. The
 * "You've gained N spots this week" line IS invented in the sense that
 * no backend endpoint tracks rank history, but it's built honestly: this
 * remembers the player's own rank the first time it's seen each ISO
 * week (device-local, see localIsoWeekKey) and only ever reports a real
 * measured improvement against that real number — never a guess, and
 * never a negative/unchanged claim the mockup didn't ask for (those
 * cases just fall back to a plain rank readout).
 */
export function ClanRankCard({ colors, viewer, onPress }: Props) {
  const { t } = useTranslation('common');
  const styles = createStyles(colors);
  const [gainedSpots, setGainedSpots] = useState<number | null>(null);

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    const weekKey = localIsoWeekKey();

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const stored: WeeklyBaseline | null = raw ? JSON.parse(raw) : null;

        if (stored && stored.weekKey === weekKey) {
          const delta = stored.rank - viewer.rank;
          setGainedSpots(delta > 0 ? delta : null);
          return;
        }

        // First look this ISO week (or no baseline yet) — record today's
        // rank as this week's starting point. Nothing to compare against
        // yet, so no delta line this time.
        setGainedSpots(null);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ weekKey, rank: viewer.rank })).catch(
          () => {},
        );
      })
      .catch(() => {
        if (!cancelled) setGainedSpots(null);
      });

    return () => {
      cancelled = true;
    };
  }, [viewer]);

  if (!viewer || !viewer.clanName) {
    return (
      <Pressable
        style={styles.inviteCard}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('clanRankCard.inviteLabel')}
      >
        <Ionicons name="sparkles-outline" size={20} color={colors.arcaneSoft} />
        <View style={styles.inviteTextCol}>
          <Text style={styles.inviteTitle}>{t('clanRankCard.inviteTitle')}</Text>
          <Text style={styles.inviteSubtitle}>{t('clanRankCard.inviteSubtitle')}</Text>
        </View>
        <Text style={styles.inviteLink}>{t('clanRankCard.browseClans')}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('clanRankCard.cardLabel', {
        clanName: viewer.clanName,
        rank: viewer.rank,
      })}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{t('clanRankCard.eyebrow')}</Text>
          <Text style={styles.clanName}>{viewer.clanName}</Text>
        </View>
        <View style={styles.rankBadge}>
          <Text style={styles.rankValue}>#{viewer.rank}</Text>
          <Text style={styles.rankLabel}>{t('clanRankCard.thisWeek')}</Text>
        </View>
      </View>

      {gainedSpots !== null ? (
        <View style={styles.deltaRow}>
          <Ionicons name="arrow-up" size={14} color={colors.success} />
          <Text style={styles.deltaText}>
            {t('clanRankCard.gainedSpots', { count: gainedSpots })}
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.viewLink}>{t('clanRankCard.viewLeaderboard')}</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.arcaneSoft} />
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerText: { gap: 1 },
    eyebrow: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    clanName: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: typography.display.weight,
    },
    rankBadge: { alignItems: 'flex-end' },
    rankValue: { color: colors.arcaneSoft, fontSize: typography.scale.lg, fontWeight: '700' },
    rankLabel: { color: colors.inkMuted, fontSize: typography.scale.xs },
    deltaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    deltaText: { color: colors.success, fontSize: typography.scale.sm, fontWeight: '600' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    viewLink: { color: colors.arcaneSoft, fontSize: typography.scale.xs, fontWeight: '700' },
    inviteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      padding: spacing.md,
    },
    inviteTextCol: { flex: 1, gap: 1 },
    inviteTitle: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    inviteSubtitle: { color: colors.inkMuted, fontSize: typography.scale.xs },
    inviteLink: { color: colors.arcaneSoft, fontSize: typography.scale.xs, fontWeight: '700' },
  });
}
