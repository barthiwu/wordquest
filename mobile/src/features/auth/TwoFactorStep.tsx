import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useIsPrototype } from '@/state/uiVersionStore';
import { AliScene } from '@/features/proto/ui/AliScene';
import { AuthPrimaryButton } from './AuthPrimaryButton';

/**
 * Second step of sign-in for accounts with two-step verification: the
 * 6-digit authenticator code, or one of the one-time recovery codes.
 */
export function TwoFactorStep({
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  onSubmit: (code: string) => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const colors = useThemeColors();
  const proto = useIsPrototype();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const canSubmit = code.replace(/[\s-]/g, '').length >= 6;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {proto ? (
        <AliScene variant="forest" height={170} expression="CURIOUS" message={t('twoFactor.aliBubble')} style={styles.scene} />
      ) : null}
      <View style={styles.header}>
        <Text style={styles.title}>{t('twoFactor.title')}</Text>
        <Text style={styles.subtitle}>{t('twoFactor.subtitle')}</Text>
      </View>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('twoFactor.codePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={16}
          autoFocus
          onSubmitEditing={() => canSubmit && !submitting && onSubmit(code)}
          accessibilityLabel={t('twoFactor.codePlaceholder')}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AuthPrimaryButton label={t('twoFactor.submit')} onPress={() => onSubmit(code)} disabled={!canSubmit} loading={submitting} />
        <Text style={styles.hint}>{t('twoFactor.recoveryHint')}</Text>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('twoFactor.back')}>
          <Text style={styles.link}>{t('twoFactor.back')}</Text>
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
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      color: colors.ink,
      fontSize: typography.scale.lg,
      letterSpacing: 4,
      textAlign: 'center',
    },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    hint: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    link: { color: colors.arcaneSoft, fontSize: typography.scale.sm, textAlign: 'center' },
  });
}
