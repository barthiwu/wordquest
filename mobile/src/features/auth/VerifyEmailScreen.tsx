import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/constants/theme';
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
          <Text style={styles.title}>Verifying your email…</Text>
        </>
      )}

      {status === 'success' && (
        <>
          <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          <Text style={styles.title}>Email verified</Text>
          <Text style={styles.subtitle}>Your account is fully unlocked.</Text>
          <Pressable
            style={styles.button}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </>
      )}

      {status === 'error' && (
        <>
          <Ionicons name="alert-circle" size={56} color={colors.danger} />
          <Text style={styles.title}>That link is invalid or expired</Text>
          <Text style={styles.subtitle}>
            Request a new verification email from Settings and try again.
          </Text>
          <Pressable
            style={styles.button}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </>
      )}

      {status === 'missingToken' && (
        <>
          <Ionicons name="mail-open-outline" size={56} color={colors.inkMuted} />
          <Text style={styles.title}>No verification code found</Text>
          <Text style={styles.subtitle}>Open the link from your verification email again.</Text>
          <Pressable
            style={styles.button}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
