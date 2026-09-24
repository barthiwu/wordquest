import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { journeyVisualFor } from '@/constants/journeyVisuals';
import { JourneyMotif } from '@/components/JourneyMotif';
import { AliMarkHero } from '@/components/AliMark';
import type { JourneyStageView } from '@/services/journey';

interface Props {
  currentStage: JourneyStageView;
  onPress: () => void;
}

/**
 * Home's hero: a compact excerpt of the player's actual Journey map —
 * same gradient wash + per-stage motif scatter as JourneyScreen's own
 * "current stage" card (constants/journeyVisuals.ts), so Home reads as
 * a window onto the same world Journey shows in full, not a generic
 * stats dashboard bolted on top (Sept 2026 homepage redesign). ALI's
 * hero mark stands in the corner as a guide, inviting the tap into
 * Journey rather than narrating anything — the map excerpt IS the
 * invitation.
 */
export function JourneyMapExcerpt({ currentStage, onPress }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const visual = journeyVisualFor(currentStage.key);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your Journey: ${currentStage.name}, ${currentStage.primaryTitle}`}
      accessibilityHint="Opens your full Journey map"
    >
      <LinearGradient
        colors={visual.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: visual.color }]}
      >
        <JourneyMotif icons={visual.motif} color={visual.color} />

        <View style={styles.aliCorner}>
          <AliMarkHero size={40} />
        </View>

        <View style={styles.header}>
          <View style={[styles.badge, { borderColor: visual.color }]}>
            <Ionicons name={visual.icon} size={20} color={visual.color} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Your Journey</Text>
            <Text style={[styles.stageName, { color: visual.color }]}>{currentStage.name}</Text>
            <Text style={styles.stageTitle}>{currentStage.primaryTitle}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.continueText}>Continue your journey</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.ink} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      borderWidth: 2,
      padding: spacing.lg,
      gap: spacing.md,
      overflow: 'hidden',
    },
    aliCorner: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.md,
      opacity: 0.9,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1, gap: 1 },
    eyebrow: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    stageName: { fontSize: typography.scale.lg, fontWeight: typography.display.weight },
    stageTitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
    footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    continueText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600' },
  });
}
