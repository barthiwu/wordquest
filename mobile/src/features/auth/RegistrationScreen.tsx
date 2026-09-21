import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { register } from '@/services/auth';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { syncPushToken } from '@/utils/pushNotifications';
import { MINIMUM_AGE_YEARS, calculateAge, isValidCalendarDate, toIsoDate } from '@/utils/age';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Registration'>;

/**
 * Screen 3 of the UI/UX Screen Bible. Talks to the real
 * POST /api/v1/auth/register endpoint — no mock data.
 */
export function RegistrationScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const setSession = useAuthStore((s) => s.setSession);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Age gate (COPPA) — client-side check for a fast, friendly message;
  // AuthService.register enforces the real minimum server-side either way.
  const dobFieldsFilled = dobMonth.length > 0 && dobDay.length > 0 && dobYear.length === 4;
  const dobError = useMemo(() => {
    if (!dobFieldsFilled) return null;
    const month = Number(dobMonth);
    const day = Number(dobDay);
    const year = Number(dobYear);
    if (!isValidCalendarDate(year, month, day)) {
      return "That date of birth doesn't look right.";
    }
    const dob = new Date(Date.UTC(year, month - 1, day));
    if (dob.getTime() > Date.now()) {
      return 'Date of birth must be in the past.';
    }
    if (calculateAge(year, month, day) < MINIMUM_AGE_YEARS) {
      return `You must be at least ${MINIMUM_AGE_YEARS} years old to create a WordQuest account.`;
    }
    return null;
  }, [dobFieldsFilled, dobMonth, dobDay, dobYear]);
  const dobValid = dobFieldsFilled && dobError === null;

  const canSubmit =
    displayName.trim().length >= 2 && email.includes('@') && password.length >= 8 && dobValid;

  const onSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        dateOfBirth: toIsoDate(Number(dobYear), Number(dobMonth), Number(dobDay)),
      });
      await setSession(result);
      syncPushToken(result.accessToken);
      navigation.replace('OnboardingIdentity');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Every Legend starts as a new player.</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Display name"
          placeholderTextColor={colors.inkMuted}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          accessibilityLabel="Display name"
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.inkMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel="Email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password (8+ characters)"
          placeholderTextColor={colors.inkMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          accessibilityLabel="Password"
        />

        <View style={styles.dobBlock}>
          <Text style={styles.dobLabel}>Date of birth</Text>
          <View style={styles.dobRow}>
            <TextInput
              style={[styles.input, styles.dobInputSmall]}
              placeholder="MM"
              placeholderTextColor={colors.inkMuted}
              value={dobMonth}
              onChangeText={(t) => setDobMonth(t.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Birth month"
            />
            <TextInput
              style={[styles.input, styles.dobInputSmall]}
              placeholder="DD"
              placeholderTextColor={colors.inkMuted}
              value={dobDay}
              onChangeText={(t) => setDobDay(t.replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Birth day"
            />
            <TextInput
              style={[styles.input, styles.dobInputLarge]}
              placeholder="YYYY"
              placeholderTextColor={colors.inkMuted}
              value={dobYear}
              onChangeText={(t) => setDobYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              accessibilityLabel="Birth year"
            />
          </View>
          <Text style={styles.dobHint}>
            You must be {MINIMUM_AGE_YEARS}+ to create a WordQuest account.
          </Text>
          {dobError && <Text style={styles.error}>{dobError}</Text>}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityLabel="Create account"
        >
          {submitting ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </Pressable>

        <Text style={styles.legalNote}>
          By creating an account, you agree to our{' '}
          <Text style={styles.legalLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </KeyboardAvoidingView>
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
  title: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: typography.scale.md,
  },
  form: { gap: spacing.md },
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
  error: {
    color: colors.danger,
    fontSize: typography.scale.sm,
  },
  dobBlock: { gap: spacing.xs },
  dobLabel: {
    color: colors.inkMuted,
    fontSize: typography.scale.sm,
  },
  dobRow: { flexDirection: 'row', gap: spacing.sm },
  dobInputSmall: { flex: 1, textAlign: 'center' },
  dobInputLarge: { flex: 1.6, textAlign: 'center' },
  dobHint: {
    color: colors.inkMuted,
    fontSize: typography.scale.xs,
  },
  legalNote: {
    color: colors.inkMuted,
    fontSize: typography.scale.xs,
    textAlign: 'center',
  },
  legalLink: {
    color: colors.arcaneSoft,
    fontWeight: '700',
  },
  button: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: colors.ink,
    fontSize: typography.scale.md,
    fontWeight: '700',
  },
});
}
