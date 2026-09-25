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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('auth');
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
      setError(t('forgotPassword.errorInvalidCode'));
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
        <Text style={styles.title}>{t('forgotPassword.title')}</Text>
        <Text style={styles.subtitle}>
          {step === 'request' && t('forgotPassword.subtitleRequest')}
          {step === 'reset' && t('forgotPassword.subtitleReset')}
          {step === 'done' && t('forgotPassword.subtitleDone')}
        </Text>
      </View>

      {step === 'request' && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t('forgotPassword.emailPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            accessibilityLabel={t('forgotPassword.emailPlaceholder')}
          />
          <Pressable
            style={[styles.button, !email.includes('@') && styles.buttonDisabled]}
            onPress={onRequest}
            disabled={!email.includes('@') || submitting}
            accessibilityRole="button"
            accessibilityLabel={t('forgotPassword.sendCode')}
          >
            {submitting ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buttonText}>{t('forgotPassword.sendCode')}</Text>
            )}
          </Pressable>
        </View>
      )}

      {step === 'reset' && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t('forgotPassword.tokenPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            accessibilityLabel={t('forgotPassword.tokenPlaceholder')}
          />
          <TextInput
            style={styles.input}
            placeholder={t('forgotPassword.newPasswordPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            accessibilityLabel={t('forgotPassword.newPasswordPlaceholder')}
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
            accessibilityLabel={t('forgotPassword.resetPassword')}
          >
            {submitting ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buttonText}>{t('forgotPassword.resetPassword')}</Text>
            )}
          </Pressable>
        </View>
      )}

      {step === 'done' && (
        <Pressable
          style={styles.button}
          onPress={() => navigation.replace('Login')}
          accessibilityRole="button"
          accessibilityLabel={t('forgotPassword.backToLogin')}
        >
          <Text style={styles.buttonText}>{t('forgotPassword.backToLogin')}</Text>
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
