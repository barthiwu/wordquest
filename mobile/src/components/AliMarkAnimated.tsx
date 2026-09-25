import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import {
  BEAK_D,
  BELLY,
  BODY,
  EYELID,
  EYE_HIGHLIGHT,
  EYE_PUPIL,
  EYE_WHITE,
  GLINT_D,
  HEAD,
  HEAD_TUFT_D,
  MAGPIE_ASPECT,
  MAGPIE_VIEW_BOX,
  MONOCLE_ARM_D,
  MONOCLE_RING,
  QUILL_D,
  QUILL_LINE_A_D,
  QUILL_LINE_B_D,
  QUILL_LINE_C_D,
  RUNE_CORE,
  RUNE_GLOW,
  RUNE_MARK_D,
  TAIL_D,
  TAIL_LINE_A_D,
  TAIL_LINE_B_D,
  TAIL_PIVOT,
  WING_D,
  WING_HIGHLIGHT_D,
  WING_PIVOT,
} from './aliMagpieShapes';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface AliMarkAnimatedProps {
  size?: number;
}

/**
 * ALI's mark in full motion — "The Mystic Scholar" magpie, ported from
 * the design canvas's SVG `<animate>`/`<animateTransform>` timings to
 * React Native's Animated API (react-native-svg has no SMIL/CSS animation
 * support, so each keyframe becomes an interpolate() breakpoint on a
 * looping driver value — the same technique the previous quill mark used,
 * just five independent loops instead of three):
 *
 *  - `breathe` (3.2s): body and belly ellipses grow/shrink their rx/ry a
 *    few px, like a slow chest breath.
 *  - `tailSway` (5s) / `wingFlutter` (4s, offset 0.3s): the tail and wing
 *    groups rotate a few degrees around their attach points.
 *  - `blink` (4.5s): an eyelid-colored ellipse fades in and out over the
 *    eye.
 *  - `rune` (2.4s): the glowing rune's halo pulses opacity and radius,
 *    its core twinkles.
 *  - `glint` (6s): a small highlight streak flashes across the monocle.
 *
 * This is a deliberate "ALI moment," not an inline icon — use it
 * somewhere ALI is meant to feel present (Quest Complete's reward
 * reveal, the ALI screen hero). For a small avatar-scale mark, use the
 * static AliMark instead; motion this detailed reads as noise below
 * ~40px.
 */
export function AliMarkAnimated({ size = 72 }: AliMarkAnimatedProps) {
  const bg = '#12102A';
  const cream = '#F4F1E8';
  const accent = '#C4B5FD';
  const gold = '#D9A94B';

  const breathe = useRef(new Animated.Value(0)).current;
  const tailSway = useRef(new Animated.Value(0)).current;
  const wingFlutter = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const rune = useRef(new Animated.Value(0)).current;
  const glint = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (value: Animated.Value, duration: number, delay = 0) =>
      Animated.sequence([
        ...(delay > 0 ? [Animated.delay(delay)] : []),
        Animated.loop(
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ),
      ]);

    const loops = [
      loop(breathe, 3200),
      loop(tailSway, 5000),
      loop(wingFlutter, 4000, 300),
      loop(blink, 4500),
      loop(rune, 2400),
      loop(glint, 6000),
    ];

    loops.forEach((l) => l.start());

    return () => {
      loops.forEach((l) => l.stop());
      [breathe, tailSway, wingFlutter, blink, rune, glint].forEach((v) => v.setValue(0));
    };
  }, [breathe, tailSway, wingFlutter, blink, rune, glint]);

  const bodyRx = breathe.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [BODY.rx, BODY.rx + 3, BODY.rx],
  });
  const bodyRy = breathe.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [BODY.ry, BODY.ry + 3, BODY.ry],
  });
  const bellyRx = breathe.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [BELLY.rx, BELLY.rx + 2, BELLY.rx],
  });
  const bellyRy = breathe.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [BELLY.ry, BELLY.ry + 2, BELLY.ry],
  });

  const tailRotate = tailSway.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] });
  const wingRotate = wingFlutter.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 3, 0] });

  const eyelidOpacity = blink.interpolate({
    inputRange: [0, 0.85, 0.92, 0.96, 1],
    outputRange: [0, 0, 1, 0, 0],
  });

  const runeGlowOpacity = rune.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 0.9, 0.45],
  });
  const runeGlowR = rune.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [RUNE_GLOW.r, RUNE_GLOW.r + 4, RUNE_GLOW.r],
  });
  const runeCoreOpacity = rune.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.85, 1, 0.85],
  });

  const glintOpacity = glint.interpolate({
    inputRange: [0, 0.7, 0.75, 0.8, 1],
    outputRange: [0, 0, 0.9, 0, 0],
  });

  return (
    <Svg width={size} height={size * MAGPIE_ASPECT} viewBox={MAGPIE_VIEW_BOX} fill="none">
      <Defs>
        <LinearGradient
          id="aliTailGrad"
          x1="170"
          y1="298"
          x2="40"
          y2="432"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor="#241a3d" />
          <Stop offset="55%" stopColor="#5b3fae" />
          <Stop offset="100%" stopColor={accent} />
        </LinearGradient>
        <LinearGradient
          id="aliWingGrad"
          x1="249"
          y1="188"
          x2="316"
          y2="335"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor="#1b2a3d" />
          <Stop offset="50%" stopColor="#2f6f7a" />
          <Stop offset="100%" stopColor="#6a4fc9" />
        </LinearGradient>
        <LinearGradient
          id="aliBeakGrad"
          x1="315"
          y1="165"
          x2="380"
          y2="190"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor="#f4d773" />
          <Stop offset="100%" stopColor={gold} />
        </LinearGradient>
      </Defs>

      {/* tail (gentle sway) */}
      <AnimatedG rotation={tailRotate} origin={TAIL_PIVOT}>
        <Path d={TAIL_D} fill="url(#aliTailGrad)" />
        <Path
          d={TAIL_LINE_A_D}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={TAIL_LINE_B_D}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
      </AnimatedG>

      {/* body (breathing) */}
      <AnimatedEllipse cx={BODY.cx} cy={BODY.cy} rx={bodyRx} ry={bodyRy} fill={bg} />
      <AnimatedEllipse cx={BELLY.cx} cy={BELLY.cy} rx={bellyRx} ry={bellyRy} fill={cream} />

      {/* tucked quill */}
      <Path d={QUILL_D} fill={cream} stroke="#cfcabe" strokeWidth={1} />
      <Path d={QUILL_LINE_A_D} stroke="#cfcabe" strokeWidth={1.5} />
      <Path d={QUILL_LINE_B_D} stroke="#cfcabe" strokeWidth={1.5} />
      <Path d={QUILL_LINE_C_D} stroke="#cfcabe" strokeWidth={1.5} />

      {/* wing (flutter) */}
      <AnimatedG rotation={wingRotate} origin={WING_PIVOT}>
        <Path d={WING_D} fill="url(#aliWingGrad)" />
        <Path d={WING_HIGHLIGHT_D} fill={cream} opacity={0.92} />
      </AnimatedG>

      {/* head */}
      <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={bg} />
      <Path d={HEAD_TUFT_D} fill={bg} />

      {/* eye + monocle */}
      <Circle cx={EYE_WHITE.cx} cy={EYE_WHITE.cy} r={EYE_WHITE.r} fill={cream} />
      <Circle cx={EYE_PUPIL.cx} cy={EYE_PUPIL.cy} r={EYE_PUPIL.r} fill="#0c0c10" />
      <Circle cx={EYE_HIGHLIGHT.cx} cy={EYE_HIGHLIGHT.cy} r={EYE_HIGHLIGHT.r} fill="#ffffff" />
      <AnimatedEllipse
        cx={EYELID.cx}
        cy={EYELID.cy}
        rx={EYELID.rx}
        ry={EYELID.ry}
        fill={bg}
        opacity={eyelidOpacity}
      />
      <Circle
        cx={MONOCLE_RING.cx}
        cy={MONOCLE_RING.cy}
        r={MONOCLE_RING.r}
        fill="none"
        stroke={gold}
        strokeWidth={2.5}
      />
      <Path d={MONOCLE_ARM_D} stroke={gold} strokeWidth={2} fill="none" strokeLinecap="round" />
      <AnimatedPath
        d={GLINT_D}
        stroke="#fff8e0"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        opacity={glintOpacity}
      />

      {/* beak */}
      <Path d={BEAK_D} fill="url(#aliBeakGrad)" stroke="#8a6a1f" strokeWidth={1.5} />

      {/* glowing rune */}
      <AnimatedCircle
        cx={RUNE_GLOW.cx}
        cy={RUNE_GLOW.cy}
        r={runeGlowR}
        fill={accent}
        opacity={runeGlowOpacity}
      />
      <AnimatedCircle
        cx={RUNE_CORE.cx}
        cy={RUNE_CORE.cy}
        r={RUNE_CORE.r}
        fill="#efe6ff"
        stroke="#6c4fd1"
        strokeWidth={2}
        opacity={runeCoreOpacity}
      />
      <Path d={RUNE_MARK_D} stroke="#6c4fd1" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
