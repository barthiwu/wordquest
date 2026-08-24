import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { getMe } from '@/services/users';
import { useAuthStore } from '@/state/authStore';

interface Props {
  onPress: () => void;
}

/**
 * A quiet, dismissible nudge for an unverified account — never a blocker.
 * The backend's grace period (EmailVerificationGuard) already lets an
 * unverified player use the app fully for
 * gameplayRules.auth.emailVerificationGraceDays days before gameplay
 * endpoints start rejecting them with a 403; before this banner existed,
 * that cutoff had zero visibility anywhere in the app, so a player could
 * hit it with no warning. Tapping through goes to Settings, which already
 * hosts the real resend/verify flow — this component doesn't duplicate
 * that logic, it just makes the state visible. Dismissal is session-only
 * (component state, not persisted) — closing it doesn't mean "never
 * remind me," it means "not right now."
 */
export function VerificationBanner({ onPress }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [unverified, setUnverified] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    getMe(accessToken)
      .then((me) => setUnverified(me.emailVerifiedAt === null))
      .catch(() => {
        // Silent — a failed check shouldn't put an alarming banner in front
        // of a player over a transient network blip.
      });
  }, [accessToken]);

  if (!unverified || dismissed) return null;

  return (
    <View style={styles.banner}>
      <Pressable
        style={styles.body}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Verify your email to keep your progress safe"
        accessibilityHint="Opens email verification settings"
      >
        <Ionicons name="mail-unread-outline" size={18} color={colors.warning} />
        <Text style={styles.text}>Verify your email to keep your progress safe</Text>
      </Pressable>
      <Pressable
        style={styles.dismiss}
        onPress={() => setDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss email verification reminder"
      >
        <Ionicons name="close" size={16} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600' },
  dismiss: { padding: spacing.xs },
});
