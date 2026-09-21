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
import { requestPasswordReset, resetPassword } from '@/services/auth';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

type Step = 'request' | 'reset' | 'done';

/**
 * Two steps in one screen rather than two stack screens: request a
 * reset token by email, then paste the token (from the email) and a
 * new password. Deliberately never reveals whether the email exists
 * (spec: same anti-enumeration principle as login) — the "request"
 * step always succeeds from the UI's point of view.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRequest = async () => {
    if (!email.includes('@') || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setStep('reset');
    } catch {
      // Deliberately no distinguishing error — same anti-enumeration principle as login.
      setStep('reset');
    } finally {
      setSubmitting(false);
    }
  };

  const onReset = async () => {
    if (!token.trim() || newPassword.length < 8 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(token.trim(), newPassword);
      setStep('done');
    } catch {
      setError('That code is invalid or has expired. Request a new one.');
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
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>
          {step === 'request' && "We'll email you a code if that address has an account."}
          {step === 'reset' && 'Enter the code from your email and choose a new password.'}
          {step === 'done' && 'Your password has been reset.'}
        </Text>
      </View>

      {step === 'request' && (
        <View style={styles.form}>
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
          <Pressable
            style={[styles.button, !email.includes('@') && styles.buttonDisabled]}
            onPress={onRequest}
            disabled={!email.includes('@') || submitting}
            accessibilityRole="button"
            accessibilityLabel="Send code"
          >
            {submitting ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buttonText}>Send code</Text>
            )}
          </Pressable>
        </View>
      )}

      {step === 'reset' && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Reset code"
            placeholderTextColor={colors.inkMuted}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            accessibilityLabel="Reset code"
          />
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={colors.inkMuted}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            accessibilityLabel="New password"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[
              styles.button,
              (!token.trim() || newPassword.length < 8) && styles.buttonDisabled,
            ]}
            onPress={onReset}
            disabled={!token.trim() || newPassword.length < 8 || submitting}
            accessibilityRole="button"
            accessibilityLabel="Reset password"
          >
            {submitting ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buttonText}>Reset password</Text>
            )}
          </Pressable>
        </View>
      )}

      {step === 'done' && (
        <Pressable
          style={styles.button}
          onPress={() => navigation.replace('Login')}
          accessibilityRole="button"
          accessibilityLabel="Back to log in"
        >
          <Text style={styles.buttonText}>Back to log in</Text>
        </Pressable>
      )}
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
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
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
  error: { color: colors.danger, fontSize: typography.scale.sm },
  button: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
});
}
