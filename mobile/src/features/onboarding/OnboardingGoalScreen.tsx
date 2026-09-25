import { useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { updateMe, type LearningGoal } from '@/services/users';
import { getDeviceTimezone } from '@/utils/timezone';
import { useAuthStore } from '@/state/authStore';
import { useLanguageStore } from '@/state/languageStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingGoal'>;

// Translation keys live under onboarding:goal.goals.<key> -- see the
// GOALS memo below, which resolves label/description through t() so
// this list itself stays static (no hooks outside a component).
const GOAL_VALUES: { value: LearningGoal; key: string }[] = [
  { value: 'CASUAL', key: 'casual' },
  { value: 'TRAVEL', key: 'travel' },
  { value: 'ACADEMIC', key: 'academic' },
  { value: 'CAREER', key: 'career' },
  { value: 'FLUENCY', key: 'fluency' },
];

/** Screen 6 of the UI/UX Screen Bible. */
export function OnboardingGoalScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('onboarding');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [selected, setSelected] = useState<LearningGoal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goals = useMemo(
    () =>
      GOAL_VALUES.map((g) => ({
        value: g.value,
        label: t(`goal.goals.${g.key}.label`),
        description: t(`goal.goals.${g.key}.description`),
      })),
    [t],
  );

  const onContinue = async () => {
    if (!selected || !accessToken || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateMe(accessToken, {
        learningGoal: selected,
        // WordQuest only ever teaches English vocabulary -- there is no
        // per-player choice of *what* to learn, so this is a constant,
        // not a placeholder (it was previously hardcoded to 'fr', which
        // was simply wrong -- nothing in the app ever taught French).
        targetLanguage: 'en',
        // The language the player already understands, so ALI's remarks
        // and quest feedback can eventually be given in a language
        // they're comfortable in while the words/sentences they're
        // learning stay in English (see Settings > Language). Whatever
        // they've picked there before finishing onboarding; English
        // until they do.
        nativeLanguage: useLanguageStore.getState().code,
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
      setError(t('goal.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.step}>{t('goal.step')}</Text>
        <Text style={styles.title}>{t('goal.title')}</Text>
      </View>

      <View style={styles.list}>
        {goals.map((goal) => (
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
        accessibilityLabel={t('goal.continue')}
      >
        {submitting ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Text style={styles.buttonText}>{t('goal.continue')}</Text>
        )}
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
      paddingTop: topInset + spacing.xxl * 1.5,
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
}
