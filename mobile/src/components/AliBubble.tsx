import { useEffect, useRef, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import type { AliExpressionCue } from '@/services/aliExpression';
import { AliCharacter } from './AliCharacter';
import { trackEvent } from '@/services/analyticsClient';

interface AliBubbleProps {
  message: string;
  /**
   * ALI's animated pairing for this reaction (task #100 follow-up —
   * every quick-reaction caller has computed this since task #100, but
   * this component kept rendering the static AliMark instead of using
   * it). Drives the same animated AliCharacter rig AliReactionPopup
   * uses for major events, so a quick per-answer reaction looks as
   * alive as a big one, just smaller and calmer (quick reactions are
   * fixed at intensity 1 — see quickAliExpression on the backend).
   */
  expression: AliExpressionCue;
  onDismiss: () => void;
  /** ms before auto-dismiss; pass 0 to disable (tap-to-dismiss only). */
  autoDismissMs?: number;
}

/**
 * ALI's reaction to a single guess/answer, as an actual pop-up instead of
 * quiet inline text sitting under the result (V23 product feedback — the
 * per-answer aliQuickReaction used to just be a <Text> in the feedback
 * card, easy to miss and not really a "reaction"). Anchors to the
 * *bottom* of whatever screen mounts it — below the play area, below
 * the continue/submit button — rather than the top (Barth: a
 * top-anchored version used to sit above the header/status bar, easy to
 * miss and read as a system notification rather than part of the game).
 * Springs up into place, auto-dismisses, and can be tapped away early.
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
 * rather than scrolling with it, pinned to the wrapper's bottom edge
 * (inset by the device's safe-area bottom so it clears the home
 * indicator).
 */
export function AliBubble({
  message,
  expression,
  onDismiss,
  autoDismissMs = 2800,
}: AliBubbleProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const { t } = useTranslation('common');
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    trackEvent('ALI_REACTION_SHOWN', { expression: expression.expression, pose: expression.pose });
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

  const onPressDismiss = () => {
    trackEvent('ALI_INTERACTION', { source: 'quick_reaction' });
    onDismiss();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { opacity, transform: [{ translateY }] }]}
    >
      <Pressable
        style={styles.bubble}
        onPress={onPressDismiss}
        accessibilityRole="button"
        // "ALI" itself is never translated (proper noun); `message` is
        // ALI's own dynamic reaction text, out of scope like her other
        // dialogue content -- only the surrounding label pattern and the
        // dismiss hint are this component's own translatable chrome.
        accessibilityLabel={t('aliBubble.accessibilityLabel', { message })}
        accessibilityHint={t('aliBubble.dismissHint')}
      >
        <Animated.View style={styles.avatar}>
          <AliCharacter
            size={34}
            expression={expression.expression}
            pose={expression.pose}
            intensity={expression.intensity}
          />
        </Animated.View>
        <Text style={styles.text}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors, bottomInset: number) {
  return StyleSheet.create({
    wrapper: {
      position: 'absolute',
      bottom: spacing.md + bottomInset,
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
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600', flexShrink: 1 },
  });
}
