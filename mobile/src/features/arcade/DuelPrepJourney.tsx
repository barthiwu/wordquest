import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { GlyphIcon } from '@/components/GlyphIcon';
import { WORD_DUEL_TIPS } from './wordDuelTips';

const RING_SIZE = 148;
const RING_STROKE = 10;
/** How long each Word Tip stays up before the next one rotates in --
 * long enough to read a short definition, short enough that a normal
 * matchmaking wait (a few seconds to maybe half a minute) still shows
 * two or three different tips rather than feeling static. */
const TIP_ROTATE_MS = 5500;
const TIP_FADE_MS = 260;

interface DuelPrepJourneyProps {
  colors: ThemeColors;
  title: string;
  subtitle: string;
  wordTipLabel: string;
  cancelLabel: string;
  onCancel: () => void;
}

/**
 * The Word Duel matchmaking screen — "Duel Prep Journey" (Option C,
 * approved by Barth, Sept 2026, over the plain spinner it replaces).
 * A slow-spinning progress ring with the Glyph mark floating at its
 * center, and a rotating "Word Tip" card pulled from
 * `WORD_DUEL_TIPS` (~100 entries, so a normal wait never sees a
 * repeat) so the wait itself teaches a word rather than being dead
 * time. There's no real progress fraction to show (matchmaking has no
 * known duration), so the ring's motion is deliberately just
 * decorative -- it never claims a percentage.
 */
export function DuelPrepJourney({
  colors,
  title,
  subtitle,
  wordTipLabel,
  cancelLabel,
  onCancel,
}: DuelPrepJourneyProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const center = RING_SIZE / 2;
  const r = center - RING_STROKE / 2 - 2;
  const circumference = 2 * Math.PI * r;

  // Slow continuous spin -- purely decorative "still working on it"
  // motion, not a percentage-complete indicator.
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 5000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Glyph gently floats/tilts inside the ring, echoing the sparkle
  // loops on ArcadeHeroResults elsewhere in the Arcade.
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);
  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  // Sparkle dots, same twinkle language as ArcadeHeroResults.
  const sparkle = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, {
          toValue: 0.8,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sparkle, {
          toValue: 0.2,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sparkle]);

  // Rotate through WORD_DUEL_TIPS, starting from a random entry so
  // back-to-back matchmaking runs don't always open on the same tip.
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * WORD_DUEL_TIPS.length));
  const tipOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(tipOpacity, {
        toValue: 0,
        duration: TIP_FADE_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setTipIndex((i) => (i + 1) % WORD_DUEL_TIPS.length);
        Animated.timing(tipOpacity, {
          toValue: 1,
          duration: TIP_FADE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    }, TIP_ROTATE_MS);
    return () => clearInterval(interval);
  }, [tipOpacity]);

  // Staggered "still searching" activity dots under the tip card.
  const dotAnims = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];
  useEffect(() => {
    const loops = dotAnims.map((val, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(val, {
            toValue: 1,
            duration: 380,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.3,
            duration: 380,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 180),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tip = WORD_DUEL_TIPS[tipIndex];

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.sparkle,
          { top: 8, right: 30, backgroundColor: colors.glyph, opacity: sparkle },
        ]}
      />
      <Animated.View
        style={[
          styles.sparkle,
          { top: 90, left: 24, backgroundColor: colors.arcaneSoft, opacity: sparkle },
        ]}
      />

      <View style={styles.ringOuter}>
        <Animated.View style={[styles.ringSpinner, { transform: [{ rotate: rotation }] }]}>
          <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            <Circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={colors.border}
              strokeWidth={RING_STROKE}
            />
            <Circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={colors.arcane}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${circumference * 0.32} ${circumference}`}
            />
          </Svg>
        </Animated.View>
        <View style={styles.ringCenter}>
          <Animated.View style={{ transform: [{ translateY: floatY }] }}>
            <GlyphIcon size={34} color={colors.glyph} />
          </Animated.View>
        </View>
      </View>

      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <Animated.View style={[styles.tipCard, { opacity: tipOpacity }]}>
        <View style={styles.tipHeader}>
          <View style={styles.tipIconWrap}>
            <Ionicons name="bulb-outline" size={14} color={colors.glyph} />
          </View>
          <Text style={styles.tipLabel}>{wordTipLabel.toUpperCase()}</Text>
        </View>
        <Text style={styles.tipText}>
          <Text style={styles.tipWord}>“{tip.word}”</Text> {tip.definition}. {tip.usage}
        </Text>
        <View style={styles.dotRow}>
          {dotAnims.map((val, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: val }]} />
          ))}
        </View>
      </Animated.View>

      <Pressable
        style={styles.cancelButton}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
      >
        <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      paddingHorizontal: spacing.xl,
    },
    sparkle: {
      position: 'absolute',
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    ringOuter: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringSpinner: { position: 'absolute', width: RING_SIZE, height: RING_SIZE },
    ringCenter: {
      width: RING_SIZE * 0.62,
      height: RING_SIZE * 0.62,
      borderRadius: (RING_SIZE * 0.62) / 2,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textCol: { alignItems: 'center', gap: spacing.xs },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textAlign: 'center',
      maxWidth: 280,
    },
    tipCard: {
      width: '100%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    tipHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tipIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 7,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipLabel: {
      color: colors.arcane,
      fontSize: typography.scale.xs,
      fontWeight: '800',
      letterSpacing: 1,
    },
    tipText: { color: colors.ink, fontSize: typography.scale.sm, lineHeight: 20 },
    tipWord: { color: colors.arcaneSoft, fontWeight: '700' },
    dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 2 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.arcane },
    cancelButton: {
      width: '100%',
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    cancelButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
  });
}
