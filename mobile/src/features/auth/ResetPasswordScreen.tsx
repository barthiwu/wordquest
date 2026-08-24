import { useState } from 'react';
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
import { colors, radius, spacing, typography } from '@/constants/theme';
import { resetPassword } from '@/services/auth';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

/**
 * The landing screen for a tapped `wordquest://reset-password?token=...`
 * link (Correction & Completion Spec §6: "mobile deep link handling") —
 * the token arrives pre-filled from the route params instead of the
 * player having to copy it out of the email by hand, which is what
 * ForgotPasswordScreen's "paste your code" step still requires when
 * they're requesting a reset from a device other than the one the email
 * landed on. Kept editable (not a hidden field) so a stale or
 * mis-delivered token can still be corrected by hand.
 */
export function ResetPasswordScreen({ route, navigation }: Props) {
  const [token, setToken] = useState(route.params?.token ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = token.trim().length > 0 && newPassword.length >= 8;

  const onSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(token.trim(), newPassword);
      setDone(true);
    } catch {
      setError('That code is invalid or has expired. Request a new one.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your password has been reset.</Text>
        <Pressable
          style={styles.button}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
          accessibilityRole="button"
          accessibilityLabel="Back to log in"
        >
          <Text style={styles.buttonText}>Back to log in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Choose a new password</Text>
        <Text style={styles.subtitle}>
          Confirm the code from your email if it isn&apos;t already filled in.
        </Text>
      </View>

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
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
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
    </KeyboardAvoidingView>
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
