import { useEffect, useMemo, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { journeyVisualFor } from '@/constants/journeyVisuals';
import { AliMarkHero } from '@/components/AliMark';
import type { JourneyStageView } from '@/services/journey';

interface Props {
  stages: JourneyStageView[];
  colors: ThemeColors;
}

/**
 * "Your Path" — a horizontal rail across the player's real Journey
 * stages (services/journey.ts's JourneyView.stages, the same data
 * JourneyScreen uses for the full map), each node rendered done /
 * current / locked from that same unlocked/current data JourneyScreen
 * already trusts. ALI marks the current stage with a soft pulsing ring,
 * inviting the tap into the full Journey map the same way
 * JourneyMapExcerpt's hero card used to.
 */
export function StagePathRail({ stages, colors }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('common');

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t('stagePathRail.heading')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {stages.map((stage) => (
          <StageNode key={stage.key} stage={stage} colors={colors} styles={styles} />
        ))}
      </ScrollView>
    </View>
  );
}

function StageNode({
  stage,
  colors,
  styles,
}: {
  stage: JourneyStageView;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const visual = journeyVisualFor(stage.key);
  const done = stage.unlocked && !stage.current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!stage.current) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [stage, pulse]);

  return (
    <View style={styles.node}>
      {stage.current ? (
        <View style={styles.currentWrap}>
          <Animated.View
            style={[
              styles.pulseRing,
              {
                borderColor: visual.color,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              },
              {
                transform: [
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
                ],
              },
            ]}
          />
          <View style={[styles.circle, styles.circleCurrent, { borderColor: visual.color }]}>
            <AliMarkHero size={20} />
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.circle,
            done ? [styles.circleDone, { borderColor: visual.color }] : styles.circleLocked,
          ]}
        >
          {done ? (
            <Ionicons name="checkmark" size={16} color={visual.color} />
          ) : (
            <Ionicons name="lock-closed" size={14} color={colors.inkMuted} />
          )}
        </View>
      )}
      <Text
        style={[
          styles.nodeLabel,
          stage.current && { color: visual.color, fontWeight: '700' },
          !stage.unlocked && !stage.current && styles.nodeLabelLocked,
        ]}
        numberOfLines={1}
      >
        {/* stage.name comes from the JourneyStageView API data, not a
            hardcoded literal in this component -- left untranslated,
            consistent with JourneyScreen.tsx's own handling of stage
            names elsewhere. */}
        {stage.name}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: spacing.sm },
    heading: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
    node: { alignItems: 'center', width: 64, gap: spacing.xs },
    circle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    circleDone: { backgroundColor: colors.surfaceRaised },
    circleCurrent: { backgroundColor: colors.surfaceRaised },
    circleLocked: { borderColor: colors.border },
    currentWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    pulseRing: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
    },
    nodeLabel: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
    nodeLabelLocked: { opacity: 0.6 },
  });
}
