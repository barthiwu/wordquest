import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemeStore } from '@/state/themeStore';
import { useIsPrototype } from '@/state/uiVersionStore';
import { MINIMUM_AGE_YEARS, calculateAge, toIsoDate } from '@/utils/age';
import { DobPicker } from '@/components/DobPicker';
import { AliScene } from '@/features/proto/ui/AliScene';
import { AuthPrimaryButton } from './AuthPrimaryButton';

/** Shown when a Google/Apple/Facebook sign-in would create a NEW account: the same age gate as email sign-up. */
export function SocialDobStep({
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  onSubmit: (isoDate: string) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const colors = useThemeColors();
  const mode = useThemeStore((s) => s.mode);
  const proto = useIsPrototype();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('auth');
  const [dob, setDob] = useState<Date | null>(null);

  const parts = dob ? { y: dob.getUTCFullYear(), m: dob.getUTCMonth() + 1, d: dob.getUTCDate() } : null;
  const dobError = useMemo(() => {
    if (!dob || !parts) return null;
    if (dob.getTime() > Date.now()) return t('registration.dobErrorFuture');
    if (calculateAge(parts.y, parts.m, parts.d) < MINIMUM_AGE_YEARS) {
      return t('registration.dobErrorTooYoung', { minAge: MINIMUM_AGE_YEARS });
    }
    return null;
  }, [dob, parts, t]);
  const valid = parts !== null && dobError === null;
  const maximumDate = useMemo(() => new Date(), []);
  const minimumDate = useMemo(() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 120);
    return d;
  }, []);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {proto ? (
        <AliScene variant="forest" height={170} expression="PLEASED" message={t('social.dobBubble')} style={styles.scene} />
      ) : null}
      <View style={styles.header}>
        <Text style={styles.title}>{t('social.dobTitle')}</Text>
        <Text style={styles.subtitle}>{t('social.dobSubtitle')}</Text>
      </View>
      <View style={styles.form}>
        <DobPicker
          value={dob}
          onChange={setDob}
          placeholder={t('registration.dobPlaceholder')}
          doneLabel={t('registration.dobDoneButton')}
          accessibilityLabel={t('registration.dobLabel')}
          colors={colors}
          mode={mode}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
        <Text style={styles.hint}>{t('registration.dobHint', { minAge: MINIMUM_AGE_YEARS })}</Text>
        {dobError ? <Text style={styles.error}>{dobError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AuthPrimaryButton
          label={t('social.dobSubmit')}
          onPress={() => parts && onSubmit(toIsoDate(parts.y, parts.m, parts.d))}
          disabled={!valid}
          loading={submitting}
        />
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('social.cancel')}>
          <Text style={styles.link}>{t('social.cancel')}</Text>
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
      paddingTop: topInset + spacing.xxl,
      gap: spacing.xl,
    },
    scene: { borderRadius: 20, overflow: 'hidden' },
    header: { gap: spacing.xs },
    title: { color: colors.ink, fontSize: typography.scale.xl, fontWeight: typography.display.weight },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
    form: { gap: spacing.md },
    hint: { color: colors.inkMuted, fontSize: typography.scale.sm },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    link: { color: colors.arcaneSoft, fontSize: typography.scale.sm, textAlign: 'center' },
  });
}
