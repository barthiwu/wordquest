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
import { useThemeColors, useThemeStore } from '@/state/themeStore';
import { register } from '@/services/auth';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { syncPushToken } from '@/utils/pushNotifications';
import { MINIMUM_AGE_YEARS, calculateAge, toIsoDate } from '@/utils/age';
import { DobPicker } from '@/components/DobPicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Registration'>;

/**
 * Screen 3 of the UI/UX Screen Bible. Talks to the real
 * POST /api/v1/auth/register endpoint — no mock data.
 */
export function RegistrationScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const themeMode = useThemeStore((s) => s.mode);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('auth');
  const setSession = useAuthStore((s) => s.setSession);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DobPicker (native calendar / <input type="date">) can't produce an
  // invalid calendar date the old free-text MM/DD/YYYY boxes could (no
  // more Feb 30), so isValidCalendarDate no longer has anything to
  // reject here -- future-date and minimum-age are the only checks left
  // to make client-side, same reasoning as before (a fast, friendly
  // message; AuthService.register enforces the real minimum server-side
  // either way).
  const dobParts = useMemo(() => {
    if (!dobDate) return null;
    return {
      year: dobDate.getUTCFullYear(),
      month: dobDate.getUTCMonth() + 1,
      day: dobDate.getUTCDate(),
    };
  }, [dobDate]);
  const dobError = useMemo(() => {
    if (!dobDate || !dobParts) return null;
    if (dobDate.getTime() > Date.now()) {
      return t('registration.dobErrorFuture');
    }
    if (calculateAge(dobParts.year, dobParts.month, dobParts.day) < MINIMUM_AGE_YEARS) {
      return t('registration.dobErrorTooYoung', { minAge: MINIMUM_AGE_YEARS });
    }
    return null;
  }, [dobDate, dobParts, t]);
  const dobValid = dobParts !== null && dobError === null;

  const canSubmit =
    displayName.trim().length >= 2 && email.includes('@') && password.length >= 8 && dobValid;

  const dobMaximumDate = useMemo(() => new Date(), []);
  const dobMinimumDate = useMemo(() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 120);
    return d;
  }, []);

  const onSubmit = async () => {
    if (!canSubmit || submitting || !dobParts) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        dateOfBirth: toIsoDate(dobParts.year, dobParts.month, dobParts.day),
      });
      await setSession(result);
      syncPushToken(result.accessToken);
      navigation.replace('Biodata');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('registration.errorGeneric'));
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
        <Text style={styles.title}>{t('registration.title')}</Text>
        <Text style={styles.subtitle}>{t('registration.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('registration.displayNamePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          accessibilityLabel={t('registration.displayNamePlaceholder')}
        />
        <TextInput
          style={styles.input}
          placeholder={t('registration.emailPlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel={t('registration.emailPlaceholder')}
        />
        <View style={styles.passwordField}>
          <TextInput
            style={styles.passwordInput}
            placeholder={t('registration.passwordPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!isPasswordVisible}
            accessibilityLabel={t('registration.passwordPlaceholder')}
          />
          <Pressable
            style={styles.passwordToggle}
            onPress={() => setIsPasswordVisible((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={
              isPasswordVisible ? t('registration.hidePassword') : t('registration.showPassword')
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

        <View style={styles.dobBlock}>
          <Text style={styles.dobLabel}>{t('registration.dobLabel')}</Text>
          <DobPicker
            value={dobDate}
            onChange={setDobDate}
            placeholder={t('registration.dobPlaceholder')}
            doneLabel={t('registration.dobDoneButton')}
            accessibilityLabel={t('registration.dobLabel')}
            colors={colors}
            mode={themeMode}
            minimumDate={dobMinimumDate}
            maximumDate={dobMaximumDate}
          />
          <Text style={styles.dobHint}>
            {t('registration.dobHint', { minAge: MINIMUM_AGE_YEARS })}
          </Text>
          {dobError && <Text style={styles.error}>{dobError}</Text>}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityLabel={t('registration.submit')}
        >
          {submitting ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.buttonText}>{t('registration.submit')}</Text>
          )}
        </Pressable>

        <Text style={styles.legalNote}>
          {t('registration.legalNotePrefix')}
          <Text style={styles.legalLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
            {t('registration.legalLink')}
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
    error: {
      color: colors.danger,
      fontSize: typography.scale.sm,
    },
    dobBlock: { gap: spacing.xs },
    dobLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
    },
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
