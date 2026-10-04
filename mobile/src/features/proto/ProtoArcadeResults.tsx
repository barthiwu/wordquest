import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { AliExpression, AliPose } from '@/services/aliExpression';
import { useThemeColors } from '@/state/themeStore';
import type { ArcadeHeroResultsProps } from '@/components/ArcadeHeroResults';
import { AliScene } from './ui/AliScene';
import { GlassCard, ProtoButton } from './ui/ProtoUI';
import { TrophyArt } from './ui/ProtoArt';
import { useProtoExtras } from './ui/useProtoExtras';
import { useUid } from './ui/useUid';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Prototype "New look" arcade result — shared by ScrambleQuest, Complete It,
 * Word Duel and Boss Battle, like the standard hero-ring component it
 * replaces. ALI reacts to accuracy (triumphant ≥75%, pleased ≥50%,
 * encouraging below); the ring, stats and actions come from the caller.
 */
export function ProtoArcadeResults({
  title,
  subtitle,
  correctCount,
  totalCount,
  ringLabel = 'ACCURACY',
  stats = [],
  extraLines = [],
  primaryLabel,
  onPrimary,
  primaryAccessibilityLabel,
  secondaryLabel,
  onSecondary,
  secondaryAccessibilityLabel,
}: Omit<ArcadeHeroResultsProps, 'colors'>) {
  const colors = useThemeColors();
  const x = useProtoExtras();
  const uid = useUid();
  const accuracy = totalCount > 0 ? Math.min(1, Math.max(0, correctCount / totalCount)) : 0;
  const percent = Math.round(accuracy * 100);

  const mood: { expression: AliExpression; pose: AliPose; intensity: 0 | 1 } =
    accuracy >= 0.75
      ? { expression: 'TRIUMPHANT', pose: 'WING_SPREAD_FULL', intensity: 1 }
      : accuracy >= 0.5
        ? { expression: 'PLEASED', pose: 'CELEBRATORY_HOP', intensity: 0 }
        : { expression: 'ENCOURAGING', pose: 'APPROVING_NOD', intensity: 0 };
  const ringColor = accuracy < 0.5 ? colors.danger : accuracy < 0.75 ? colors.success : x.cta[0];

  const size = 150;
  const stroke = 12;
  const r = size / 2 - stroke / 2 - 2;
  const circ = 2 * Math.PI * r;
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fill.setValue(0);
    Animated.timing(fill, { toValue: accuracy, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [accuracy, fill]);
  const dashoffset = fill.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });

  return (
    <View style={styles.root}>
      <AliScene
        variant={accuracy >= 0.75 ? 'castle' : 'arena'}
        height={250}
        placement="center"
        aliSize={140}
        expression={mood.expression}
        pose={mood.pose}
        intensity={mood.intensity}
        fadeTo={colors.background}
        message={title}
      >
        {accuracy >= 0.75 ? (
          <View style={styles.trophy} pointerEvents="none">
            <TrophyArt size={56} />
          </View>
        ) : null}
      </AliScene>

      <View style={styles.body}>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{subtitle}</Text> : null}

        <View style={styles.ringWrap} accessibilityRole="image" accessibilityLabel={`${percent}% ${ringLabel}`}>
          <Svg width={size} height={size}>
            <Defs>
              <SvgGradient id={`protoRing-${uid}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={ringColor} />
                <Stop offset="1" stopColor={accuracy >= 0.75 ? x.cta[1] : ringColor} />
              </SvgGradient>
            </Defs>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.ringTrack} strokeWidth={stroke} fill="none" />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={`url(#protoRing-${uid})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circ} ${circ}`}
              strokeDashoffset={dashoffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter} pointerEvents="none">
            <Text style={[styles.percent, { color: colors.ink }]}>{percent}%</Text>
            <Text style={[styles.ringLabel, { color: colors.inkMuted }]}>{ringLabel}</Text>
          </View>
        </View>

        {stats.length > 0 ? (
          <View style={styles.stats}>
            {stats.map((s) => (
              <GlassCard key={s.text} style={styles.stat}>
                <Ionicons name={s.icon} size={22} color={colors.glyph} />
                <Text style={[styles.statText, { color: colors.ink }]}>{s.text}</Text>
              </GlassCard>
            ))}
          </View>
        ) : null}

        {extraLines.map((line) => (
          <Text key={line} style={[styles.extra, { color: colors.inkMuted }]}>{line}</Text>
        ))}

        <View style={styles.actions}>
          <ProtoButton label={primaryLabel} accessibilityLabel={primaryAccessibilityLabel} onPress={onPrimary} />
          {secondaryLabel && onSecondary ? (
            <ProtoButton variant="outline" label={secondaryLabel} accessibilityLabel={secondaryAccessibilityLabel} onPress={onSecondary} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', width: '100%', alignItems: 'stretch' },
  trophy: { position: 'absolute', right: 18, bottom: 20 },
  body: { paddingHorizontal: 20, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center', alignItems: 'stretch', marginTop: 6 },
  subtitle: { textAlign: 'center', fontSize: 15, fontWeight: '600' },
  ringWrap: { alignSelf: 'center', width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  percent: { fontSize: 36, fontWeight: '900' },
  ringLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  stats: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  stat: { flexGrow: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statText: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  extra: { textAlign: 'center', fontSize: 14 },
  actions: { gap: 10, marginTop: 6, paddingBottom: 20 },
});
