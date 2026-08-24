import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { updateMe } from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingIdentity'>;

/**
 * Screen 5 of the UI/UX Screen Bible. Country code drives the animated
 * flag at the player's Castle later (§18) — collected once, here.
 */
export function OnboardingIdentityScreen({ navigation }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [countryCode, setCountryCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = /^[A-Za-z]{2}$/.test(countryCode);

  const onContinue = async () => {
    if (!canSubmit || !accessToken || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateMe(accessToken, { countryCode: countryCode.toUpperCase() });
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

      <TextInput
        style={styles.input}
        placeholder="Country code, e.g. NG"
        placeholderTextColor={colors.inkMuted}
        value={countryCode}
        onChangeText={(v) => setCountryCode(v.slice(0, 2))}
        autoCapitalize="characters"
        maxLength={2}
        accessibilityLabel="Country code"
      />

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl * 1.5,
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
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.ink,
    fontSize: typography.scale.md,
  },
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
