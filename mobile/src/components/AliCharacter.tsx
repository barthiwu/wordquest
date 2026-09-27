import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import type { AliExpression, AliIntensity, AliPose } from '@/services/aliExpression';
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
const AnimatedView = Animated.View;

export interface AliCharacterProps {
  size?: number;
  /** Bible §4 expression — see ali-expression.ts on the backend for how these get chosen. Defaults to a resting NEUTRAL. */
  expression?: AliExpression;
  /** Bible §5 pose — defaults to PERCHED (the same idle stance AliMarkAnimated always showed). */
  pose?: AliPose;
  /** Bible §6 reaction tier (0-5) — scales how strong the rune-glow accent and hop height read. 0 renders like the old idle-only AliMarkAnimated. */
  intensity?: AliIntensity;
  /** Whether the continuous idle loops (breathing, blink, tail sway, wing flutter, rune pulse, glint) keep running underneath the pose/expression targets. Default true; false gives a perfectly still frame (thumbnails, reduced-motion). */
  animated?: boolean;
}

/**
 * ALI in full motion, expression- and pose-aware — the rig the ALI
 * Character & Animation Bible v1 asks for (§4 Expressions, §5 Poses,
 * §15 "do not create unrelated versions of ALI for each emotion; every
 * state must trace back to the canonical character reference").
 *
 * This is deliberately NOT twelve-times-sixteen bespoke drawings. It's
 * one rig — the exact same "Mystic Scholar" geometry AliMark/
 * AliMarkAnimated already draw from (aliMagpieShapes.ts) — with a small
 * set of numeric target channels (head tilt, wing rotation/spread, tail
 * angle, a vertical hop, rune glow strength, eye/lid shape) that every
 * expression and pose is expressed as a combination of. The existing
 * idle loops (breathe, blink, tailSway, wingFlutter, rune pulse, glint)
 * keep running underneath via Animated.add — ALI never goes fully
 * static, even mid-reaction, the same "always a little alive" quality
 * the original idle mark had.
 *
 * Use this wherever a reaction needs to actually look like something —
 * AliBubble's quick-reaction avatar, a major-moment render, the ALI
 * feed. For a perfectly static small mark (a button icon, a list-row
 * avatar) AliMark is still the right, cheaper choice.
 */
export function AliCharacter({
  size = 96,
  expression = 'NEUTRAL',
  pose = 'PERCHED',
  intensity = 0,
  animated = true,
}: AliCharacterProps) {
  const bg = '#12102A';
  const cream = '#F4F1E8';
  const accent = '#C4B5FD';
  const gold = '#D9A94B';

  // -- Continuous idle loops (unchanged from AliMarkAnimated) -----------
  const breathe = useRef(new Animated.Value(0)).current;
  const tailSway = useRef(new Animated.Value(0)).current;
  const wingFlutter = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const rune = useRef(new Animated.Value(0)).current;
  const glint = useRef(new Animated.Value(0)).current;

  // -- One-shot "reaction" loops, only active for poses that ask for them --
  const bounce = useRef(new Animated.Value(0)).current;
  const nod = useRef(new Animated.Value(0)).current;
  const fastFlap = useRef(new Animated.Value(0)).current;

  // -- Settle: where this pose/expression holds relative to idle (0 = just arrived, 1 = settled) --
  const poseSettle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return undefined;
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
  }, [animated, breathe, tailSway, wingFlutter, blink, rune, glint]);

  const target = POSE_TARGETS[pose];
  const expr = EXPRESSION_TARGETS[expression];

  useEffect(() => {
    poseSettle.setValue(0);
    Animated.spring(poseSettle, {
      toValue: 1,
      useNativeDriver: false,
      friction: 6,
      tension: 50,
    }).start();
    // Re-settle whenever the pose or expression identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose, expression]);

  useEffect(() => {
    if (!animated) return undefined;
    const loops: Animated.CompositeAnimation[] = [];
    if (target.bounceLoop) {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(bounce, {
              toValue: 1,
              duration: 260,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(bounce, {
              toValue: 0,
              duration: 340,
              easing: Easing.in(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
        ),
      );
    }
    if (target.nodLoop) {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(nod, {
              toValue: 1,
              duration: 380,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
            Animated.timing(nod, {
              toValue: 0,
              duration: 380,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
          ]),
          { iterations: 2 },
        ),
      );
    }
    if (target.fastFlap) {
      loops.push(
        Animated.loop(
          Animated.timing(fastFlap, {
            toValue: 1,
            duration: 260,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ),
      );
    }
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
      bounce.setValue(0);
      nod.setValue(0);
      fastFlap.setValue(0);
    };
  }, [animated, target, bounce, nod, fastFlap]);

  // -- Idle interpolations (unchanged amplitudes from AliMarkAnimated) --
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
  const idleTailRotate = tailSway.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] });
  const idleWingRotate = wingFlutter.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 3, 0],
  });
  const fastFlapRotate = fastFlap.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 14, 0] });
  const eyelidOpacity = blink.interpolate({
    inputRange: [0, 0.85, 0.92, 0.96, 1],
    outputRange: [0, 0, 1, 0, 0],
  });
  const glintOpacity = glint.interpolate({
    inputRange: [0, 0.7, 0.75, 0.8, 1],
    outputRange: [0, 0, 0.9, 0, 0],
  });

  // -- Pose settle interpolations (idle -> this pose's target) ----------
  const settledTailOffset = poseSettle.interpolate({
    inputRange: [0, 1],
    outputRange: [0, target.tailRotate],
  });
  const settledWingOffset = poseSettle.interpolate({
    inputRange: [0, 1],
    outputRange: [0, target.wingRotate],
  });
  const settledHeadRotate = poseSettle.interpolate({
    inputRange: [0, 1],
    outputRange: [0, target.headRotate],
  });
  const settledWingScale = poseSettle.interpolate({
    inputRange: [0, 1],
    outputRange: [1, target.wingScale],
  });
  const settledBodyScale = poseSettle.interpolate({
    inputRange: [0, 1],
    outputRange: [1, expr.bodyScale],
  });

  const bounceLift = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10 - intensity * 2],
  });
  const nodTilt = nod.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });

  const tailRotate = Animated.add(idleTailRotate, settledTailOffset);
  const wingRotate = Animated.add(
    Animated.add(idleWingRotate, target.fastFlap ? fastFlapRotate : 0),
    settledWingOffset,
  );
  const headRotate = Animated.add(settledHeadRotate, nodTilt);

  // -- Expression -> rune treatment ---------------------------------------
  const runeGlowOpacity = rune.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [
      0.35 + expr.glowBoost,
      0.75 + expr.glowBoost + intensity * 0.03,
      0.35 + expr.glowBoost,
    ],
  });
  const runeGlowR = rune.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [RUNE_GLOW.r, RUNE_GLOW.r + 4 + intensity, RUNE_GLOW.r],
  });

  return (
    <AnimatedView
      style={{ width: size, height: size * MAGPIE_ASPECT, transform: [{ translateY: bounceLift }] }}
    >
      <Svg width={size} height={size * MAGPIE_ASPECT} viewBox={MAGPIE_VIEW_BOX} fill="none">
        <Defs>
          <LinearGradient
            id="aliTailGrad2"
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
            id="aliWingGrad2"
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
            id="aliBeakGrad2"
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

        {/* tail */}
        <AnimatedG rotation={tailRotate} origin={TAIL_PIVOT}>
          <Path d={TAIL_D} fill="url(#aliTailGrad2)" />
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

        {/* body -- an outer settle-scale (proud puff / discouraged hunch) around the existing breathe-pulsed ellipses */}
        <AnimatedG scale={settledBodyScale} origin={`${BODY.cx}, ${BODY.cy}`}>
          <AnimatedEllipse cx={BODY.cx} cy={BODY.cy} rx={bodyRx} ry={bodyRy} fill={bg} />
          <AnimatedEllipse cx={BELLY.cx} cy={BELLY.cy} rx={bellyRx} ry={bellyRy} fill={cream} />
        </AnimatedG>

        {/* tucked quill */}
        <Path d={QUILL_D} fill={cream} stroke="#cfcabe" strokeWidth={1} />
        <Path d={QUILL_LINE_A_D} stroke="#cfcabe" strokeWidth={1.5} />
        <Path d={QUILL_LINE_B_D} stroke="#cfcabe" strokeWidth={1.5} />
        <Path d={QUILL_LINE_C_D} stroke="#cfcabe" strokeWidth={1.5} />

        {/* wing -- rotation reads as flutter/twitch/flap, scale reads as a partial/full "spread" without new artwork */}
        <AnimatedG rotation={wingRotate} scale={settledWingScale} origin={WING_PIVOT}>
          <Path d={WING_D} fill="url(#aliWingGrad2)" />
          <Path d={WING_HIGHLIGHT_D} fill={cream} opacity={0.92} />
        </AnimatedG>

        {/* head group -- tilts/nods/droops as one unit */}
        <AnimatedG rotation={headRotate} origin={`${HEAD.cx}, ${HEAD.cy}`}>
          <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={bg} />
          <Path d={HEAD_TUFT_D} fill={bg} />

          <G
            scale={expr.eyeScale}
            origin={`${EYE_WHITE.cx}, ${EYE_WHITE.cy}`}
            translate={`0, ${expr.pupilOffsetY}`}
          >
            <Circle cx={EYE_WHITE.cx} cy={EYE_WHITE.cy} r={EYE_WHITE.r} fill={cream} />
            <Circle cx={EYE_PUPIL.cx} cy={EYE_PUPIL.cy} r={EYE_PUPIL.r} fill="#0c0c10" />
            <Circle
              cx={EYE_HIGHLIGHT.cx}
              cy={EYE_HIGHLIGHT.cy}
              r={EYE_HIGHLIGHT.r}
              fill="#ffffff"
            />
          </G>
          <AnimatedEllipse
            cx={EYELID.cx}
            cy={EYELID.cy}
            rx={EYELID.rx}
            ry={EYELID.ry}
            fill={bg}
            opacity={eyelidOpacity}
          />
          {/* expression eyelid -- a held (not blinking) top-lid droop for CONCERNED/DISAPPOINTED/FOCUSED, distinct from the brief animated blink above */}
          {expr.lidDroop > 0 && (
            <Ellipse
              cx={EYELID.cx}
              cy={EYELID.cy - EYELID.ry * (1 - expr.lidDroop)}
              rx={EYELID.rx}
              ry={EYELID.ry * expr.lidDroop}
              fill={bg}
              opacity={0.9}
            />
          )}

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

          <Path d={BEAK_D} fill="url(#aliBeakGrad2)" stroke="#8a6a1f" strokeWidth={1.5} />
        </AnimatedG>

        {/* glowing rune -- brighter/bigger for higher-energy expressions and higher intensity tiers */}
        <AnimatedCircle
          cx={RUNE_GLOW.cx}
          cy={RUNE_GLOW.cy}
          r={runeGlowR}
          fill={accent}
          opacity={runeGlowOpacity}
        />
        <Circle
          cx={RUNE_CORE.cx}
          cy={RUNE_CORE.cy}
          r={RUNE_CORE.r}
          fill="#efe6ff"
          stroke="#6c4fd1"
          strokeWidth={2}
        />
        <Path d={RUNE_MARK_D} stroke="#6c4fd1" strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    </AnimatedView>
  );
}

interface PoseTarget {
  /** Extra rotation (degrees) added on top of the idle tail sway. */
  tailRotate: number;
  /** Extra rotation (degrees) added on top of the idle wing flutter. */
  wingRotate: number;
  /** Head-group rotation (degrees) — positive tilts toward the beak side. */
  headRotate: number;
  /** Wing group scale — >1 reads as a more "unfurled" wing without new artwork. */
  wingScale: number;
  /** A short repeating vertical bounce (hop/celebratory hop/takeoff). */
  bounceLoop: boolean;
  /** A couple of head-dip repeats (approving nod). */
  nodLoop: boolean;
  /** A faster, wider wing flutter than idle (flight/takeoff/twitch). */
  fastFlap: boolean;
}

const BASE_TARGET: PoseTarget = {
  tailRotate: 0,
  wingRotate: 0,
  headRotate: 0,
  wingScale: 1,
  bounceLoop: false,
  nodLoop: false,
  fastFlap: false,
};

/**
 * Bible §5's pose list, each expressed as a small set of offsets from
 * the idle rig rather than new artwork — see this file's top doc
 * comment for why. Grouped in the bible's own order. Flight-family
 * poses (TAKEOFF/FLIGHT/CIRCULAR_FLIGHT/LANDING) are the bird's own
 * body language (wide fast flap, streamlined tail) — actually moving
 * the character across the screen for a cinematic moment is a
 * screen-level concern layered on top, not this rig's job.
 */
const POSE_TARGETS: Record<AliPose, PoseTarget> = {
  PERCHED: BASE_TARGET,
  STANDING: { ...BASE_TARGET, tailRotate: -2 },
  HEAD_TILT: { ...BASE_TARGET, headRotate: 11 },
  LOOK_AT_RESULT: { ...BASE_TARGET, headRotate: 6 },
  HOP: { ...BASE_TARGET, bounceLoop: true, tailRotate: -3 },
  WING_TWITCH: { ...BASE_TARGET, wingRotate: 10, fastFlap: true },
  WING_SPREAD_PARTIAL: { ...BASE_TARGET, wingRotate: 18, wingScale: 1.08 },
  WING_SPREAD_FULL: { ...BASE_TARGET, wingRotate: 32, wingScale: 1.18 },
  TAKEOFF: { ...BASE_TARGET, wingRotate: 26, wingScale: 1.12, fastFlap: true, bounceLoop: true },
  FLIGHT: { ...BASE_TARGET, wingRotate: 22, wingScale: 1.1, fastFlap: true, tailRotate: -8 },
  CIRCULAR_FLIGHT: {
    ...BASE_TARGET,
    wingRotate: 22,
    wingScale: 1.1,
    fastFlap: true,
    tailRotate: -8,
  },
  LANDING: { ...BASE_TARGET, wingRotate: 14, wingScale: 1.05, headRotate: -4 },
  CELEBRATORY_HOP: { ...BASE_TARGET, bounceLoop: true, wingRotate: 14, tailRotate: -6 },
  APPROVING_NOD: { ...BASE_TARGET, nodLoop: true },
  CONCERN_DROP: { ...BASE_TARGET, headRotate: -9, wingRotate: -4, tailRotate: 2 },
  FOCUSED_STANCE: { ...BASE_TARGET, wingRotate: -2 },
};

interface ExpressionTarget {
  /** Uniform eye-group scale — >1 wide/alert, <1 narrowed/squinting. */
  eyeScale: number;
  /** Small vertical shift (SVG units) of the eye group — a soft downward look for gentler expressions. */
  pupilOffsetY: number;
  /** 0 = no held droop, up to ~0.5 = a sympathetic/sad upper-lid droop. Independent of the blink loop. */
  lidDroop: number;
  /** Added to the rune glow's base opacity — how much this expression "lights up". */
  glowBoost: number;
  /** Body group scale — a small proud puff or a small discouraged hunch. */
  bodyScale: number;
}

const NEUTRAL_EXPR: ExpressionTarget = {
  eyeScale: 1,
  pupilOffsetY: 0,
  lidDroop: 0,
  glowBoost: 0,
  bodyScale: 1,
};

/** Bible §4's expression list, each a small nudge on the same channels above. */
const EXPRESSION_TARGETS: Record<AliExpression, ExpressionTarget> = {
  NEUTRAL: NEUTRAL_EXPR,
  CURIOUS: { ...NEUTRAL_EXPR, eyeScale: 1.08 },
  PLEASED: { ...NEUTRAL_EXPR, glowBoost: 0.08, bodyScale: 1.02 },
  EXCITED: { ...NEUTRAL_EXPR, eyeScale: 1.12, glowBoost: 0.18, bodyScale: 1.04 },
  PROUD: { ...NEUTRAL_EXPR, glowBoost: 0.16, bodyScale: 1.06 },
  SURPRISED: { ...NEUTRAL_EXPR, eyeScale: 1.3, pupilOffsetY: -1 },
  CONCERNED: { ...NEUTRAL_EXPR, eyeScale: 0.92, lidDroop: 0.35, bodyScale: 0.98 },
  DISAPPOINTED: {
    ...NEUTRAL_EXPR,
    eyeScale: 0.88,
    lidDroop: 0.5,
    bodyScale: 0.96,
    pupilOffsetY: 1.5,
  },
  MISCHIEVOUS: { ...NEUTRAL_EXPR, eyeScale: 0.85, lidDroop: 0.2, glowBoost: 0.1 },
  ENCOURAGING: { ...NEUTRAL_EXPR, eyeScale: 1.04, glowBoost: 0.06 },
  FOCUSED: { ...NEUTRAL_EXPR, eyeScale: 0.82, lidDroop: 0.15 },
  TRIUMPHANT: { ...NEUTRAL_EXPR, eyeScale: 1.1, glowBoost: 0.28, bodyScale: 1.08 },
};
