import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { AliDisplayMessage } from '@/services/aliExpression';
import { AliCharacter } from './AliCharacter';
import { trackEvent } from '@/services/analyticsClient';
import { RichAliText } from './RichAliText';

interface AliReactionPopupProps {
  cue: AliDisplayMessage;
  colors: ThemeColors;
  onDismiss: () => void;
}

const MIN_AUTO_DISMISS_MS = 2400;
const MAX_AUTO_DISMISS_MS = 6000;

/**
 * The live, full ALI-moment popup for useAliReactionQueue's `active` cue
 * (task #99: level-up, journey completion, mastery, achievement-unlock
 * reactions shown as they happen). Uses the animated AliCharacter rig
 * (expression + pose + intensity straight off the cue) rather than
 * AliBubble's static AliMark, since these are meant to actually look
 * like something — see AliCharacter's own doc comment for why.
 *
 * Give the caller's conditional render (`{queue.active && <AliReactionPopup ... />}`)
 * no explicit key — the queue always renders a `null` frame between one
 * active cue and the next (dismiss clears `active` before any cooldown
 * promotion), so React already unmounts/remounts this between cues,
 * which is what re-triggers this component's one-shot entrance/dismiss
 * effect below.
 */
export function AliReactionPopup({ cue, colors, onDismiss }: AliReactionPopupProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('common');
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    trackEvent('ALI_MAJOR_ANIMATION_SHOWN', {
      expression: cue.expression,
      pose: cue.pose,
      priority: cue.priority,
    });
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }),
    ]).start();

    const holdMs = Math.min(
      MAX_AUTO_DISMISS_MS,
      Math.max(MIN_AUTO_DISMISS_MS, cue.durationMs || 0),
    );
    const timer = setTimeout(onDismiss, holdMs);
    return () => clearTimeout(timer);
    // One-shot entrance + auto-dismiss timer for this mount only -- see
    // this component's doc comment for why a fresh mount per cue is
    // already guaranteed by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPressDismiss = () => {
    trackEvent('ALI_INTERACTION', { source: 'major_animation' });
    onDismiss();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { opacity, transform: [{ scale }] }]}
    >
      <Pressable
        style={styles.card}
        onPress={onPressDismiss}
        accessibilityRole="button"
        // "ALI" itself is never translated (proper noun); `cue.text` is
        // ALI's own dynamic reaction text, out of scope like her other
        // dialogue content -- only the surrounding label pattern and the
        // dismiss hint are this component's own translatable chrome.
        accessibilityLabel={t('aliBubble.accessibilityLabel', { message: cue.text })}
        accessibilityHint={t('aliBubble.dismissHint')}
      >
        <View style={styles.characterWrap}>
          <AliCharacter
            size={72}
            expression={cue.expression}
            pose={cue.pose}
            intensity={cue.intensity}
          />
        </View>
        <View style={styles.textCol}>
          <RichAliText style={styles.text} text={cue.text} />
          {cue.recommendation && (
            <RichAliText style={styles.recommendation} text={cue.recommendation} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: {
      position: 'absolute',
      top: '28%',
      left: spacing.lg,
      right: spacing.lg,
      zIndex: 30,
      alignItems: 'center',
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      maxWidth: '100%',
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
    characterWrap: { alignItems: 'center', justifyContent: 'center' },
    textCol: { flex: 1, gap: spacing.xs },
    text: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '600' },
    recommendation: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
    },
  });
}
