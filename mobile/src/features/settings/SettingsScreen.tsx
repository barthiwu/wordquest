import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { useSelectedLanguage } from '@/state/languageStore';
import { logout } from '@/services/auth';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/**
 * Settings — MVP-listed in BUILD_HANDOFF §6 but never built. Hosts the
 * account-lifecycle actions the rest of the app has nowhere else to
 * put: logout (which revokes the refresh token server-side, not just
 * clears local storage). Language preference lives here too; legal
 * documents and account deletion moved to their own About screen (Sept
 * 2026 request) rather than crowding this one.
 *
 * Redesign (Sept 2026, Barth, "Settings Option B"): editing your name,
 * username, profile picture and email verification used to all live
 * inline on this screen. They're now one tap away on their own Profile
 * screen (ProfileSettingsScreen) -- this screen shows an identity-card
 * row instead (avatar + name + @username), like an iOS "Apple ID" card,
 * so there's an at-a-glance identity check before diving into the rest
 * of settings.
 */
export function SettingsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('settings');
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);
  const selectedLanguage = useSelectedLanguage();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      if (refreshToken) await logout(refreshToken);
    } catch {
      // A failed revoke call shouldn't trap the player in a session they're trying to leave.
    } finally {
      await clearSession();
      navigation.replace('Login');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('title')}</Text>

      <Pressable
        style={styles.profileCard}
        onPress={() => navigation.navigate('ProfileSettings')}
        accessibilityRole="button"
        accessibilityLabel={t('profileSection')}
      >
        {user?.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.profileCardAvatarImage} />
        ) : (
          <View style={styles.profileCardAvatarPlaceholder}>
            <Text style={styles.profileCardAvatarInitial}>
              {user?.displayName?.trim().charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={styles.profileCardText}>
          <Text style={styles.profileCardName} numberOfLines={1}>
            {user?.displayName ?? t('profileSection')}
          </Text>
          {user?.username && (
            <Text style={styles.profileCardUsername} numberOfLines={1}>
              @{user.username}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('sessionSection')}</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={onLogout}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel={t('logOut')}
        >
          {loggingOut ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t('logOut')}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('preferencesSection')}</Text>
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('Language')}
          accessibilityRole="button"
          accessibilityLabel={t('languageRowLabel', { language: selectedLanguage.name })}
        >
          <Text style={styles.rowText}>{t('languageRow')}</Text>
          <View style={styles.rowValue}>
            <Text style={styles.rowValueText}>{selectedLanguage.name}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </View>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('moreSection')}</Text>
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('SendFeedback')}
          accessibilityRole="button"
          accessibilityLabel={t('sendFeedbackRow')}
        >
          <Text style={styles.rowText}>{t('sendFeedbackRow')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('About')}
          accessibilityRole="button"
          accessibilityLabel={t('aboutRow')}
        >
          <Text style={styles.rowText}>{t('aboutRow')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
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
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    profileCardAvatarImage: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surface,
    },
    profileCardAvatarPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileCardAvatarInitial: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      fontWeight: typography.display.weight,
    },
    profileCardText: { flex: 1, gap: 2, minWidth: 0 },
    profileCardName: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: typography.display.weight,
    },
    profileCardUsername: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '600',
    },
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
    secondaryButton: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: '700',
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
    rowValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    rowValueText: { color: colors.inkMuted, fontSize: typography.scale.sm },
  });
}
