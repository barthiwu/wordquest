import { useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';

interface AffordanceChipProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** Swapped in once the affordance is exhausted (remaining === 0) — defaults to a checkmark. */
  exhaustedIcon?: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Shown in place of `label` once exhausted, e.g. "No hints left". Defaults to `label`. */
  exhaustedLabel?: string;
  onPress: () => void;
  /** In flight — shows a spinner in place of the icon and blocks a second tap. */
  loading?: boolean;
  /**
   * Charges left, once known. `undefined` (before the player's first tap
   * tells us the real cap) renders no badge at all — we don't guess at a
   * number the server hasn't confirmed. `0` renders the exhausted state.
   */
  remaining?: number;
}

/**
 * A single Guess-stage helper action (Hint / Synonym / Reveal a letter) —
 * an icon + label pill with a tactile press-in "squish", an in-flight
 * spinner, and a live charges-remaining badge once the server has told us
 * one. Replaces the old plain text pills (V24 product feedback: "make it
 * look alive and interactive" — the row gave zero feedback that a tap had
 * registered, and hid working remaining-use data the backend was already
 * sending back on every hint/synonym response but the UI never read).
 *
 * Built on React Native's own Animated API, matching FadeInUp/AliBubble —
 * no new dependency for a one-shot press animation.
 */
export function AffordanceChip({
  icon,
  exhaustedIcon = 'checkmark-circle',
  label,
  exhaustedLabel,
  onPress,
  loading = false,
  remaining,
}: AffordanceChipProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  const exhausted = remaining === 0;
  const disabled = loading || exhausted;

  const onPressIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 30,
      bounciness: 0,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 10,
    }).start();
  };

  const displayLabel = exhausted ? (exhaustedLabel ?? label) : label;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[styles.chip, exhausted && styles.chipExhausted]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={displayLabel}
        accessibilityState={{ disabled, busy: loading }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.arcaneSoft} />
        ) : (
          <Ionicons
            name={exhausted ? exhaustedIcon : icon}
            size={15}
            color={exhausted ? colors.inkMuted : colors.arcaneSoft}
          />
        )}
        <Text style={[styles.label, exhausted && styles.labelExhausted]}>{displayLabel}</Text>
        {remaining !== undefined && remaining > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{remaining}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    chipExhausted: {
      borderColor: colors.border,
      opacity: 0.6,
    },
    label: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
    },
    labelExhausted: { color: colors.inkMuted },
    badge: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { color: colors.ink, fontSize: 10, fontWeight: '700' },
  });
}
