import { useEffect, useMemo, useRef, useState } from 'react';
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
import { updateMe, checkUsernameAvailability } from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import { CountryPickerField } from '@/components/CountryPickerField';
import { LanguagePickerField } from '@/components/LanguagePickerField';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Biodata'>;

/**
 * Screen 5 of the UI/UX Screen Bible (Barth, Sept 2026 — replaces the old
 * country-only OnboardingIdentityScreen). First stop after registration:
 * username, country and language, all in one screen, then on to the
 * existing Goal and Clan Selection steps unchanged.
 *
 * - username: registration already generated a random placeholder
 *   (see generateDefaultUsername server-side), so this starts prefilled
 *   with it rather than blank — the player is picking a real handle, not
 *   starting from nothing. Live-availability check mirrors Settings'
 *   Profile section exactly (same 450ms debounce, same USERNAME_FORMAT).
 * - country: unchanged, via CountryPickerField.
 * - language: "language (for the game)" is nativeLanguage — the language
 *   ALI explains and guides in (Settings' LanguageScreen). WordQuest
 *   always teaches English, so this is not a vocabulary/target-language
 *   picker.
 *
 * Age range for starting difficulty is derived server-side from the
 * exact dateOfBirth already collected at registration (common/age.ts's
 * getAgeRange) — nothing new to collect here.
 */
export function BiodataScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('onboarding');
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [usernameDraft, setUsernameDraft] = useState(user?.username ?? '');
  const [usernameCheck, setUsernameCheck] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const usernameCheckSeq = useRef(0);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [nativeLanguage, setNativeLanguage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same format Settings' Profile section already checks against —
  // duplicated locally (not exported from services/users.ts) rather than
  // introducing a new shared constant for a two-line regex.
  const USERNAME_FORMAT = /^[a-z0-9_]{3,20}$/;

  useEffect(() => {
    if (!accessToken) return;
    const candidate = usernameDraft.trim().toLowerCase();
    if (candidate === (user?.username ?? '')) {
      setUsernameCheck('idle');
      return;
    }
    if (!USERNAME_FORMAT.test(candidate)) {
      setUsernameCheck('invalid');
      return;
    }
    setUsernameCheck('checking');
    const seq = ++usernameCheckSeq.current;
    const timer = setTimeout(async () => {
      try {
        const { available } = await checkUsernameAvailability(accessToken, candidate);
        if (usernameCheckSeq.current === seq) setUsernameCheck(available ? 'available' : 'taken');
      } catch {
        if (usernameCheckSeq.current === seq) setUsernameCheck('idle');
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [usernameDraft, accessToken, user?.username]);

  const usernameBlocksSubmit =
    usernameCheck === 'invalid' || usernameCheck === 'taken' || usernameCheck === 'checking';
  const canSubmit =
    usernameDraft.trim().length > 0 &&
    !usernameBlocksSubmit &&
    countryCode !== null &&
    nativeLanguage !== null;

  const onContinue = async () => {
    if (!canSubmit || !accessToken || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const normalizedUsername = usernameDraft.trim().toLowerCase();
      const updated = await updateMe(accessToken, {
        username: normalizedUsername,
        countryCode,
        nativeLanguage,
      });
      updateUser({ username: updated.username });
      navigation.navigate('OnboardingGoal');
    } catch (err) {
      setError(
        err instanceof Error && err.message.toLowerCase().includes('taken')
          ? t('biodata.errorTaken')
          : t('biodata.errorGeneric'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const usernameHint =
    usernameCheck === 'checking'
      ? t('biodata.usernameChecking')
      : usernameCheck === 'taken'
        ? t('biodata.usernameTaken')
        : usernameCheck === 'invalid'
          ? t('biodata.usernameInvalid')
          : usernameCheck === 'available'
            ? t('biodata.usernameAvailable')
            : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.step}>{t('biodata.step')}</Text>
        <Text style={styles.title}>{t('biodata.title')}</Text>
        <Text style={styles.subtitle}>{t('biodata.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('biodata.usernameLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('biodata.usernamePlaceholder')}
            placeholderTextColor={colors.inkMuted}
            value={usernameDraft}
            onChangeText={setUsernameDraft}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('biodata.usernameLabel')}
          />
          {usernameHint && (
            <Text style={usernameCheck === 'available' ? styles.hintOk : styles.hint}>
              {usernameHint}
            </Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('biodata.countryLabel')}</Text>
          <CountryPickerField value={countryCode} onChange={setCountryCode} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('biodata.languageLabel')}</Text>
          <LanguagePickerField value={nativeLanguage} onChange={setNativeLanguage} />
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={onContinue}
        disabled={!canSubmit || submitting}
        accessibilityRole="button"
        accessibilityLabel={t('biodata.continue')}
      >
        {submitting ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Text style={styles.buttonText}>{t('biodata.continue')}</Text>
        )}
      </Pressable>
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
    step: { color: colors.arcaneSoft, fontSize: typography.scale.xs, fontWeight: '700' },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
    form: { gap: spacing.lg },
    field: { gap: spacing.xs },
    label: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
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
    hint: { color: colors.inkMuted, fontSize: typography.scale.xs },
    hintOk: { color: colors.arcaneSoft, fontSize: typography.scale.xs },
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
