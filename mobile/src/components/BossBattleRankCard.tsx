import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { LeaderboardEntry } from '@/services/leaderboards';

interface Props {
  colors: ThemeColors;
  /** The player's own row on /leaderboards/boss-battle — null before their
   * first fetch resolves, or when they have no lifetime Boss Battle XP yet
   * (entry.totalXp is 0, meaning they've never finished a rewarded battle). */
  viewer: LeaderboardEntry | null;
  onPress: () => void;
}

/**
 * Home's Boss Battle Rank card — one of the three cards in the Clan/Boss
 * Battle/Friend rank carousel (Barth, Sept 2026). Simpler than
 * ClanRankCard: no "gained spots this week" embellishment, since Boss
 * Battle rank is a lifetime total rather than a weekly snapshot. Rank and
 * XP are the real getBossBattleXpLeaderboard() viewer row — entry.level is
 * meaningless for this view (always 0) and intentionally not shown here.
 */
export function BossBattleRankCard({ colors, viewer, onPress }: Props) {
  const { t } = useTranslation('common');
  const styles = createStyles(colors);

  if (!viewer || viewer.totalXp === 0) {
    return (
      <Pressable
        style={styles.inviteCard}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('bossBattleRankCard.inviteLabel')}
      >
        <Ionicons name="flash-outline" size={20} color={colors.arcaneSoft} />
        <View style={styles.inviteTextCol}>
          <Text style={styles.inviteTitle}>{t('bossBattleRankCard.inviteTitle')}</Text>
          <Text style={styles.inviteSubtitle}>{t('bossBattleRankCard.inviteSubtitle')}</Text>
        </View>
        <Text style={styles.inviteLink}>{t('bossBattleRankCard.viewLeaderboard')}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('bossBattleRankCard.cardLabel', { rank: viewer.rank })}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{t('bossBattleRankCard.eyebrow')}</Text>
          <Text style={styles.xpLine}>{t('leaderboards:xpValue', { xp: viewer.totalXp })}</Text>
        </View>
        <View style={styles.rankBadge}>
          <Text style={styles.rankValue}>#{viewer.rank}</Text>
          <Text style={styles.rankLabel}>{t('bossBattleRankCard.lifetime')}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.viewLink}>{t('bossBattleRankCard.viewLeaderboard')}</Text>
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
    xpLine: {
      color: colors.glyph,
      fontSize: typography.scale.md,
      fontWeight: typography.display.weight,
    },
    rankBadge: { alignItems: 'flex-end' },
    rankValue: { color: colors.arcaneSoft, fontSize: typography.scale.lg, fontWeight: '700' },
    rankLabel: { color: colors.inkMuted, fontSize: typography.scale.xs },
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
