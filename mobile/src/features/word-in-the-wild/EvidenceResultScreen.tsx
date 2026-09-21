import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { FadeInUp } from '@/components/FadeInUp';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'EvidenceResult'>;

/**
 * A REJECTED result is deliberately not framed as a failure state — no
 * mastery or XP was ever at risk (WordInTheWildService never demotes on
 * rejection), so this just explains why and lets the player try again
 * with better evidence next time.
 */
export function EvidenceResultScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const submission = route.params;
  const approved = submission.assessmentStatus === 'APPROVED';

  return (
    <View style={styles.container}>
      <FadeInUp
        style={[
          styles.badge,
          { backgroundColor: approved ? colors.success : colors.surfaceRaised },
        ]}
      >
        <Text style={styles.badgeText}>{approved ? 'Approved!' : 'Not quite'}</Text>
      </FadeInUp>

      {submission.assessmentReasoning && (
        <Text style={styles.reasoning}>{submission.assessmentReasoning}</Text>
      )}

      {approved && (
        <FadeInUp style={styles.rewardsRow} delay={150}>
          <Text style={styles.rewardValue}>+{submission.xpAwarded} XP</Text>
        </FadeInUp>
      )}

      <Pressable
        style={styles.doneButton}
        onPress={() => navigation.replace('Main', { screen: 'Journey' })}
        accessibilityRole="button"
        accessibilityLabel="Done"
      >
        <Text style={styles.doneButtonText}>Done</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: topInset + spacing.xl,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  badge: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  badgeText: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  reasoning: { color: colors.inkMuted, fontSize: typography.scale.md, textAlign: 'center' },
  rewardsRow: { alignItems: 'center' },
  rewardValue: { color: colors.glyph, fontSize: typography.scale.lg, fontWeight: '700' },
  doneButton: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  doneButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
});
}
