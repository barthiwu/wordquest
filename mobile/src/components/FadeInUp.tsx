import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

interface FadeInUpProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Milliseconds to wait before starting — lets sibling FadeInUps stagger. */
  delay?: number;
  /** Starting vertical offset in px; animates down to 0. */
  distance?: number;
}

/**
 * Lightweight fade + slide-up entrance, built on React Native's built-in
 * Animated API (Sprint 5 "mobile polish: animations" — no new dependency,
 * matching the same choice already made for JourneyCelebration). Meant
 * for reward/result reveals — Quest Complete, feedback stages, card
 * details — where an instant static swap feels flat. Animates once per
 * mount via useRef, so a keyed remount (e.g. a new feedback stage)
 * re-triggers it naturally without extra state.
 */
export function FadeInUp({ children, style, delay = 0, distance = 16 }: FadeInUpProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
    // Intentionally empty deps — this is a one-shot entrance animation for the mount, not a reactive effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
