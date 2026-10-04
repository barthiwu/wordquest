import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useIsPrototype } from '@/state/uiVersionStore';
import type { SocialProvider } from '@/services/auth';

const ICONS: Record<SocialProvider, keyof typeof Ionicons.glyphMap> = {
  GOOGLE: 'logo-google',
  APPLE: 'logo-apple',
  FACEBOOK: 'logo-facebook',
};

/**
 * "or continue with" + one button per provider the server and this device
 * can actually offer. Renders nothing when none are available, so a
 * deployment without provider keys looks exactly like before.
 */
export function SocialButtons({
  providers,
  busy,
  onPress,
  error,
}: {
  providers: SocialProvider[];
  busy: SocialProvider | null;
  onPress: (provider: SocialProvider) => void;
  error?: string | null;
}) {
  const colors = useThemeColors();
  const proto = useIsPrototype();
  const { t } = useTranslation('auth');
  if (providers.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text style={[styles.or, { color: colors.inkMuted }]}>{t('social.or')}</Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>
      {providers.map((p) => (
        <Pressable
          key={p}
          onPress={() => onPress(p)}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={t(`social.continueWith.${p}`)}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: colors.surface,
              borderColor: proto ? colors.arcane : colors.border,
              borderRadius: proto ? 16 : radius.md,
              minHeight: proto ? 52 : undefined,
            },
            busy !== null && busy !== p && { opacity: 0.5 },
            pressed && { transform: [{ scale: 0.99 }] },
          ]}
        >
          <Ionicons name={ICONS[p]} size={20} color={colors.ink} />
          <Text style={[styles.label, { color: colors.ink }]}>
            {busy === p ? t('social.working') : t(`social.continueWith.${p}`)}
          </Text>
        </Pressable>
      ))}
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.xs },
  line: { flex: 1, height: 1 },
  or: { fontSize: typography.scale.sm },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    paddingVertical: spacing.md,
  },
  label: { fontSize: typography.scale.md, fontWeight: '600' },
  error: { fontSize: typography.scale.sm },
});
