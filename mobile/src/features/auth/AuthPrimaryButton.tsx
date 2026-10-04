import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { radius, spacing, typography } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useIsPrototype } from '@/state/uiVersionStore';
import { ProtoButton } from '@/features/proto/ui/ProtoUI';

/** The auth screens' main action: the classic filled button, or the gradient ProtoButton in the new look. */
export function AuthPrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const colors = useThemeColors();
  const proto = useIsPrototype();
  if (proto) {
    return <ProtoButton label={loading ? '…' : label} onPress={onPress} disabled={disabled || loading} accessibilityLabel={label} />;
  }
  return (
    <Pressable
      style={[styles.button, { backgroundColor: colors.arcane }, (disabled || loading) && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <Text style={[styles.text, { color: colors.ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  text: { fontSize: typography.scale.md, fontWeight: '700' },
});
