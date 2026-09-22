import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useThemeColors } from '@/state/themeStore';
import { radius, type ThemeColors } from '@/constants/theme';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** Stagger + timing for the vowel drop-in — tuned to read as one quick,
 * satisfying "tiles falling into their blanks" beat, not a long wait. */
const DROP_DELAY_BASE = 220; // ms before the first vowel starts falling
const DROP_STAGGER = 130; // ms between each subsequent vowel's start
const DROP_HEIGHT = 90; // px a vowel falls from
const SPRING_CONFIG = { friction: 5, tension: 55, useNativeDriver: true } as const;

/** Total time from mount to every vowel settled — SplashScreen holds on
 * this screen at least this long so the animation is never cut short by
 * navigation. Last vowel's start delay + spring settle time + a beat. */
export const WORDMARK_ANIMATION_DURATION_MS = DROP_DELAY_BASE + 2 * DROP_STAGGER + 650;

interface LetterSlotProps {
  char: string;
  fontSize: number;
  colors: ThemeColors;
  dropDelay: number;
  reduceMotion: boolean;
}

function LetterSlot({ char, fontSize, colors, dropDelay, reduceMotion }: LetterSlotProps) {
  const isVowel = VOWELS.has(char);
  // Resting state by default (visible, in place) — animation is an
  // opt-in applied imperatively once we know motion is safe, so there's
  // no "wrong" state to flash before the reduce-motion check resolves.
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isVowel || reduceMotion) return;
    translateY.setValue(-DROP_HEIGHT);
    opacity.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(dropDelay),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, { toValue: 0, ...SPRING_CONFIG }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  return (
    <View style={styles.slot}>
      <Animated.Text
        style={[
          styles.letter,
          {
            fontSize,
            color: isVowel ? colors.glyph : colors.ink,
            transform: [{ translateY }],
            opacity,
          },
        ]}
      >
        {char}
      </Animated.Text>
      {isVowel && (
        <View
          style={[
            styles.dash,
            {
              backgroundColor: colors.glyph,
              width: fontSize * 0.55,
              height: Math.max(4, fontSize * 0.09),
            },
          ]}
        />
      )}
    </View>
  );
}

function WordLine({
  word,
  fontSize,
  colors,
  dropDelays,
  reduceMotion,
}: {
  word: string;
  fontSize: number;
  colors: ThemeColors;
  dropDelays: Map<string, number>;
  reduceMotion: boolean;
}) {
  return (
    <View style={styles.line}>
      {word.split('').map((ch, i) => (
        <LetterSlot
          key={`${word}-${i}`}
          char={ch}
          fontSize={fontSize}
          colors={colors}
          reduceMotion={reduceMotion}
          dropDelay={dropDelays.get(`${word}-${i}`) ?? 0}
        />
      ))}
    </View>
  );
}

/** True once the OS reports reduced-motion is on. Starts false (the safe
 * default is "not yet known" == "don't assume reduce motion"), which
 * pairs with LetterSlot defaulting to its resting state either way. */
function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (!cancelled && enabled) setReduceMotion(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return reduceMotion;
}

interface AnimatedWordmarkProps {
  /** Base font size for each line; ~64 reads well full-screen on splash. */
  fontSize?: number;
  style?: ViewStyle;
}

/**
 * WORDQUEST as a lockup — vowels rendered in the brand's glyph-gold with a
 * dash beneath each, echoing the letter-omission blanks from the core
 * Quest mechanic. On mount (reduced-motion permitting) every vowel drops
 * in from above and settles onto its dash with a soft spring-bounce, one
 * after another — this doubles as the splash screen's loading beat, so
 * there's no separate spinner needed alongside it.
 */
export function AnimatedWordmark({ fontSize = 64, style }: AnimatedWordmarkProps) {
  const colors = useThemeColors();
  const reduceMotion = useReduceMotion();

  const dropDelays = useMemo(() => {
    const map = new Map<string, number>();
    const vowelSlots: string[] = [];
    for (const word of ['WORD', 'QUEST']) {
      word.split('').forEach((ch, i) => {
        if (VOWELS.has(ch)) vowelSlots.push(`${word}-${i}`);
      });
    }
    vowelSlots.forEach((key, i) => map.set(key, DROP_DELAY_BASE + i * DROP_STAGGER));
    return map;
  }, []);

  return (
    <View style={[styles.container, style]}>
      <WordLine
        word="WORD"
        fontSize={fontSize}
        colors={colors}
        dropDelays={dropDelays}
        reduceMotion={reduceMotion}
      />
      <WordLine
        word="QUEST"
        fontSize={fontSize}
        colors={colors}
        dropDelays={dropDelays}
        reduceMotion={reduceMotion}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  line: { flexDirection: 'row' },
  slot: { alignItems: 'center' },
  letter: { fontWeight: '700', letterSpacing: 1 },
  dash: { marginTop: 4, borderRadius: radius.pill },
});
