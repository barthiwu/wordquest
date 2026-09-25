import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors } from '@/state/themeStore';

interface ScoreRingProps {
  /** 0-100. */
  score: number;
  size: number;
  strokeWidth: number;
  color: string;
  valueFontSize?: number;
  labelFontSize?: number;
  /** Shown centered under the number, inside the ring — omit for the small per-skill rings (their label sits outside, below the ring). */
  label?: string;
}

/**
 * A circular score gauge — the Paragraph-feedback screen's composite
 * hero ring and its five per-skill rings (V25 product feedback: the old
 * flat Grammar/Vocabulary/... list read as a receipt, not a game
 * result). Renders pre-filled rather than sweeping its own fill in on
 * mount: an SVG stroke-dashoffset tween needs the JS animation driver
 * (unsupported by the native driver for this prop), and the screen
 * already gets its "instant swap feels flat" entrance from FadeInUp
 * wrapping each section, staggered.
 */
export function ScoreRing({
  score,
  size,
  strokeWidth,
  color,
  valueFontSize,
  labelFontSize,
  label,
}: ScoreRingProps) {
  const colors = useThemeColors();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dashoffset = circumference * (1 - clamped / 100);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.rotated}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.surfaceRaised}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
        />
      </Svg>
      <View style={StyleSheet.absoluteFillObject}>
        <View style={styles.center}>
          <Text
            style={[styles.value, { color: colors.ink, fontSize: valueFontSize ?? size * 0.24 }]}
          >
            {Math.round(score)}
          </Text>
          {label && (
            <Text style={[styles.label, { color: colors.inkMuted, fontSize: labelFontSize ?? 10 }]}>
              {label}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rotated: { transform: [{ rotate: '-90deg' }] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontWeight: '700' },
  label: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
});
