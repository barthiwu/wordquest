import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { deleteAccount } from '@/services/auth';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

const APP_VERSION = '0.1.0';

/**
 * Settings > About. Hosts WordQuest's legal documents (Privacy Policy,
 * Terms of Service, Age Restriction) plus account deletion — grouped
 * here per the Sept 2026 request, rather than deletion sitting in
 * Settings' own "Danger zone" the way it used to. The account-deletion
 * logic itself is unchanged from the old SettingsScreen implementation,
 * just relocated.
 *
 * i18n note: only this screen's own chrome (title, section headers,
 * row labels, the delete-account dialog) is translated here. The
 * legal document BODIES themselves (Privacy Policy, Terms of Service,
 * Age Restriction) are explicitly out of scope for this pass — see
 * src/i18n/index.ts's doc comment.
 */
export function AboutScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('settings');
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDeleteAccount = () => {
    Alert.alert(t('about.deleteConfirmTitle'), t('about.deleteConfirmMessage'), [
      { text: t('about.deleteConfirmCancel'), style: 'cancel' },
      {
        text: t('about.deleteConfirmDelete'),
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return;
          setBusy(true);
          try {
            await deleteAccount(accessToken);
            await clearSession();
            navigation.replace('Login');
          } catch {
            setMessage(t('about.errorDelete'));
            setBusy(false);
          }
        },
      },
    ]);
  };

  const legalRows: Array<{ id: string; label: string; onPress: () => void }> = [
    {
      id: 'privacy',
      label: t('about.privacyPolicy'),
      onPress: () => navigation.navigate('PrivacyPolicy'),
    },
    {
      id: 'terms',
      label: t('about.termsOfService'),
      onPress: () => navigation.navigate('TermsOfService'),
    },
    {
      id: 'age',
      label: t('about.ageRestriction'),
      onPress: () => navigation.navigate('AgeRestriction'),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('about.title')}</Text>

      <View style={styles.appInfo}>
        <Text style={styles.appName}>{t('about.appName')}</Text>
        <Text style={styles.appVersion}>{t('about.version', { version: APP_VERSION })}</Text>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('about.legalSection')}</Text>
        {legalRows.map((row) => (
          <Pressable
            key={row.id}
            style={styles.row}
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityLabel={row.label}
          >
            <Text style={styles.rowText}>{row.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('about.dangerZoneSection')}</Text>
        <Pressable
          style={styles.dangerButton}
          onPress={onDeleteAccount}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('about.deleteAccount')}
          accessibilityHint={t('about.deleteAccountHint')}
        >
          {busy ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.dangerButtonText}>{t('about.deleteAccount')}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.lg },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    appInfo: { gap: 2 },
    appName: { color: colors.ink, fontSize: typography.scale.lg, fontWeight: '700' },
    appVersion: { color: colors.inkMuted, fontSize: typography.scale.sm },
    message: { color: colors.arcaneSoft, fontSize: typography.scale.sm },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sectionTitle: {
      color: colors.ink,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    rowText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '600' },
    dangerButton: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.danger,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    dangerButtonText: { color: colors.danger, fontSize: typography.scale.md, fontWeight: '700' },
  });
}
