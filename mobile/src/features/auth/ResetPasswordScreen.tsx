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
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('auth');
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
      setError(t('resetPassword.errorInvalidCode'));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('resetPassword.doneTitle')}</Text>
        <Pressable
          style={styles.button}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
          accessibilityRole="button"
          accessibilityLabel={t('resetPassword.backToLogin')}
        >
          <Text style={styles.buttonText}>{t('resetPassword.backToLogin')}</Text>
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
        <Text style={styles.title}>{t('resetPassword.title')}</Text>
        <Text style={styles.subtitle}>{t('resetPassword.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('resetPassword.tokenPlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          accessibilityLabel={t('resetPassword.tokenPlaceholder')}
        />
        <TextInput
          style={styles.input}
          placeholder={t('resetPassword.newPasswordPlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          accessibilityLabel={t('resetPassword.newPasswordPlaceholder')}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityLabel={t('resetPassword.submit')}
        >
          {submitting ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>{t('resetPassword.submit')}</Text>
          )}
        </Pressable>
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
