import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { AliDisplayMessage } from '@/services/aliExpression';

interface AliStreakPopoutProps {
  /** The caller's own streak-pill container style (e.g. styles.streakPill) — this
   * component renders that exact pill and never invents its own pill visuals. */
  pillStyle: StyleProp<ViewStyle>;
  /** The caller's own streak-pill text style (e.g. styles.streakPillText). */
  textStyle: StyleProp<TextStyle>;
  /** The pill's label, e.g. `${t('streakLabel')} ${challenge.currentStreak}` — this
   * component doesn't know or care about i18n, it just renders what it's given. */
  label: string;
  /** A fresh STREAK_MILESTONE reaction to react to, or null/undefined for none.
   * A new object (by reference) re-triggers the pop-out animation even if the
   * text happens to match a previous reaction. */
  reaction?: AliDisplayMessage | null;
  colors: ThemeColors;
  /** Called once the pop-out has fully retracted back to just the pill. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

const ENTRANCE_MS = 220;
const EXIT_MS = 220;
const MIN_HOLD_MS = 1800;
const MAX_HOLD_MS = 4000;

/**
 * ALI's streak-milestone reaction, popping out of an existing streak-container
 * pill (Barth: "let the reaction pop out from there, and in a small line, then
 * return back to the streak count") rather than the general full-screen
 * AliCharacter/AliBubble pop-up used for Daily Quest and major progression
 * events. This wraps the caller's own pill — pass the same `pillStyle`/
 * `textStyle`/`label` you'd have put on a plain `<View><Text/></View>` pill,
 * and this component renders that pill plus an anchored callout above it.
 *
 * Render this in place of the screen's inline streak pill (ScrambleQuestScreen,
 * CompleteItScreen), driven by the answer result's `streakReaction` field.
 *
 * Give it a `reaction` prop that changes by reference on every new milestone —
 * like AliBubble, this re-triggers on a new object, not on text equality, so a
 * repeated identical-looking reaction (e.g. two separate 5-streaks in one
 * session) still pops.
 */
export function AliStreakPopout({
  pillStyle,
  textStyle,
  label,
  reaction,
  colors,
  onDismiss,
  style,
}: AliStreakPopoutProps): ReactNode {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const anim = useRef(new Animated.Value(0)).current;
  const [visibleReaction, setVisibleReaction] = useState<AliDisplayMessage | null>(null);

  useEffect(() => {
    if (!reaction) return undefined;
    setVisibleReaction(reaction);
    const holdMs = Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, reaction.durationMs || 0));
    anim.setValue(0);
    const sequence = Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: ENTRANCE_MS, useNativeDriver: true }),
      Animated.delay(holdMs),
      Animated.timing(anim, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }),
    ]);
    sequence.start(({ finished }) => {
      if (!finished) return;
      setVisibleReaction(null);
      onDismiss?.();
    });
    return () => sequence.stop();
    // Intentionally keyed only on the reaction reference -- a new streak
    // milestone (even with identical text) should re-trigger the pop-out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction]);

  const opacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <View style={[pillStyle, style]}>
      <Text style={textStyle}>{label}</Text>
      {visibleReaction ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.callout, { opacity, transform: [{ translateY }, { scale }] }]}
        >
          <Text style={styles.calloutText} numberOfLines={2}>
            {visibleReaction.text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    callout: {
      position: 'absolute',
      bottom: '100%',
      right: 0,
      marginBottom: spacing.xs,
      maxWidth: 220,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    calloutText: {
      color: colors.ink,
      fontSize: typography.scale.xs,
      fontWeight: '600',
    },
  });
}
