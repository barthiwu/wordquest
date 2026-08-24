import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { deleteAccount, logout, resendVerification, verifyEmail } from '@/services/auth';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/**
 * Settings — MVP-listed in BUILD_HANDOFF §6 but never built. Hosts the
 * account-lifecycle actions the rest of the app has nowhere else to
 * put: email verification, logout (which revokes the refresh token
 * server-side, not just clears local storage), and account deletion.
 */
export function SettingsScreen({ navigation }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [verifyToken, setVerifyToken] = useState('');
  const [busy, setBusy] = useState<'resend' | 'verify' | 'logout' | 'delete' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage('Verification email sent — check your inbox.');
    } catch {
      setMessage('Could not send a verification email right now.');
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
      setMessage('Email verified.');
      setVerifyToken('');
    } catch {
      setMessage('That verification code is invalid or has expired.');
    } finally {
      setBusy(null);
    }
  };

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
            setBusy('delete');
            try {
              await deleteAccount(accessToken);
              await clearSession();
              navigation.replace('Login');
            } catch {
              setMessage('Could not delete your account right now.');
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Settings</Text>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Email verification</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={onResendVerification}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel="Resend verification email"
        >
          {busy === 'resend' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>Resend verification email</Text>
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Verification code"
          placeholderTextColor={colors.inkMuted}
          value={verifyToken}
          onChangeText={setVerifyToken}
          autoCapitalize="none"
          accessibilityLabel="Verification code"
        />
        <Pressable
          style={[styles.secondaryButton, !verifyToken.trim() && styles.buttonDisabled]}
          onPress={onVerifyEmail}
          disabled={busy !== null || !verifyToken.trim()}
          accessibilityRole="button"
          accessibilityLabel="Verify email"
        >
          {busy === 'verify' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>Verify email</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Session</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={onLogout}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          {busy === 'logout' ? (
            <ActivityIndicator color={colors.arcaneSoft} />
          ) : (
            <Text style={styles.secondaryButtonText}>Log out</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Danger zone</Text>
        <Pressable
          style={styles.dangerButton}
          onPress={onDeleteAccount}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityHint="Deactivates your account; can be recovered later from the login screen"
        >
          {busy === 'delete' ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.dangerButtonText}>Delete account</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
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
  dangerButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dangerButtonText: { color: colors.danger, fontSize: typography.scale.md, fontWeight: '700' },
});
