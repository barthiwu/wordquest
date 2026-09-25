import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useSelectedLanguage } from '@/state/languageStore';
import { logout, resendVerification, verifyEmail } from '@/services/auth';
import { updateMe, checkUsernameAvailability } from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/**
 * Settings — MVP-listed in BUILD_HANDOFF §6 but never built. Hosts the
 * account-lifecycle actions the rest of the app has nowhere else to
 * put: email verification and logout (which revokes the refresh token
 * server-side, not just clears local storage). Language preference
 * lives here too; legal documents and account deletion moved to their
 * own About screen (Sept 2026 request) rather than crowding this one.
 */
export function SettingsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('settings');
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const selectedLanguage = useSelectedLanguage();
  const [verifyToken, setVerifyToken] = useState('');
  const [busy, setBusy] = useState<'resend' | 'verify' | 'logout' | 'profile' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Profile (display name + public username) -- local drafts so typing
  // doesn't touch the authoritative authStore value until Save succeeds.
  const [displayNameDraft, setDisplayNameDraft] = useState(user?.displayName ?? '');
  const [usernameDraft, setUsernameDraft] = useState(user?.username ?? '');
  const [usernameCheck, setUsernameCheck] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const usernameCheckSeq = useRef(0);

  useEffect(() => {
    setDisplayNameDraft(user?.displayName ?? '');
    setUsernameDraft(user?.username ?? '');
  }, [user?.displayName, user?.username]);

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

  const profileDirty =
    displayNameDraft.trim() !== (user?.displayName ?? '') ||
    usernameDraft.trim().toLowerCase() !== (user?.username ?? '');
  const usernameBlocksSave =
    usernameCheck === 'invalid' || usernameCheck === 'taken' || usernameCheck === 'checking';

  const onSaveProfile = async () => {
    if (!accessToken || !profileDirty || usernameBlocksSave) return;
    setBusy('profile');
    setMessage(null);
    try {
      const patch: { displayName?: string; username?: string } = {};
      if (displayNameDraft.trim() !== (user?.displayName ?? ''))
        patch.displayName = displayNameDraft.trim();
      const normalizedUsername = usernameDraft.trim().toLowerCase();
      if (normalizedUsername !== (user?.username ?? '')) patch.username = normalizedUsername;

      const updated = await updateMe(accessToken, patch);
      updateUser({ displayName: updated.displayName, username: updated.username });
      setUsernameCheck('idle');
      setMessage(t('messageProfileUpdated'));
    } catch (err) {
      setMessage(
        err instanceof Error && err.message.toLowerCase().includes('taken')
          ? t('errorUsernameTaken')
          : t('errorProfileSave'),
      );
    } finally {
      setBusy(null);
    }
  };

  const onLogout = async () => {
    setBusy('logout');
    try {
      if (refreshToken) await logout(refreshToken);
    } catch {
      // A failed revoke call shouldn't trap the player in a session they're trying to leave.
    } finally {
      await clearSession();
      navigation.replace('Login');
    }
  };

  const onResendVerification = async () => {
    if (!accessToken) return;
    setBusy('resend');
    setMessage(null);
    try {
      await resendVerification(accessToken);
      setMessage(t('messageVerificationSent'));
    } catch {
      setMessage(t('errorVerificationSend'));
    } finally {
      setBusy(null);
    }
  };

  const onVerifyEmail = async () => {
    if (!verifyToken.trim()) return;
    setBusy('verify');
    setMessage(null);
    try {
      await verifyEmail(verifyToken.trim());
      setMessage(t('messageEmailVerified'));
      setVerifyToken('');
    } catch {
      setMessage(t('errorVerificationInvalid'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('title')}</Text>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profileSection')}</Text>

        <Text style={styles.fieldLabel}>{t('yourName')}</Text>
        <TextInput
          style={styles.input}
          value={displayNameDraft}
          onChangeText={setDisplayNameDraft}
          placeholder={t('yourNamePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t('yourName')}
        />
        <Text style={styles.fieldHint}>{t('yourNameHint')}</Text>

        <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>{t('usernameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={usernameDraft}
          onChangeText={(v) => setUsernameDraft(v.toLowerCase())}
          placeholder={t('usernamePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('usernameLabel')}
        />
        <Text style={styles.fieldHint}>{t('usernameHint')}</Text>
        {usernameCheck === 'checking' && (
          <Text style={styles.usernameStatusChecking}>{t('usernameChecking')}</Text>
        )}
        {usernameCheck === 'available' && (
          <Text style={styles.usernameStatusOk}>{t('usernameAvailable')}</Text>
        )}
        {usernameCheck === 'taken' && (
          <Text style={styles.usernameStatusBad}>{t('usernameTaken')}</Text>
        )}
        {usernameCheck === 'invalid' && (
          <Text style={styles.usernameStatusBad}>{t('usernameInvalid')}</Text>
        )}

        <Pressable
          style={[
            styles.secondaryButton,
            (!profileDirty || usernameBlocksSave) && styles.buttonDisabled,
          ]}
          onPress={onSaveProfile}
          disabled={busy !== null || !profileDirty || usernameBlocksSave}
          accessibilityRole="button"
          accessibilityLabel={t('saveProfile')}
        >
          {busy === 'profile' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t('saveProfile')}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('emailVerificationSection')}</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={onResendVerification}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={t('resendVerification')}
        >
          {busy === 'resend' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t('resendVerification')}</Text>
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={t('verificationCodePlaceholder')}
          placeholderTextColor={colors.inkMuted}
          value={verifyToken}
          onChangeText={setVerifyToken}
          autoCapitalize="none"
          accessibilityLabel={t('verificationCodePlaceholder')}
        />
        <Pressable
          style={[styles.secondaryButton, !verifyToken.trim() && styles.buttonDisabled]}
          onPress={onVerifyEmail}
          disabled={busy !== null || !verifyToken.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('verifyEmail')}
        >
          {busy === 'verify' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t('verifyEmail')}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('sessionSection')}</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={onLogout}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={t('logOut')}
        >
          {busy === 'logout' ? (
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
    input: {
      backgroundColor: colors.background,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.ink,
      fontSize: typography.scale.md,
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
    buttonDisabled: { opacity: 0.4 },
    fieldLabel: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    fieldHint: { color: colors.inkMuted, fontSize: typography.scale.xs },
    usernameStatusChecking: { color: colors.inkMuted, fontSize: typography.scale.xs },
    usernameStatusOk: { color: colors.success, fontSize: typography.scale.xs, fontWeight: '700' },
    usernameStatusBad: { color: colors.warning, fontSize: typography.scale.xs, fontWeight: '700' },
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
