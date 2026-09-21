import { useEffect, useRef, useMemo } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { journeyVisualFor } from '@/constants/journeyVisuals';

interface Props {
  stageName: string;
  primaryTitle: string;
  stageKey: string;
  onDismiss: () => void;
}

/**
 * The Journey stage-up celebration (V1 Completion spec, Sprint 3). Built
 * on React Native's own Animated API rather than a new animation
 * dependency — a scale+fade entrance is all a modal moment like this
 * needs, and it keeps the mobile bundle's dependency surface unchanged.
 * JourneyScreen decides WHEN this appears (see its own doc comment for
 * the "advanced within this app session" rule); this component only
 * renders the moment once told to.
 */
export function JourneyCelebration({ stageName, primaryTitle, stageKey, onDismiss }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const visual = journeyVisualFor(stageKey);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          <View style={[styles.iconRing, { borderColor: visual.color }]}>
            <Ionicons name={visual.icon} size={40} color={visual.color} />
          </View>
          <Text style={styles.eyebrow}>Journey advanced</Text>
          <Text style={[styles.stageName, { color: visual.color }]}>{stageName}</Text>
          <Text style={styles.title}>{primaryTitle}</Text>
          <Pressable
            style={styles.button}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
    maxWidth: 340,
  },
  iconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  eyebrow: {
    color: colors.inkMuted,
    fontSize: typography.scale.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stageName: {
    fontSize: typography.scale.xxl,
    fontWeight: typography.display.weight,
  },
  title: { color: colors.ink, fontSize: typography.scale.md, marginBottom: spacing.md },
  button: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
});
}
