import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import type { AliExpression, AliIntensity, AliPose } from '@/services/aliExpression';
import {
  BEAK_PIVOT,
  BELLY_D,
  BELLY_LINE_D,
  BILL_LOWER_D,
  BILL_UPPER_D,
  BILL_UPPER_SHEEN_D,
  BODY_D,
  COVERTS_D,
  COVERTS_LINES_D,
  EYE,
  FAR_WING_FEATHER_INDEXES,
  FEET,
  HEAD_D,
  HEAD_PIVOT,
  HEAD_SHEEN_D,
  MAGPIE_ASPECT,
  MAGPIE_VIEW_BOX,
  MONOCLE,
  MONOCLE_CHAIN_D,
  MONOCLE_GLINT_D,
  QUILL,
  QUILL_BARBS_D,
  QUILL_D,
  QUILL_SHAFT_D,
  RUNE,
  RUNE_MARK_D,
  RUNE_ORBIT_DOTS,
  SHOULDER_STREAK_D,
  SPARKLE_SPOTS,
  TAIL_FEATHERS,
  TAIL_PIVOT,
  WING_FEATHERS,
  WING_PIVOT,
  legPath,
  originOf,
} from './aliMagpieShapes';
import {
  CHANNEL_LIMITS,
  CHANNEL_NAMES,
  MAX_LAYERS,
  resolveAliRig,
  type ChannelName,
  type MotionLayer,
} from './aliRig';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Node =
  | Animated.Value
  | Animated.AnimatedInterpolation<number>
  | Animated.AnimatedAddition<number>
  | Animated.AnimatedMultiplication<number>;

export type AliFraming = 'full' | 'bust';

/** The `bust` framing crops to head + shoulders so the face reads at avatar sizes. */
const BUST_VIEW_BOX = '176 30 200 190';
const BUST_ASPECT = 190 / 200;

export function aliAspect(framing: AliFraming = 'full'): number {
  return framing === 'bust' ? BUST_ASPECT : MAGPIE_ASPECT;
}

export interface AliCharacterProps {
  size?: number;
  /** Bible §4 expression. */
  expression?: AliExpression;
  /** Bible §5 pose. */
  pose?: AliPose;
  /** Bible §6 tier (0-5) — scales gesture size, rune glow and celebration sparkles. */
  intensity?: AliIntensity;
  /** Whether motion plays (idle loops, gestures, flight). False — and the OS reduced-motion setting — render one held still frame. */
  animated?: boolean;
  /** 'bust' crops to head and shoulders for small avatars; 'full' shows the whole bird. */
  framing?: AliFraming;
}

let uidCounter = 0;

const range = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1));

function sum(parts: Node[]): Node {
  return parts.reduce((a: Node, b: Node): Node => Animated.add(a, b));
}

const starPath = (x: number, y: number, r: number) =>
  `M${x},${y - r} C${x + 0.12 * r},${y - 0.28 * r} ${x + 0.28 * r},${y - 0.12 * r} ${x + r},${y} ` +
  `C${x + 0.28 * r},${y + 0.12 * r} ${x + 0.12 * r},${y + 0.28 * r} ${x},${y + r} ` +
  `C${x - 0.12 * r},${y + 0.28 * r} ${x - 0.28 * r},${y + 0.12 * r} ${x - r},${y} ` +
  `C${x - 0.28 * r},${y - 0.12 * r} ${x - 0.12 * r},${y - 0.28 * r} ${x},${y - r} Z`;

/**
 * ALI — "The Mystic Scholar" magpie, expression- and pose-aware (ALI
 * Character & Animation Bible v1 §4/§5/§6/§15). One drawing; every
 * expression and pose is the same ~22 numeric channels (aliRig.ts) so every
 * state traces back to the canonical character. Held channels spring toward
 * their target; keyframed gesture layers (a curious head-sway, a surprised
 * recoil, flapping wings, circular flight) play on top; subtle idle loops
 * (breathing, blinking, tail sway, rune pulse) never stop, so ALI is never
 * fully static. With `animated={false}` or the OS reduced-motion setting he
 * renders one held still frame — the missing-motion fallback the Bible asks
 * for. He never covers input: callers position him beside content.
 */
export function AliCharacter({
  size = 96,
  expression = 'NEUTRAL',
  pose = 'PERCHED',
  intensity = 0,
  animated = true,
  framing = 'full',
}: AliCharacterProps) {
  const reduceMotion = useReduceMotion();
  const motion = animated && !reduceMotion;
  const uid = useRef(0);
  if (uid.current === 0) uid.current = ++uidCounter;
  const id = (name: string) => `ali${uid.current}${name}`;

  const resolved = useMemo(
    () => resolveAliRig(expression, pose, intensity),
    [expression, pose, intensity],
  );

  // -- one Animated.Value per channel (the held pose) ------------------------
  const base = useRef<Record<ChannelName, Animated.Value> | null>(null);
  if (base.current === null) {
    const init = {} as Record<ChannelName, Animated.Value>;
    CHANNEL_NAMES.forEach((n) => {
      init[n] = new Animated.Value(resolved.channels[n]);
    });
    base.current = init;
  }
  const channelValues = base.current;

  // -- motion phases + idle loops ----------------------------------------------
  const phases = useRef<Animated.Value[] | null>(null);
  if (phases.current === null)
    phases.current = Array.from({ length: MAX_LAYERS }, () => new Animated.Value(0));
  const phase = phases.current;
  const idle = useRef({
    breathe: new Animated.Value(0),
    tail: new Animated.Value(0),
    wing: new Animated.Value(0),
    blink: new Animated.Value(0),
    rune: new Animated.Value(0),
    orbit: new Animated.Value(0),
    sparks: Array.from({ length: SPARKLE_SPOTS.length }, () => new Animated.Value(0)),
  }).current;

  // Held pose: spring toward the target channels (or snap, when still).
  useEffect(() => {
    if (!motion) {
      CHANNEL_NAMES.forEach((n) => channelValues[n].setValue(resolved.channels[n]));
      return undefined;
    }
    const springs = CHANNEL_NAMES.map((n) =>
      Animated.spring(channelValues[n], {
        toValue: resolved.channels[n],
        friction: 7,
        tension: 70,
        useNativeDriver: false,
      }),
    );
    const all = Animated.parallel(springs);
    all.start();
    return () => all.stop();
  }, [resolved, motion, channelValues]);

  // Gesture layers.
  useEffect(() => {
    phase.forEach((p) => p.setValue(0));
    if (!motion) return undefined;
    const anims = resolved.layers.map((layer, i) => {
      const t = Animated.timing(phase[i], {
        toValue: 1,
        duration: layer.ms,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      return layer.iterations === 1
        ? t
        : Animated.loop(t, { iterations: layer.iterations === 'loop' ? -1 : layer.iterations });
    });
    anims.forEach((a) => a.start());
    return () => {
      anims.forEach((a) => a.stop());
      phase.forEach((p) => p.setValue(0));
    };
  }, [resolved, motion, phase]);

  // Idle: always a little alive.
  useEffect(() => {
    if (!motion) return undefined;
    const loop = (v: Animated.Value, duration: number, easing = Easing.inOut(Easing.ease)) =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: false }));
    const loops = [
      loop(idle.breathe, 3200),
      loop(idle.tail, 5000),
      loop(idle.wing, 4000),
      loop(idle.blink, 4500, Easing.linear),
      loop(idle.rune, 2400),
      loop(idle.orbit, 9000, Easing.linear),
    ];
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
      [idle.breathe, idle.tail, idle.wing, idle.blink, idle.rune, idle.orbit].forEach((v) =>
        v.setValue(0),
      );
    };
  }, [motion, idle]);

  useEffect(() => {
    if (!motion || resolved.sparkles === 0) return undefined;
    const loops = idle.sparks.slice(0, resolved.sparkles).map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 230),
          Animated.timing(v, {
            toValue: 1,
            duration: 1100 + i * 140,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
      idle.sparks.forEach((v) => v.setValue(0));
    };
  }, [motion, resolved.sparkles, idle]);

  // -- compose each channel: held + gestures + idle, clamped --------------------
  const ch = useMemo(() => {
    const out = {} as Record<ChannelName, Node>;
    const layerNode = (layer: MotionLayer, li: number, name: ChannelName): Node | null => {
      const k = layer.keys[name];
      if (!k) return null;
      return phase[li].interpolate({ inputRange: range(k.length), outputRange: k });
    };
    CHANNEL_NAMES.forEach((name) => {
      const parts: Node[] = [channelValues[name]];
      if (motion) {
        resolved.layers.forEach((layer, li) => {
          const n = layerNode(layer, li, name);
          if (n) parts.push(n);
        });
        if (name === 'puff')
          parts.push(
            idle.breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.012, 0] }),
          );
        if (name === 'tailRot')
          parts.push(idle.tail.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -3, 0] }));
        if (name === 'wingLift')
          parts.push(idle.wing.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 2.5, 0] }));
        if (name === 'rune')
          parts.push(idle.rune.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.12, 0] }));
        if (name === 'lid')
          parts.push(
            idle.blink.interpolate({
              inputRange: [0, 0.88, 0.92, 0.96, 1],
              outputRange: [0, 0, 1, 0, 0],
            }),
          );
      }
      let node: Node = sum(parts);
      const lim = CHANNEL_LIMITS[name];
      if (lim) node = node.interpolate({ inputRange: lim, outputRange: lim, extrapolate: 'clamp' });
      out[name] = node;
    });
    return out;
  }, [resolved, motion, channelValues, phase, idle]);

  const negate = (n: Node): Node => Animated.multiply(n, -1);
  const gold = '#D9A94B';
  const showFar = resolved.farWing;
  const eyeOrigin = originOf(EYE);

  const spreadAngle = (folded: number, open: number): Node =>
    ch.wingSpread.interpolate({ inputRange: [0, 1], outputRange: [folded, open] });
  const tailAngle = (folded: number, open: number): Node =>
    ch.tailSpread.interpolate({ inputRange: [0, 1], outputRange: [folded, open] });

  const viewBox = framing === 'bust' ? BUST_VIEW_BOX : MAGPIE_VIEW_BOX;
  const height = size * aliAspect(framing);
  const hopLift = Animated.add(negate(ch.hop), ch.travelY);

  return (
    <View style={{ width: size, height }} pointerEvents="none">
      <Svg
        width={size}
        height={height}
        viewBox={viewBox}
        fill="none"
        style={{ overflow: framing === 'bust' ? 'hidden' : 'visible' }}
      >
        <Defs>
          <LinearGradient id={id('blk')} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2a2560" />
            <Stop offset="0.45" stopColor="#14112f" />
            <Stop offset="1" stopColor="#07061a" />
          </LinearGradient>
          <LinearGradient id={id('head')} x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#3c3a86" />
            <Stop offset="0.5" stopColor="#16132f" />
            <Stop offset="1" stopColor="#0a0818" />
          </LinearGradient>
          <LinearGradient id={id('wing')} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#1c2766" />
            <Stop offset="0.5" stopColor="#2a63c0" />
            <Stop offset="0.82" stopColor="#2fa3b4" />
            <Stop offset="1" stopColor="#8a6be0" />
          </LinearGradient>
          <LinearGradient id={id('tail')} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#1a1440" />
            <Stop offset="0.45" stopColor="#3b3aa8" />
            <Stop offset="0.8" stopColor="#5b7fd0" />
            <Stop offset="1" stopColor="#C4B5FD" />
          </LinearGradient>
          <LinearGradient id={id('cov')} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#26397f" />
            <Stop offset="0.5" stopColor="#1b5cc4" />
            <Stop offset="1" stopColor="#1a3a9a" />
          </LinearGradient>
          <LinearGradient id={id('belly')} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FBF8EE" />
            <Stop offset="1" stopColor="#D9D3C2" />
          </LinearGradient>
          <LinearGradient id={id('gold')} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#f4d773" />
            <Stop offset="1" stopColor={gold} />
          </LinearGradient>
          <LinearGradient id={id('quill')} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#d9d3c2" />
            <Stop offset="1" stopColor="#FFFDF4" />
          </LinearGradient>
          <RadialGradient id={id('rune')} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#C4B5FD" stopOpacity={0.95} />
            <Stop offset="1" stopColor="#C4B5FD" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#8fe3ff" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#8fe3ff" stopOpacity={0} />
          </RadialGradient>
          <ClipPath id={id('headClip')}>
            <Path d={HEAD_D} />
          </ClipPath>
        </Defs>

        {/* ground shadow */}
        <AnimatedG translateX={ch.travelX}>
          <AnimatedEllipse
            cx={FEET.x}
            cy={FEET.y + 6}
            rx={ch.hop.interpolate({
              inputRange: [0, 60],
              outputRange: [70, 44],
              extrapolate: 'clamp',
            })}
            ry={7}
            fill="#000"
            opacity={ch.hop.interpolate({
              inputRange: [0, 60],
              outputRange: [0.28, 0.1],
              extrapolate: 'clamp',
            })}
          />
        </AnimatedG>

        {resolved.glow > 0 && (
          <Circle cx={230} cy={170} r={150} fill={`url(#${id('glow')})`} opacity={resolved.glow} />
        )}

        {/* the bird: lift + travel, then lean about the feet */}
        <AnimatedG translateX={ch.travelX} translateY={hopLift}>
          <AnimatedG rotation={ch.bodyRot} origin={originOf(FEET)}>
            {/* far wing (only when the wings open) */}
            {showFar && (
              <AnimatedG
                opacity={ch.wingSpread.interpolate({
                  inputRange: [0.15, 0.35],
                  outputRange: [0, 0.75],
                  extrapolate: 'clamp',
                })}
                rotation={Animated.add(Animated.multiply(ch.wingLift, -0.6), -8)}
                origin={originOf(WING_PIVOT)}
              >
                <G translate="-6, -6">
                  {[...FAR_WING_FEATHER_INDEXES].reverse().map((i) => {
                    const f = WING_FEATHERS[i];
                    return (
                      <AnimatedG
                        key={`fw${i}`}
                        rotation={spreadAngle(f.folded, f.open)}
                        origin={originOf(WING_PIVOT)}
                      >
                        <Path
                          d={f.d}
                          fill={`url(#${id('wing')})`}
                          stroke="#0c1f66"
                          strokeWidth={1.2}
                          strokeOpacity={0.55}
                        />
                      </AnimatedG>
                    );
                  })}
                </G>
              </AnimatedG>
            )}

            {/* tail fan */}
            <AnimatedG rotation={ch.tailRot} origin={originOf(TAIL_PIVOT)}>
              {TAIL_FEATHERS.map((_, i) => i)
                .reverse()
                .map((i) => {
                  const f = TAIL_FEATHERS[i];
                  return (
                    <AnimatedG
                      key={`t${i}`}
                      rotation={tailAngle(f.folded, f.open)}
                      origin={originOf(TAIL_PIVOT)}
                    >
                      <Path
                        d={f.d}
                        fill={`url(#${id('tail')})`}
                        stroke="#0a1450"
                        strokeWidth={1}
                        strokeOpacity={0.5}
                      />
                      <Path d={f.shaft} stroke="#9de6d6" strokeWidth={1} opacity={0.3} />
                    </AnimatedG>
                  );
                })}
            </AnimatedG>

            {/* legs */}
            <AnimatedG opacity={ch.legs}>
              {[legPath(230, -4), legPath(250, 6)].map((l, i) => (
                <G key={`leg${i}`}>
                  <Path d={l.leg} stroke="#2a2d44" strokeWidth={5} strokeLinecap="round" />
                  <Path
                    d={l.foot}
                    stroke="#2a2d44"
                    strokeWidth={4}
                    strokeLinecap="round"
                    fill="none"
                  />
                </G>
              ))}
            </AnimatedG>

            {/* body + belly (chest puff) */}
            <AnimatedG scale={ch.puff} origin="236, 214">
              <Path d={BODY_D} fill={`url(#${id('blk')})`} />
              <Path d={BELLY_D} fill={`url(#${id('belly')})`} />
              <Path
                d={BELLY_LINE_D}
                stroke="#aab4cc"
                strokeWidth={2}
                fill="none"
                opacity={0.55}
                strokeLinecap="round"
              />
            </AnimatedG>

            {/* tucked quill — behind the head, ahead of the body; sways with the mood */}
            <AnimatedG rotation={ch.quill} origin={originOf(QUILL)}>
              <G rotation={QUILL.angle} origin={originOf(QUILL)}>
                <Path
                  d={QUILL_D}
                  fill={`url(#${id('quill')})`}
                  stroke="#b9b3a0"
                  strokeWidth={1.4}
                />
                <Path d={QUILL_SHAFT_D} stroke="#a79f8a" strokeWidth={1.6} />
                <Path d={QUILL_BARBS_D} stroke="#cfc9b6" strokeWidth={1.2} strokeLinecap="round" />
              </G>
            </AnimatedG>

            {/* near wing */}
            <AnimatedG rotation={negate(ch.wingLift)} origin={originOf(WING_PIVOT)}>
              {WING_FEATHERS.map((_, i) => i)
                .reverse()
                .map((i) => {
                  const f = WING_FEATHERS[i];
                  return (
                    <AnimatedG
                      key={`w${i}`}
                      rotation={spreadAngle(f.folded, f.open)}
                      origin={originOf(WING_PIVOT)}
                    >
                      <Path
                        d={f.d}
                        fill={`url(#${id('wing')})`}
                        stroke="#0c1f66"
                        strokeWidth={1.2}
                        strokeOpacity={0.55}
                      />
                      <Path d={f.shaft} stroke="#bfe9ff" strokeWidth={1} opacity={0.28} />
                    </AnimatedG>
                  );
                })}
              <AnimatedPath
                d={COVERTS_D}
                fill={`url(#${id('cov')})`}
                opacity={ch.wingSpread.interpolate({ inputRange: [0, 1], outputRange: [1, 0.65] })}
              />
              <Path
                d={COVERTS_LINES_D}
                stroke="#7fb4ff"
                strokeWidth={1.2}
                fill="none"
                opacity={0.35}
              />
            </AnimatedG>
            <AnimatedPath
              d={SHOULDER_STREAK_D}
              fill="#f4f6fb"
              opacity={ch.wingSpread.interpolate({
                inputRange: [0, 0.8],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              })}
            />

            {/* head: tilts, nods, droops as one unit */}
            <AnimatedG translateY={ch.headY} rotation={ch.headRot} origin={originOf(HEAD_PIVOT)}>
              <G scale={1.1} origin="262, 150">
                <Path d={HEAD_D} fill={`url(#${id('head')})`} />
                <Path d={HEAD_SHEEN_D} fill="#5a6cc0" opacity={0.28} />

                {/* gold bill: upper and lower mandible part with `beak` */}
                <AnimatedG
                  rotation={Animated.multiply(ch.beak, -5.4)}
                  origin={originOf(BEAK_PIVOT)}
                >
                  <Path
                    d={BILL_UPPER_D}
                    fill={`url(#${id('gold')})`}
                    stroke="#8a6a1f"
                    strokeWidth={1}
                  />
                  <Path
                    d={BILL_UPPER_SHEEN_D}
                    stroke="#fff3bd"
                    strokeWidth={1.5}
                    opacity={0.7}
                    fill="none"
                  />
                </AnimatedG>
                <AnimatedG rotation={Animated.multiply(ch.beak, 12)} origin={originOf(BEAK_PIVOT)}>
                  <Path d={BILL_LOWER_D} fill="#b8892f" stroke="#8a6a1f" strokeWidth={1} />
                </AnimatedG>

                {/* cream eye, dark pupil, highlight; gaze shifts the pupil */}
                <Circle cx={EYE.x} cy={EYE.y} r={EYE.r} fill="#F4F1E8" />
                <AnimatedG translateX={ch.gazeX} translateY={ch.gazeY}>
                  <AnimatedCircle
                    cx={EYE.x + 2.5}
                    cy={EYE.y}
                    r={Animated.multiply(ch.pupil, EYE.pupil)}
                    fill="#0c0c10"
                  />
                  <Circle cx={EYE.x + 5.8} cy={EYE.y - 3.8} r={2.8} fill="#fff" />
                </AnimatedG>

                {/* held lids (clipped to the head so they never show outside it) */}
                <G clipPath={`url(#${id('headClip')})`}>
                  <AnimatedG rotation={ch.lidSlant} origin={eyeOrigin}>
                    <AnimatedG translateY={Animated.multiply(ch.lid, 32)}>
                      <Path
                        d={`M${EYE.x - 20},${EYE.y - 54} L${EYE.x + 20},${EYE.y - 54} L${EYE.x + 20},${EYE.y - 17} Q${EYE.x},${EYE.y - 12} ${EYE.x - 20},${EYE.y - 17} Z`}
                        fill="#16132f"
                      />
                    </AnimatedG>
                  </AnimatedG>
                  <AnimatedG translateY={Animated.multiply(ch.lower, -30)}>
                    <Path
                      d={`M${EYE.x - 20},${EYE.y + 54} L${EYE.x + 20},${EYE.y + 54} L${EYE.x + 20},${EYE.y + 17} Q${EYE.x},${EYE.y + 12} ${EYE.x - 20},${EYE.y + 17} Z`}
                      fill="#16132f"
                    />
                  </AnimatedG>
                </G>

                {/* brow */}
                <AnimatedG rotation={Animated.multiply(ch.lidSlant, 0.8)} origin={eyeOrigin}>
                  <AnimatedG translateY={Animated.multiply(ch.brow, -4)}>
                    <AnimatedPath
                      d={`M${EYE.x - 15},${EYE.y - 23} Q${EYE.x},${EYE.y - 29} ${EYE.x + 15},${EYE.y - 22}`}
                      stroke="#8a7fe6"
                      strokeWidth={3.4}
                      strokeLinecap="round"
                      fill="none"
                      opacity={ch.brow.interpolate({
                        inputRange: [-1.2, -0.05, 0.05, 1.5],
                        outputRange: [1, 0.3, 0.3, 1],
                      })}
                    />
                  </AnimatedG>
                </AnimatedG>

                {/* gold monocle + chain */}
                <Circle
                  cx={EYE.x}
                  cy={EYE.y}
                  r={MONOCLE.r}
                  fill="#C4B5FD"
                  fillOpacity={0.12}
                  stroke={gold}
                  strokeWidth={3}
                />
                <Path
                  d={MONOCLE_CHAIN_D}
                  stroke={gold}
                  strokeWidth={1.8}
                  strokeDasharray="2.5 2.5"
                  strokeLinecap="round"
                  fill="none"
                />
                <Path
                  d={MONOCLE_GLINT_D}
                  stroke="#fff8e0"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  opacity={0.9}
                />
              </G>
            </AnimatedG>
          </AnimatedG>
        </AnimatedG>

        {/* the arcane rune, floating ahead of the beak */}
        <AnimatedG
          translateY={idle.rune.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] })}
        >
          <AnimatedCircle
            cx={RUNE.x}
            cy={RUNE.y}
            r={ch.rune.interpolate({
              inputRange: [0, 1.6],
              outputRange: [RUNE.halo * 0.55, RUNE.halo * 1.5],
              extrapolate: 'clamp',
            })}
            fill={`url(#${id('rune')})`}
            opacity={ch.rune.interpolate({
              inputRange: [0, 1.6],
              outputRange: [0.15, 1],
              extrapolate: 'clamp',
            })}
          />
          <AnimatedG
            opacity={ch.rune.interpolate({
              inputRange: [0, 0.4],
              outputRange: [0.4, 1],
              extrapolate: 'clamp',
            })}
          >
            <AnimatedG
              rotation={idle.orbit.interpolate({ inputRange: [0, 1], outputRange: [0, 360] })}
              origin={originOf(RUNE)}
            >
              <Circle
                cx={RUNE.x}
                cy={RUNE.y}
                r={RUNE.orbit}
                stroke="#C4B5FD"
                strokeWidth={1}
                strokeDasharray="3 4"
                opacity={0.6}
                fill="none"
              />
              {RUNE_ORBIT_DOTS.map((d, i) => (
                <Circle key={`od${i}`} cx={d.x} cy={d.y} r={1.8} fill="#efe6ff" opacity={0.85} />
              ))}
            </AnimatedG>
            <Circle
              cx={RUNE.x}
              cy={RUNE.y}
              r={RUNE.core}
              fill="#efe6ff"
              stroke="#6c4fd1"
              strokeWidth={2.2}
            />
            <Path d={RUNE_MARK_D} stroke="#6c4fd1" strokeWidth={1.9} strokeLinecap="round" />
          </AnimatedG>
        </AnimatedG>

        {/* celebration sparkles */}
        {SPARKLE_SPOTS.slice(0, resolved.sparkles).map((sp, i) => (
          <AnimatedG
            key={`sp${i}`}
            opacity={
              motion
                ? idle.sparks[i].interpolate({
                    inputRange: [0, 0.3, 0.6, 1],
                    outputRange: [0, 1, 0.5, 0],
                  })
                : 0.85
            }
            scale={
              motion
                ? idle.sparks[i].interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0.3, 1, 0.5],
                  })
                : 1
            }
            origin={`${sp.x}, ${sp.y}`}
          >
            <Path d={starPath(sp.x, sp.y, 11 * sp.s)} fill="#fff4c2" />
            <Path d={starPath(sp.x, sp.y, 5 * sp.s)} fill="#ffffff" />
          </AnimatedG>
        ))}
      </Svg>
    </View>
  );
}
