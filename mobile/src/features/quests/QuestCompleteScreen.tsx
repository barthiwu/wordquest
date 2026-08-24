import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { FadeInUp } from '@/components/FadeInUp';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'QuestComplete'>;

/**
 * Screen 16 of the UI/UX Screen Bible. Every number shown here came
 * straight off the server's QuestSummary — nothing is recomputed
 * client-side (§41: the client cannot award itself XP or Glyphs, and it
 * doesn't get to *display* numbers it invented either).
 */
export function QuestCompleteScreen({ route, navigation }: Props) {
  const { xpAwarded, glyphAwarded, correctCount, totalCount, calibrationJustCompleted } =
    route.params;

  return (
    <View style={styles.container}>
      <FadeInUp style={styles.hero}>
        <Text style={styles.title}>Quest Complete</Text>
        <Text style={styles.subtitle}>
          {correctCount} of {totalCount} correct
        </Text>
      </FadeInUp>

      <FadeInUp style={styles.rewards} delay={150}>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardLabel}>XP earned</Text>
          <Text style={styles.rewardValue}>+{xpAwarded}</Text>
        </View>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardLabel}>Glyphs earned</Text>
          <Text style={[styles.rewardValue, { color: colors.glyph }]}>+{glyphAwarded}</Text>
        </View>
      </FadeInUp>

      {calibrationJustCompleted && (
        <FadeInUp delay={300}>
          <Pressable
            style={styles.calibrationBanner}
            onPress={() => navigation.replace('CalibrationResult')}
            accessibilityRole="button"
            accessibilityLabel="Your Learning Profile is ready"
            accessibilityHint="Opens your difficulty recommendation"
          >
            <Text style={styles.calibrationTitle}>Your Learning Profile is ready</Text>
            <Text style={styles.calibrationBody}>
              Based on your first 3 words, we have a difficulty recommendation for you — tap to see
              it.
            </Text>
          </Pressable>
        </FadeInUp>
      )}

      <Pressable
        style={styles.button}
        onPress={() => navigation.replace('Main', { screen: 'Home' })}
        accessibilityRole="button"
        accessibilityLabel="See your progress"
      >
        <Text style={styles.buttonText}>See your progress</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    justifyContent: 'space-between',
    paddingTop: spacing.xxl * 2,
    paddingBottom: spacing.xxl,
  },
  hero: { alignItems: 'center', gap: spacing.xs },
  title: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.xxl,
    fontWeight: typography.display.weight,
  },
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
  rewards: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rewardLabel: { color: colors.inkMuted, fontSize: typography.scale.md },
  rewardValue: { color: colors.success, fontSize: typography.scale.md, fontWeight: '700' },
  calibrationBanner: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.arcaneSoft,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  calibrationTitle: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
  calibrationBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
  button: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
});
