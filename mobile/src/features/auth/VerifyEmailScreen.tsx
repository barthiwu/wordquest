import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { verifyEmail } from '@/services/auth';
import { useAuthStore } from '@/state/authStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;

type Status = 'verifying' | 'success' | 'error' | 'missingToken';

/**
 * The landing screen for a tapped `wordquest://verify-email?token=...`
 * link (Correction & Completion Spec §6: "mobile deep link handling") —
 * the email itself only ever contained that one deep link (see
 * EmailService.sendVerificationEmail), so this screen's whole job is to
 * take the token straight off the route params and consume it
 * automatically, no copy-pasting required. The manual "paste your code"
 * flow already in Settings (SettingsScreen) stays as the fallback for a
 * player who's on a different device than the one the email arrived on.
 */
export function VerifyEmailScreen({ route, navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('auth');
  const accessToken = useAuthStore((s) => s.accessToken);
  const token = route.params?.token;
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'missingToken');

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  const onContinue = () => {
    navigation.reset({ index: 0, routes: [{ name: accessToken ? 'Main' : 'Login' }] });
  };

  return (
    <View style={styles.container}>
      {status === 'verifying' && (
        <>
          <ActivityIndicator size="large" color={colors.arcane} />
          <Text style={styles.title}>{t('verifyEmail.verifying')}</Text>
        </>
      )}

      {status === 'success' && (
        <>
          <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          <Text style={styles.title}>{t('verifyEmail.successTitle')}</Text>
          <Text style={styles.subtitle}>{t('verifyEmail.successSubtitle')}</Text>
          <Pressable
            style={styles.button}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel={t('verifyEmail.continue')}
          >
            <Text style={styles.buttonText}>{t('verifyEmail.continue')}</Text>
          </Pressable>
        </>
      )}

      {status === 'error' && (
        <>
          <Ionicons name="alert-circle" size={56} color={colors.danger} />
          <Text style={styles.title}>{t('verifyEmail.errorTitle')}</Text>
          <Text style={styles.subtitle}>{t('verifyEmail.errorSubtitle')}</Text>
          <Pressable
            style={styles.button}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel={t('verifyEmail.continue')}
          >
            <Text style={styles.buttonText}>{t('verifyEmail.continue')}</Text>
          </Pressable>
        </>
      )}

      {status === 'missingToken' && (
        <>
          <Ionicons name="mail-open-outline" size={56} color={colors.inkMuted} />
          <Text style={styles.title}>{t('verifyEmail.missingTitle')}</Text>
          <Text style={styles.subtitle}>{t('verifyEmail.missingSubtitle')}</Text>
          <Pressable
            style={styles.button}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel={t('verifyEmail.continue')}
          >
            <Text style={styles.buttonText}>{t('verifyEmail.continue')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.xl,
      gap: spacing.md,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: typography.display.weight,
      textAlign: 'center',
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.md, textAlign: 'center' },
    button: {
      marginTop: spacing.md,
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
    },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  });
}
