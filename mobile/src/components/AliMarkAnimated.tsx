import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { QUILL_BODY_D, DROP_D, SWIRL_D } from './AliMark';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface AliMarkAnimatedProps {
  size?: number;
}

/**
 * ALI's mark in full motion — the animated concept approved on the
 * Glyph & ALI design canvas, ported from its CSS keyframes to React
 * Native's Animated API (react-native-svg has no CSS animation support,
 * so each keyframe becomes an interpolate() breakpoint on a looping
 * driver value, and each moving group becomes an Animated.createAnimated
 * Component wrapper). Three independent loops, matching the canvas
 * exactly:
 *
 *  - `bounce` (2.4s, ease-in-out): the quill dips down and back up, as
 *    if writing — and the marginalia swirl (nested INSIDE the bounce
 *    group, not a sibling — see AliMark's own geometry notes) draws in
 *    via stroke-dashoffset exactly as the quill bounces down, then
 *    fades before the next dip.
 *  - `drip1` / `drip2` (1.3s, ease-in, drip2 offset 0.55s so they don't
 *    fall in lockstep): two ink drops beading down the quill's spine,
 *    fading in as they start and out as they land.
 *
 * This is a deliberate "ALI moment," not an inline icon — use it
 * somewhere ALI is meant to feel present (Quest Complete's reward
 * reveal). For a small avatar-scale mark, use the static AliMark
 * instead; motion this detailed reads as noise below ~40px.
 */
export function AliMarkAnimated({ size = 72 }: AliMarkAnimatedProps) {
  const bg = '#12102A';
  const accent = '#C4B5FD';

  const bounce = useRef(new Animated.Value(0)).current;
  const drip1 = useRef(new Animated.Value(0)).current;
  const drip2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounceLoop = Animated.loop(
      Animated.timing(bounce, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    );
    const drip1Loop = Animated.loop(
      Animated.timing(drip1, {
        toValue: 1,
        duration: 1300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: false,
      }),
    );
    const drip2Loop = Animated.sequence([
      Animated.delay(550),
      Animated.loop(
        Animated.timing(drip2, {
          toValue: 1,
          duration: 1300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: false,
        }),
      ),
    ]);

    bounceLoop.start();
    drip1Loop.start();
    drip2Loop.start();

    return () => {
      bounceLoop.stop();
      drip1Loop.stop();
      drip2Loop.stop();
      bounce.setValue(0);
      drip1.setValue(0);
      drip2.setValue(0);
    };
  }, [bounce, drip1, drip2]);

  // Same breakpoints as the canvas's @keyframes bounce / swirlin, just
  // expressed as fractions of the 2.4s cycle (0.38 = 38%, etc.) instead
  // of CSS percentages.
  const quillTransform = bounce.interpolate({
    inputRange: [0, 0.38, 0.55, 0.75, 1],
    outputRange: ['translate(0,0)', 'translate(0,0)', 'translate(0,12)', 'translate(0,12)', 'translate(0,0)'],
  });
  const swirlOpacity = bounce.interpolate({
    inputRange: [0, 0.38, 0.55, 0.75, 0.9, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
  });
  const swirlDashoffset = bounce.interpolate({
    inputRange: [0, 0.38, 0.55, 0.75, 0.9, 1],
    outputRange: [100, 100, 0, 0, 0, 100],
  });

  const dripTransform = (v: Animated.Value) =>
    v.interpolate({
      inputRange: [0, 1],
      outputRange: ['translate(0,0)', 'translate(0,70)'],
    });
  const dripOpacity = (v: Animated.Value) =>
    v.interpolate({
      inputRange: [0, 0.08, 0.75, 1],
      outputRange: [0, 1, 1, 0],
    });

  return (
    <Svg width={size} height={size * (210 / 120)} viewBox="0 0 120 210" fill="none">
      <AnimatedG transform={quillTransform}>
        <G transform="rotate(-28,58,132)">
          <Path d={QUILL_BODY_D} fill={accent} opacity={0.94} />
          <Path d="M60,20 L58,128" stroke={bg} strokeWidth={2} strokeLinecap="round" opacity={0.5} />

          <G transform="translate(51,30)">
            <AnimatedG transform={dripTransform(drip1)}>
              <AnimatedPath d={DROP_D} fill={bg} transform="scale(0.9)" opacity={dripOpacity(drip1)} />
            </AnimatedG>
          </G>
          <G transform="translate(50,26)">
            <AnimatedG transform={dripTransform(drip2)}>
              <AnimatedPath d={DROP_D} fill={bg} transform="scale(0.72)" opacity={dripOpacity(drip2)} />
            </AnimatedG>
          </G>
        </G>

        <AnimatedG transform="translate(16.6,115.1) scale(0.9)" opacity={swirlOpacity}>
          <AnimatedPath
            d={SWIRL_D}
            stroke={accent}
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="100"
            strokeDashoffset={swirlDashoffset}
          />
          <Circle cx={46} cy={21} r={4.5} fill={accent} />
        </AnimatedG>
      </AnimatedG>
    </Svg>
  );
}
