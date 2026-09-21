import { useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { updateMe } from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import { CountryPickerField } from '@/components/CountryPickerField';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingIdentity'>;

/**
 * Screen 5 of the UI/UX Screen Bible. Country code drives the animated
 * flag at the player's Castle later (§18) — collected once, here.
 */
export function OnboardingIdentityScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = countryCode !== null;

  const onContinue = async () => {
    if (countryCode === null || !accessToken || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateMe(accessToken, { countryCode });
      navigation.navigate('OnboardingGoal');
    } catch {
      setError('Something went wrong saving your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.step}>Step 1 of 2</Text>
        <Text style={styles.title}>Where are you playing from?</Text>
        <Text style={styles.subtitle}>
          Your country’s flag will wave at your Castle once you build it.
        </Text>
      </View>

      <CountryPickerField value={countryCode} onChange={setCountryCode} label="Country" />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={onContinue}
        disabled={!canSubmit || submitting}
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

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: topInset + spacing.xxl * 1.5,
    gap: spacing.xl,
  },
  header: { gap: spacing.xs },
  step: { color: colors.arcaneSoft, fontSize: typography.scale.xs, fontWeight: '700' },
  title: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
  button: {
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
