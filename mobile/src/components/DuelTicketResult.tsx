import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { AvatarBubble } from '@/components/AvatarBubble';
import type { ArcadeHeroResultsStat } from '@/components/ArcadeHeroResults';

export interface DuelTicketResultProps {
  colors: ThemeColors;
  eyebrow: string;
  /** Headline — "You won!" / "You lost" / "It's a draw". */
  title: string;
  /** "{{correct}} of {{total}} correct", already translated by the caller. */
  subtitle: string;
  youCorrect: number;
  opponentCorrect: number;
  youAvatarUrl?: string | null;
  /** "You" — deliberately not the player's own username, matching how
   * the live in-match scoreboard also just says "You". */
  youLabel: string;
  /** Already-translated "{{xp}} XP" for each side. */
  youXpText: string;
  opponentAvatarUrl?: string | null;
  opponentUsername: string;
  opponentXpText: string;
  onPressOpponent?: () => void;
  opponentAccessibilityLabel?: string;
  /** Pill row under the perforation — longest streak, same shape
   * ArcadeHeroResults uses so the two components stay visually related. */
  stats?: ArcadeHeroResultsStat[];
  /** Extra summary lines under the stats row — the tiebreak note. */
  extraLines?: string[];
  primaryLabel: string;
  onPrimary: () => void;
  primaryAccessibilityLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryAccessibilityLabel?: string;
}

/**
 * Word Duel's own results card — Design canvas review, Sept 2026
 * ("Word Duel Result Screen", Option D "Duel Ticket", Barth's pick over
 * three other chess.com-referenced directions). Word-Duel-specific,
 * deliberately NOT folded into the shared `ArcadeHeroResults` "Hero
 * Ring": that component is built for a solo accuracy score, and Word
 * Duel is the one Arcade game that's actually head-to-head, so this one
 * puts both players on screen with a real score between them instead of
 * reducing the opponent to a caption line.
 *
 * The "wax seal" mid-score and torn-perforation divider are on-brand
 * flourishes (WordQuest's own living-manuscript direction, not a
 * literal chess.com copy) — the accent bar reuses the same
 * glyph-to-arcane gradient as the in-match puzzle card, so the result
 * screen still feels like the same object as the match it just ended.
 */
export function DuelTicketResult({
  colors,
  eyebrow,
  title,
  subtitle,
  youCorrect,
  opponentCorrect,
  youAvatarUrl,
  youLabel,
  youXpText,
  opponentAvatarUrl,
  opponentUsername,
  opponentXpText,
  onPressOpponent,
  opponentAccessibilityLabel,
  stats = [],
  extraLines = [],
  primaryLabel,
  onPrimary,
  primaryAccessibilityLabel,
  secondaryLabel,
  onSecondary,
  secondaryAccessibilityLabel,
}: DuelTicketResultProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const opponentAvatarColumn = (
    <>
      <View style={styles.avatarPlain}>
        <AvatarBubble
          colors={colors}
          avatarUrl={opponentAvatarUrl}
          username={opponentUsername}
          size={72}
        />
      </View>
      <Text style={styles.avatarName} numberOfLines={1}>
        {opponentUsername}
      </Text>
      <Text style={styles.avatarXp}>{opponentXpText}</Text>
    </>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.ticket}>
        <LinearGradient
          colors={[colors.glyph, colors.arcane]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentBar}
        />

        <View style={styles.top}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>

          <View style={styles.avatarRow}>
            {onPressOpponent ? (
              <Pressable
                style={styles.avatarCol}
                onPress={onPressOpponent}
                accessibilityRole="button"
                accessibilityLabel={opponentAccessibilityLabel}
              >
                {opponentAvatarColumn}
              </Pressable>
            ) : (
              <View style={styles.avatarCol}>{opponentAvatarColumn}</View>
            )}

            <View style={styles.seal}>
              <Text style={styles.sealText}>
                {youCorrect}
                {'–'}
                {opponentCorrect}
              </Text>
            </View>

            <View style={styles.avatarCol}>
              <View style={styles.avatarYou}>
                <AvatarBubble
                  colors={colors}
                  avatarUrl={youAvatarUrl}
                  username={youLabel}
                  size={72}
                />
              </View>
              <Text style={[styles.avatarName, styles.avatarNameYou]} numberOfLines={1}>
                {youLabel}
              </Text>
              <Text style={[styles.avatarXp, styles.avatarXpYou]}>{youXpText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.perforationRow}>
          <View style={styles.perforationNotch} />
          <View style={styles.perforationLine} />
          <View style={styles.perforationNotch} />
        </View>

        <View style={styles.stub}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {stats.length > 0 && (
            <View style={styles.statRow}>
              {stats.map((stat, i) => (
                <View key={i} style={styles.statPill}>
                  <Ionicons name={stat.icon} size={14} color={colors.glyph} />
                  <Text style={styles.statPillText}>{stat.text}</Text>
                </View>
              ))}
            </View>
          )}

          {extraLines.map((line, i) => (
            <Text key={i} style={styles.extraLine}>
              {line}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.buttonCol}>
        <Pressable
          style={styles.primaryButton}
          onPress={onPrimary}
          accessibilityRole="button"
          accessibilityLabel={primaryAccessibilityLabel ?? primaryLabel}
        >
          <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
        </Pressable>
        {secondaryLabel && onSecondary && (
          <Pressable
            style={styles.secondaryButton}
            onPress={onSecondary}
            accessibilityRole="button"
            accessibilityLabel={secondaryAccessibilityLabel ?? secondaryLabel}
          >
            <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { width: '100%', maxWidth: 390, alignItems: 'center', gap: spacing.lg },
    ticket: {
      width: '100%',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 3,
    },
    accentBar: { height: 6 },
    top: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg, alignItems: 'center' },
    eyebrow: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    avatarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md + 2,
    },
    avatarCol: { alignItems: 'center', gap: 6, width: 96 },
    avatarPlain: {
      borderRadius: 40,
      borderWidth: 2,
      borderColor: colors.border,
      zIndex: 1,
    },
    avatarYou: {
      borderRadius: 40,
      borderWidth: 3,
      borderColor: colors.arcane,
      zIndex: 1,
    },
    avatarName: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
    avatarNameYou: { color: colors.ink },
    avatarXp: { color: colors.inkMuted, fontSize: 11, fontWeight: '600' },
    avatarXpYou: { color: colors.arcaneSoft },
    seal: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.arcane,
      borderWidth: 3,
      borderColor: colors.glyph,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: -10,
      zIndex: 2,
    },
    sealText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
    perforationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.lg - 2,
    },
    perforationNotch: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.background,
      marginHorizontal: -10,
    },
    perforationLine: {
      flexGrow: 1,
      borderTopWidth: 2,
      borderStyle: 'dashed',
      borderTopColor: colors.border,
    },
    stub: {
      paddingTop: spacing.md + 4,
      paddingBottom: spacing.lg + 4,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textAlign: 'center',
      marginTop: 4,
    },
    statRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    statPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.background,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    statPillText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    extraLine: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    buttonCol: { width: '100%', maxWidth: 360, gap: spacing.sm },
    primaryButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
      shadowColor: colors.arcane,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 14,
      elevation: 4,
    },
    primaryButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    secondaryButton: {
      borderRadius: radius.pill,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
  });
}
