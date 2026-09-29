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
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { login } from '@/services/auth';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { syncPushToken } from '@/utils/pushNotifications';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('auth');
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const canSubmit = email.includes('@') && password.length > 0;

  const onSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await login({ email: email.trim(), password });
      await setSession(result);
      syncPushToken(result.accessToken);
      navigation.replace('Main');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? t('login.errorIncorrect')
          : t('login.errorGeneric'),
      );
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
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('login.emailPlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel={t('login.emailPlaceholder')}
        />
        <View style={styles.passwordField}>
          <TextInput
            style={styles.passwordInput}
            placeholder={t('login.passwordPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!isPasswordVisible}
            accessibilityLabel={t('login.passwordPlaceholder')}
          />
          <Pressable
            style={styles.passwordToggle}
            onPress={() => setIsPasswordVisible((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={
              isPasswordVisible ? t('login.hidePassword') : t('login.showPassword')
            }
            hitSlop={8}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off' : 'eye'}
              size={20}
              color={colors.inkMuted}
            />
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityLabel={t('login.submit')}
        >
          {submitting ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>{t('login.submit')}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('ForgotPassword')}
          accessibilityRole="button"
          accessibilityLabel={t('login.forgotPassword')}
          accessibilityHint={t('login.forgotPasswordHint')}
        >
          <Text style={styles.link}>{t('login.forgotPassword')}</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('RecoverAccount')}
          accessibilityRole="button"
          accessibilityLabel={t('login.recoverAccount')}
        >
          <Text style={styles.link}>{t('login.recoverAccount')}</Text>
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
    passwordField: {
      justifyContent: 'center',
    },
    passwordInput: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      paddingRight: spacing.xxl,
      color: colors.ink,
      fontSize: typography.scale.md,
    },
    passwordToggle: {
      position: 'absolute',
      right: spacing.md,
      padding: spacing.xs,
    },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    link: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      textAlign: 'center',
      marginTop: spacing.xs,
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
