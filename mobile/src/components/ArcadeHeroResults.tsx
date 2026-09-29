import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { darkColors, radius, spacing, typography, type ThemeColors } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ArcadeHeroResultsStat {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

export interface ArcadeHeroResultsProps {
  colors: ThemeColors;
  /** Headline — "Session complete!", or a Word Duel outcome ("You won!"). */
  title: string;
  /** One line under the title — usually a "{{correct}} of {{total}}
   * correct" style summary, already translated by the caller. */
  subtitle?: string;
  /** Drives the ring's fill fraction and its color band. */
  correctCount: number;
  totalCount: number;
  /** Small uppercase label centered under the ring's percentage — default "ACCURACY". */
  ringLabel?: string;
  /** Pill row under the subtitle (XP earned, longest streak, ...). */
  stats?: ArcadeHeroResultsStat[];
  /** Extra summary lines under the stats row — Word Duel's opponent
   * summary / tiebreak note, for example. */
  extraLines?: string[];
  primaryLabel: string;
  onPrimary: () => void;
  primaryAccessibilityLabel?: string;
  /** Omit for a screen with only one action (Boss Battle's "See leaderboard"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryAccessibilityLabel?: string;
}

/**
 * Shared "Hero Ring" arcade results screen — Design canvas review, Sept
 * 2026 ("WordQuest Arcade — Screen Options", Option A, approved as-is
 * for ScrambleQuest's "waaay better" session-complete redesign, then
 * extended by Barth to Complete It, Word Duel and Boss Battle's own
 * completion screens, ahead of Boss Battle's separate group-leaderboard
 * reveal screen which this does not touch).
 *
 * The ring is banded by accuracy rather than a single accent color, per
 * Barth: red under 50%, green 50–74%, "celestial gold" (theme.ts's
 * `glyph` token — the same gold used for the Glyph currency) at 75%+
 * -- in dark mode. Light mode swaps that top band for arcaneSoft instead
 * (Barth, Sept 2026: red sitting next to gold read as too close together
 * on the light/parchment palette -- the same red-vs-gold contrast issue
 * already fixed for ScrambleQuest's countdown ring, see CountdownRing,
 * but missed here when this results ring was consolidated into a shared
 * component). Dark mode keeps the celestial-gold top band unchanged.
 * It fills in once on mount rather than looping/pulsing — this is a
 * results screen, not a live countdown (contrast CountdownRing).
 */
export function ArcadeHeroResults({
  colors,
  title,
  subtitle,
  correctCount,
  totalCount,
  ringLabel = 'ACCURACY',
  stats = [],
  extraLines = [],
  primaryLabel,
  onPrimary,
  primaryAccessibilityLabel,
  secondaryLabel,
  onSecondary,
  secondaryAccessibilityLabel,
}: ArcadeHeroResultsProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const accuracy = totalCount > 0 ? Math.min(1, Math.max(0, correctCount / totalCount)) : 0;
  const percent = Math.round(accuracy * 100);
  const isDarkMode = colors.background === darkColors.background;
  // Light mode: no gold anywhere in this ring -- red and celestial gold
  // read too close together on the parchment palette, so the top band
  // uses arcaneSoft instead (dark mode keeps the original gold).
  const topBandColor = isDarkMode ? colors.glyph : colors.arcaneSoft;
  const ringColor = accuracy < 0.5 ? colors.danger : accuracy < 0.75 ? colors.success : topBandColor;

  const size = 176;
  const strokeWidth = 14;
  const center = size / 2;
  const r = center - strokeWidth / 2 - 2;
  const circumference = 2 * Math.PI * r;

  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fill.setValue(0);
    Animated.timing(fill, {
      toValue: accuracy,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accuracy]);

  const dashoffset = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const sparkle = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, {
          toValue: 0.9,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sparkle, {
          toValue: 0.25,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sparkle]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.ringOuter, { width: size, height: size }]}>
        <Animated.View
          style={[
            styles.sparkle,
            { top: 4, left: 8, backgroundColor: colors.glyph, opacity: sparkle },
          ]}
        />
        <Animated.View
          style={[
            styles.sparkle,
            { bottom: 10, right: 2, backgroundColor: colors.arcaneSoft, opacity: sparkle },
          ]}
        />
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.ringSvg}>
          <Circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={colors.border}
            strokeWidth={strokeWidth}
          />
          <AnimatedCircle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={[styles.ringPercent, { color: ringColor }]}>{percent}%</Text>
          <Text style={styles.ringLabel}>{ringLabel}</Text>
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {stats.length > 0 && (
        <View style={styles.statRow}>
          {stats.map((stat, i) => (
            <View key={i} style={styles.statPill}>
              <Ionicons name={stat.icon} size={15} color={colors.glyph} />
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
    wrap: {
      width: '100%',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
    },
    ringOuter: { alignItems: 'center', justifyContent: 'center' },
    ringSvg: { position: 'absolute' },
    ringCenter: { alignItems: 'center', justifyContent: 'center' },
    ringPercent: { fontSize: typography.scale.xxl, fontWeight: typography.display.weight },
    ringLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      letterSpacing: 1.5,
      marginTop: 2,
    },
    sparkle: {
      position: 'absolute',
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      textAlign: 'center',
    },
    statRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    statPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    statPillText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    extraLine: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textAlign: 'center',
    },
    buttonCol: {
      width: '100%',
      maxWidth: 360,
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
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
