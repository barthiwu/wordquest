import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { updateMe, type LearningGoal } from '@/services/users';
import { getDeviceTimezone } from '@/utils/timezone';
import { useAuthStore } from '@/state/authStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingGoal'>;

const GOALS: { value: LearningGoal; label: string; description: string }[] = [
  { value: 'CASUAL', label: 'Just for fun', description: 'Learn at a relaxed pace.' },
  {
    value: 'TRAVEL',
    label: 'Upcoming travel',
    description: 'Focus on everyday, practical phrases.',
  },
  {
    value: 'ACADEMIC',
    label: 'School or study',
    description: 'Build a strong grammar foundation.',
  },
  { value: 'CAREER', label: 'Work', description: 'Vocabulary for professional settings.' },
  { value: 'FLUENCY', label: 'Full fluency', description: 'Go all the way, at any pace it takes.' },
];

/** Screen 6 of the UI/UX Screen Bible. */
export function OnboardingGoalScreen({ navigation }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [selected, setSelected] = useState<LearningGoal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinue = async () => {
    if (!selected || !accessToken || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateMe(accessToken, {
        learningGoal: selected,
        targetLanguage: 'fr',
        nativeLanguage: 'en',
        completeOnboarding: true,
        // Best-effort — the device's own IANA timezone name, so the
        // server can compute quest windows / streaks in the player's
        // actual local time (Player Timezone System, V1 Remaining
        // Systems Spec §15) instead of falling back to UTC. Never blocks
        // onboarding: if this throws, updateMe below still runs as normal.
        timezone: getDeviceTimezone(),
      });
      navigation.navigate('ClanSelection');
    } catch {
      setError('Something went wrong saving your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.step}>Step 2 of 2</Text>
        <Text style={styles.title}>What brings you to WordQuest?</Text>
      </View>

      <View style={styles.list}>
        {GOALS.map((goal) => (
          <Pressable
            key={goal.value}
            style={[styles.card, selected === goal.value && styles.cardSelected]}
            onPress={() => setSelected(goal.value)}
            accessibilityRole="button"
            accessibilityLabel={goal.label}
          >
            <Text style={styles.cardLabel}>{goal.label}</Text>
            <Text style={styles.cardDescription}>{goal.description}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={onContinue}
        disabled={!selected || submitting}
        accessibilityRole="button"
        accessibilityLabel="Continue"
      >
        {submitting ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Text style={styles.buttonText}>Continue</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl * 1.5,
    gap: spacing.lg,
  },
  header: { gap: spacing.xs },
  step: { color: colors.arcaneSoft, fontSize: typography.scale.xs, fontWeight: '700' },
  title: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  cardSelected: { borderColor: colors.arcane, backgroundColor: colors.surfaceRaised },
  cardLabel: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  cardDescription: { color: colors.inkMuted, fontSize: typography.scale.sm },
  button: {
    marginTop: 'auto',
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  error: { color: colors.danger, fontSize: typography.scale.sm },
});
