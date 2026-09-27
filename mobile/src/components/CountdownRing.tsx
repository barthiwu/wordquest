import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { typography, type ThemeColors } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface CountdownRingProps {
  /** Seconds left — drives the ring's fill fraction and, unless `label`
   * overrides it, the centered text ("{n}s"). */
  remainingSeconds: number;
  /** Denominator for the ring's fill fraction: full ring at
   * remainingSeconds === totalSeconds, a bare sliver as it nears 0. */
  totalSeconds: number;
  colors: ThemeColors;
  /** Seconds-remaining threshold at/below which the ring turns
   * danger-red and pulses. Default 10, tuned for a single word's ~30s
   * countdown — pass a larger value for a longer-running countdown
   * (e.g. Word Duel's 5-minute match clock), where 10s would warn too
   * late to be useful. */
  urgentThresholdSeconds?: number;
  /** Overrides the centered text — e.g. Word Duel's "4:32" mm:ss
   * format. Defaults to "{remainingSeconds}s". */
  label?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Shared glowing countdown ring — "Bold Modern" design canvas review,
 * Sept 2026 (Barth: the flat plain timer text "doesn't feel like a
 * game"; wanted E's overall look with D's gold hint/streak-button
 * outline, and "the ring should also move with the timer... when it
 * is on 1sec, the ring itself should also show it that it is a tiny
 * dot left. Same way when you just start the word, it should be full
 * ring"). Built first for ScrambleQuest's per-word timer, then reused
 * as-is for Complete It's identical per-word shape and adapted for
 * Word Duel's match-wide clock via `urgentThresholdSeconds`/`label`.
 * Same underlying pattern as Boss Battle's SiegeRing: the ring drains
 * as a real fraction of `totalSeconds`, full the moment the countdown
 * starts, down to a sliver right before it hits zero, and only turns
 * danger-red + starts pulsing once inside the urgent window, so a calm
 * ring reads as "plenty of time left" the rest of the way.
 */
export function CountdownRing({
  remainingSeconds,
  totalSeconds,
  colors,
  urgentThresholdSeconds = 10,
  label,
  size = 116,
  strokeWidth = 8,
}: CountdownRingProps) {
  const urgent = remainingSeconds <= urgentThresholdSeconds;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!urgent) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [urgent, pulse]);

  const center = size / 2;
  const radius = center - strokeWidth / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : 0;
  const dashoffset = circumference * (1 - progress);
  const ringColor = urgent ? colors.danger : colors.arcaneSoft;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.svg}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.ringTrack}
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          opacity={pulse}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.center}>
        <Text
          style={[
            {
              color: colors.ink,
              fontSize: typography.scale.xl,
              fontWeight: typography.display.weight,
            },
            urgent && { color: colors.danger },
          ]}
        >
          {label ?? `${remainingSeconds}s`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  svg: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
