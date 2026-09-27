import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { LeaderboardEntry } from '@/services/leaderboards';

interface Props {
  colors: ThemeColors;
  /** The player's own row on /leaderboards/friends — null before their
   * first fetch resolves. Always present once loaded (getFriends always
   * ranks the viewer, even alone), so `friendCount` is what actually
   * signals the empty state. */
  viewer: LeaderboardEntry | null;
  /** Number of accepted friends (not counting the viewer) on that same
   * leaderboard response — the only way to tell "ranked #1 among friends"
   * apart from "not ranked against anyone yet" (rank/XP alone can't). */
  friendCount: number | null;
  onPress: () => void;
}

/**
 * Home's Friend Rank card — the third card in the Clan/Boss Battle/Friend
 * rank carousel (Barth, Sept 2026). Simpler than ClanRankCard: no "gained
 * spots this week" embellishment. Rank and XP are the real
 * getFriendLeaderboard() viewer row.
 */
export function FriendRankCard({ colors, viewer, friendCount, onPress }: Props) {
  const { t } = useTranslation('common');
  const styles = createStyles(colors);

  if (!viewer || !friendCount) {
    return (
      <Pressable
        style={styles.inviteCard}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('friendRankCard.inviteLabel')}
      >
        <Ionicons name="people-outline" size={20} color={colors.arcaneSoft} />
        <View style={styles.inviteTextCol}>
          <Text style={styles.inviteTitle}>{t('friendRankCard.inviteTitle')}</Text>
          <Text style={styles.inviteSubtitle}>{t('friendRankCard.inviteSubtitle')}</Text>
        </View>
        <Text style={styles.inviteLink}>{t('friendRankCard.viewLeaderboard')}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('friendRankCard.cardLabel', { rank: viewer.rank })}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{t('friendRankCard.eyebrow')}</Text>
          <Text style={styles.xpLine}>{t('leaderboards:xpValue', { xp: viewer.totalXp })}</Text>
        </View>
        <View style={styles.rankBadge}>
          <Text style={styles.rankValue}>#{viewer.rank}</Text>
          <Text style={styles.rankLabel}>{t('friendRankCard.amongFriends')}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.viewLink}>{t('friendRankCard.viewLeaderboard')}</Text>
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
