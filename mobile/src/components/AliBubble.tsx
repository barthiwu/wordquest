import { useEffect, useRef, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { AliMark } from './AliMark';

interface AliBubbleProps {
  message: string;
  onDismiss: () => void;
  /** ms before auto-dismiss; pass 0 to disable (tap-to-dismiss only). */
  autoDismissMs?: number;
}

/**
 * ALI's reaction to a single guess/answer, as an actual pop-up instead of
 * quiet inline text sitting under the result (V23 product feedback — the
 * per-answer aliQuickReaction used to just be a <Text> in the feedback
 * card, easy to miss and not really a "reaction"). Floats over whatever
 * screen mounts it, springs in, auto-dismisses, and can be tapped away
 * early.
 *
 * Give it a fresh `key` from the caller for every new reaction (e.g. the
 * guess-attempt id, or an incrementing counter) — like FadeInUp, this
 * only animates once per mount, so reusing the same instance across
 * reactions would silently swap the text under an already-settled bubble
 * instead of re-triggering the entrance.
 *
 * Render it as a sibling of the screen's scrollable content inside a
 * `flex: 1` wrapper View, not inside the ScrollView itself — it
 * position-absolutes to that wrapper so it floats over the content
 * rather than scrolling with it.
 */
export function AliBubble({ message, onDismiss, autoDismissMs = 2800 }: AliBubbleProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('common');
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }),
    ]).start();

    if (autoDismissMs <= 0) return undefined;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
    // One-shot entrance + auto-dismiss timer for this mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}
    >
      <Pressable
        style={styles.bubble}
        onPress={onDismiss}
        accessibilityRole="button"
        // "ALI" itself is never translated (proper noun); `message` is
        // ALI's own dynamic reaction text, out of scope like her other
        // dialogue content -- only the surrounding label pattern and the
        // dismiss hint are this component's own translatable chrome.
        accessibilityLabel={t('aliBubble.accessibilityLabel', { message })}
        accessibilityHint={t('aliBubble.dismissHint')}
      >
        <Animated.View style={styles.avatar}>
          <AliMark size={14} />
        </Animated.View>
        <Text style={styles.text}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.lg,
      right: spacing.lg,
      zIndex: 20,
      alignItems: 'center',
    },
    bubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      maxWidth: '100%',
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.arcaneSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600', flexShrink: 1 },
  });
}
