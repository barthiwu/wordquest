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
 */
export function AboutScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'Your account will be deactivated. You can recover it later from the login screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) return;
            setBusy(true);
            try {
              await deleteAccount(accessToken);
              await clearSession();
              navigation.replace('Login');
            } catch {
              setMessage('Could not delete your account right now.');
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const legalRows: Array<{ label: string; onPress: () => void }> = [
    { label: 'Privacy Policy', onPress: () => navigation.navigate('PrivacyPolicy') },
    { label: 'Terms of Service', onPress: () => navigation.navigate('TermsOfService') },
    { label: 'Age Restriction', onPress: () => navigation.navigate('AgeRestriction') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>About</Text>

      <View style={styles.appInfo}>
        <Text style={styles.appName}>WordQuest</Text>
        <Text style={styles.appVersion}>Version {APP_VERSION}</Text>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal</Text>
        {legalRows.map((row) => (
          <Pressable
            key={row.label}
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
        <Text style={styles.sectionTitle}>Danger zone</Text>
        <Pressable
          style={styles.dangerButton}
          onPress={onDeleteAccount}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityHint="Deactivates your account; can be recovered later from the login screen"
        >
          {busy ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.dangerButtonText}>Delete account</Text>
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
