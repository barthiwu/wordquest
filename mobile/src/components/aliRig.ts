import type { AliExpression, AliIntensity, AliPose } from '@/services/aliExpression';

/**
 * ALI's rig as pure data (ALI Character & Animation Bible v1 §4 expressions,
 * §5 poses, §6 intensity). Every expression and pose is a combination of the
 * same ~22 numeric channels on ONE drawing (§15: "do not create unrelated
 * versions of ALI for each emotion"). Two kinds of data:
 *
 *  - static channels — where ALI HOLDS (the face and stance);
 *  - motion layers — keyframed gestures played on top (a curious head-sway, a
 *    surprised recoil, a flapping wing), each an offset that starts and ends
 *    at rest so a finished gesture settles back into the held pose.
 *
 * AliCharacter.tsx turns this into Animated values; nothing here touches
 * React, so it is unit-tested directly.
 */

export type ChannelName =
  | 'hop' // px lifted off the ground
  | 'bodyRot' // deg, + leans forward/down
  | 'headRot' // deg, + beak down, - beak up
  | 'headY' // px, + lowers the head
  | 'wingSpread' // 0 folded .. 1 fully fanned
  | 'wingLift' // deg the whole wing swings up
  | 'tailRot' // deg
  | 'tailSpread' // 0 closed .. 1 fanned
  | 'lid' // 0 open .. 1 shut (upper lid)
  | 'lower' // 0..1 lower lid raised (smile / squint)
  | 'lidSlant' // deg, + angry/focused, - worried
  | 'brow' // -1 .. 1.4
  | 'beak' // 0 closed .. 1 open
  | 'legs' // 0 tucked .. 1 down
  | 'pupil' // multiplier
  | 'gazeX' // px
  | 'gazeY' // px
  | 'puff' // chest multiplier
  | 'rune' // glow strength
  | 'quill' // deg sway of the tucked quill
  | 'travelX' // px, flight travel
  | 'travelY';

export type Channels = Record<ChannelName, number>;

export const CHANNEL_NAMES: ChannelName[] = [
  'hop',
  'bodyRot',
  'headRot',
  'headY',
  'wingSpread',
  'wingLift',
  'tailRot',
  'tailSpread',
  'lid',
  'lower',
  'lidSlant',
  'brow',
  'beak',
  'legs',
  'pupil',
  'gazeX',
  'gazeY',
  'puff',
  'rune',
  'quill',
  'travelX',
  'travelY',
];

export const DEFAULT_CHANNELS: Channels = {
  hop: 0,
  bodyRot: 0,
  headRot: 0,
  headY: 0,
  wingSpread: 0,
  wingLift: 0,
  tailRot: 0,
  tailSpread: 0,
  lid: 0,
  lower: 0,
  lidSlant: 0,
  brow: 0,
  beak: 0,
  legs: 1,
  pupil: 1,
  gazeX: 0,
  gazeY: 0,
  puff: 1,
  rune: 0.55,
  quill: 0,
  travelX: 0,
  travelY: 0,
};

/** Clamp range for channels whose drawing breaks outside it. */
export const CHANNEL_LIMITS: Partial<Record<ChannelName, [number, number]>> = {
  lid: [0, 1],
  lower: [0, 1],
  beak: [0, 1.2],
  legs: [0, 1],
  wingSpread: [0, 1],
  tailSpread: [0, 1],
  rune: [0, 1.6],
  pupil: [0.4, 1.5],
  puff: [0.9, 1.12],
  brow: [-1.2, 1.5],
};

export interface MotionLayer {
  /** Duration of one cycle. */
  ms: number;
  /** A number of cycles, or 'loop' to repeat until the pose changes. */
  iterations: number | 'loop';
  /** Evenly spaced keyframes per channel (all arrays in a layer share one length). */
  keys: Partial<Record<ChannelName, number[]>>;
}

// -- keyframe helpers (9 samples per cycle) ----------------------------------
const SINE = [0, 0.71, 1, 0.71, 0, -0.71, -1, -0.71, 0];
const HUMP = [0, 0.38, 0.71, 0.92, 1, 0.92, 0.71, 0.38, 0];
const scale = (a: number[], k: number) => a.map((v) => Math.round(v * k * 1000) / 1000);
/** Swings + then - once (a side-to-side sway, a flap). */
export const wave = (k: number) => scale(SINE, k);
/** Rises and returns once (a hop, a nod, a pulse). */
export const hump = (k: number) => scale(HUMP, k);

type Patch = Partial<Channels>;

interface ExpressionSpec {
  ch: Patch;
  gesture?: MotionLayer[];
  /** Happy-family expressions earn sparkles at high intensity. */
  positive?: boolean;
}

/** Bible §4. Static face/stance + the gesture that makes the feeling readable in motion. */
export const EXPRESSIONS: Record<AliExpression, ExpressionSpec> = {
  NEUTRAL: { ch: { rune: 0.55 } },
  CURIOUS: {
    ch: { headRot: -10, headY: -2, brow: 1, pupil: 1.2, bodyRot: -1, rune: 0.75, quill: -5 },
    // head sways side to side, eye follows, quill leans in
    gesture: [
      {
        ms: 1900,
        iterations: 2,
        keys: { headRot: wave(-8), gazeX: wave(2.5), quill: wave(-5), rune: hump(0.3) },
      },
    ],
  },
  PLEASED: {
    ch: { lower: 0.45, lid: 0.1, headRot: 2, brow: 0.25, beak: 0.12, rune: 0.85 },
    // slow nod, chest lifts, rune warms
    gesture: [
      {
        ms: 1500,
        iterations: 2,
        keys: { headRot: hump(8), headY: hump(2), puff: hump(0.03), rune: hump(0.25) },
      },
    ],
    positive: true,
  },
  EXCITED: {
    ch: {
      pupil: 1.3,
      beak: 0.8,
      hop: 8,
      wingLift: 18,
      wingSpread: 0.2,
      brow: 1,
      legs: 0.8,
      rune: 1.2,
      quill: 8,
    },
    // quick bouncing hops, wings flutter, rune sparkles
    gesture: [
      {
        ms: 420,
        iterations: 4,
        keys: {
          hop: hump(14),
          wingLift: hump(16),
          tailRot: hump(-8),
          legs: hump(-0.5),
          rune: hump(0.25),
          quill: wave(6),
        },
      },
    ],
    positive: true,
  },
  PROUD: {
    ch: {
      headY: -5,
      headRot: 8,
      lid: 0.25,
      lower: 0.15,
      wingLift: 6,
      bodyRot: 3,
      puff: 1.05,
      rune: 1,
    },
    // chest swells, wing lifts
    gesture: [
      {
        ms: 1400,
        iterations: 1,
        keys: { puff: hump(0.04), wingLift: hump(8), headY: hump(-2), rune: hump(0.3) },
      },
    ],
    positive: true,
  },
  SURPRISED: {
    ch: {
      pupil: 0.5,
      brow: 1.3,
      beak: 0.4,
      headRot: -5,
      bodyRot: -4,
      hop: 6,
      rune: 1.4,
      quill: 12,
    },
    // a recoil: jump back, wings flick out, rune flares, then settle
    gesture: [
      {
        ms: 560,
        iterations: 1,
        keys: {
          hop: [0, 18, 20, 12, 6, 2, 0, 0, 0],
          bodyRot: [0, -10, -9, -5, -2, -1, 0, 0, 0],
          headRot: [0, -8, -7, -4, -2, 0, 0, 0, 0],
          wingLift: [0, 22, 24, 14, 6, 2, 0, 0, 0],
          rune: [0, 0.4, 0.45, 0.25, 0.15, 0.07, 0, 0, 0],
          quill: [0, 14, 16, 9, 4, 1, 0, 0, 0],
        },
      },
    ],
  },
  CONCERNED: {
    ch: {
      brow: -0.9,
      lidSlant: -16,
      lid: 0.22,
      headRot: -5,
      headY: 3,
      tailRot: 3,
      rune: 0.2,
      quill: -6,
    },
    // head tilts one way then the other, tail twitches, rune flickers
    gesture: [
      {
        ms: 1600,
        iterations: 2,
        keys: {
          headRot: wave(-5),
          tailRot: wave(4),
          rune: [0, -0.1, 0.1, -0.12, 0.05, -0.1, 0.1, -0.05, 0],
        },
      },
    ],
  },
  DISAPPOINTED: {
    ch: {
      lid: 0.55,
      headRot: 13,
      headY: 10,
      bodyRot: 6,
      tailRot: -6,
      wingLift: -8,
      pupil: 0.9,
      rune: 0.05,
      quill: -10,
    },
    // a slow sink and one long sigh
    gesture: [
      {
        ms: 2400,
        iterations: 1,
        keys: {
          headY: [0, 4, 7, 7, 6, 4, 2, 1, 0],
          puff: [0, 0.05, 0.06, 0.03, -0.03, -0.04, -0.02, 0, 0],
          wingLift: [0, -3, -6, -6, -5, -3, -1, 0, 0],
        },
      },
    ],
  },
  MISCHIEVOUS: {
    ch: { lidSlant: 12, lid: 0.34, lower: 0.2, headRot: -13, beak: 0.18, brow: 0.35, rune: 0.9 },
    // a sideways glance, a slow wink-blink, a quick wing flick
    gesture: [
      {
        ms: 1300,
        iterations: 2,
        keys: { headRot: wave(-6), gazeX: hump(3), lid: hump(0.4), rune: wave(0.25) },
      },
      { ms: 360, iterations: 1, keys: { wingLift: hump(16), tailRot: hump(-6), quill: hump(6) } },
    ],
  },
  ENCOURAGING: {
    ch: { lower: 0.3, headRot: -4, brow: 0.55, wingLift: 10, beak: 0.22, rune: 0.9 },
    // nods toward you, one wing lifts like a wave
    gesture: [
      {
        ms: 1100,
        iterations: 2,
        keys: {
          headRot: hump(8),
          wingLift: hump(26),
          wingSpread: hump(0.3),
          tailRot: hump(-4),
          rune: hump(0.4),
        },
      },
    ],
    positive: true,
  },
  FOCUSED: {
    ch: { lidSlant: 14, lid: 0.32, pupil: 0.8, brow: -0.3, headRot: 3, bodyRot: -3, rune: 0.6 },
    // goes still and leans in
    gesture: [
      {
        ms: 2200,
        iterations: 1,
        keys: { bodyRot: hump(-3), headRot: hump(2), pupil: hump(-0.08) },
      },
    ],
  },
  TRIUMPHANT: {
    ch: {
      beak: 1,
      wingSpread: 0.9,
      wingLift: 30,
      tailSpread: 0.8,
      hop: 16,
      headY: -6,
      headRot: 6,
      lid: 0.15,
      lower: 0.2,
      legs: 0.4,
      rune: 1.5,
      quill: 14,
    },
    // wings flare, bouncing hops, rune bursts
    gesture: [
      { ms: 520, iterations: 3, keys: { hop: hump(18), wingLift: hump(14), tailRot: hump(-6) } },
      { ms: 1400, iterations: 2, keys: { rune: hump(0.1), quill: wave(8), puff: hump(0.03) } },
    ],
    positive: true,
  },
};

interface PoseSpec {
  ch: Patch;
  layers?: MotionLayer[];
  /** Show the far-side wing (any pose that opens the wings). */
  farWing?: boolean;
  /** Celebratory poses earn sparkles at high intensity even with a neutral face. */
  celebratory?: boolean;
}

const FLAP = (k: number) => wave(k);
const ARC = [0, -2.6, -9, -15.4, -18, -15.4, -9, -2.6, 0];

/** Bible §5. */
export const POSES: Record<AliPose, PoseSpec> = {
  PERCHED: { ch: {} },
  STANDING: { ch: { headY: -4, bodyRot: -3, tailRot: -2 } },
  HEAD_TILT: { ch: { headRot: -16, headY: -1 } },
  LOOK_AT_RESULT: { ch: { headRot: 10, headY: 7, bodyRot: 2, gazeY: 2 } },
  HOP: {
    ch: {},
    layers: [
      {
        ms: 520,
        iterations: 2,
        keys: { hop: hump(16), legs: hump(-0.7), tailRot: hump(-7), wingLift: hump(10) },
      },
    ],
  },
  WING_TWITCH: {
    ch: {},
    farWing: true,
    layers: [{ ms: 240, iterations: 3, keys: { wingLift: hump(22), wingSpread: hump(0.3) } }],
  },
  WING_SPREAD_PARTIAL: {
    ch: { wingSpread: 0.55, wingLift: 10, tailSpread: 0.45, bodyRot: -4 },
    farWing: true,
  },
  WING_SPREAD_FULL: {
    ch: { wingSpread: 1, wingLift: 24, tailSpread: 0.9, bodyRot: -8, hop: 12, legs: 0.4 },
    farWing: true,
    celebratory: true,
    layers: [{ ms: 900, iterations: 3, keys: { wingLift: wave(5), tailSpread: hump(0.05) } }],
  },
  TAKEOFF: {
    ch: { hop: 34, bodyRot: -14, wingSpread: 1, wingLift: 18, tailSpread: 0.75, legs: 0 },
    farWing: true,
    layers: [{ ms: 340, iterations: 5, keys: { wingLift: FLAP(28), hop: hump(4) } }],
  },
  FLIGHT: {
    ch: { hop: 28, bodyRot: -6, wingSpread: 1, wingLift: 14, tailSpread: 0.6, legs: 0 },
    farWing: true,
    layers: [
      { ms: 380, iterations: 'loop', keys: { wingLift: FLAP(26) } },
      { ms: 2600, iterations: 'loop', keys: { travelX: wave(14), hop: wave(4) } },
    ],
  },
  CIRCULAR_FLIGHT: {
    ch: { hop: 28, bodyRot: -6, wingSpread: 1, wingLift: 14, tailSpread: 0.6, legs: 0 },
    farWing: true,
    celebratory: true,
    layers: [
      { ms: 380, iterations: 'loop', keys: { wingLift: FLAP(26) } },
      {
        ms: 3000,
        iterations: 'loop',
        keys: { travelX: wave(34), travelY: ARC, bodyRot: [0, -4, -7, -4, 0, 4, 7, 4, 0] },
      },
    ],
  },
  LANDING: {
    ch: {},
    farWing: true,
    layers: [
      {
        ms: 760,
        iterations: 1,
        keys: {
          hop: [30, 22, 14, 8, 3, 1, 0, 0, 0],
          wingSpread: [0.9, 0.8, 0.6, 0.4, 0.2, 0.1, 0, 0, 0],
          wingLift: [20, 14, 8, 0, -6, -3, 0, 0, 0],
          legs: [-1, -1, -1, -0.6, -0.2, 0, 0, 0, 0],
          bodyRot: [-8, -6, -3, 0, 3, 1, 0, 0, 0],
          tailSpread: [0.6, 0.5, 0.35, 0.2, 0.1, 0.05, 0, 0, 0],
        },
      },
    ],
  },
  CELEBRATORY_HOP: {
    ch: { wingSpread: 0.5, wingLift: 12, tailSpread: 0.4 },
    farWing: true,
    celebratory: true,
    layers: [
      {
        ms: 460,
        iterations: 3,
        keys: { hop: hump(22), wingLift: hump(16), tailRot: hump(-8), legs: hump(-0.7) },
      },
    ],
  },
  APPROVING_NOD: {
    ch: {},
    layers: [{ ms: 420, iterations: 3, keys: { headRot: hump(14), headY: hump(3) } }],
  },
  CONCERN_DROP: {
    ch: { headRot: 10, headY: 12, bodyRot: 5, wingLift: -10, tailRot: -5 },
    layers: [{ ms: 700, iterations: 1, keys: { headY: [0, 4, 8, 6, 3, 1, 0, 0, 0] } }],
  },
  FOCUSED_STANCE: { ch: { bodyRot: -3, headRot: 3, headY: -1, lid: 0.16, pupil: 0.9 } },
};

const ADDITIVE_MAX: ChannelName[] = ['wingSpread', 'tailSpread', 'lid', 'lower', 'beak'];

/** Pose and expression both contribute; the merge rule is per channel. */
function mergeInto(base: Channels, patch: Patch): Channels {
  const out = { ...base };
  (Object.keys(patch) as ChannelName[]).forEach((k) => {
    const v = patch[k] as number;
    if (ADDITIVE_MAX.includes(k)) out[k] = Math.max(out[k], v);
    else if (k === 'legs') out[k] = Math.min(out[k], v);
    else if (k === 'pupil' || k === 'puff') out[k] = out[k] * v;
    else out[k] = out[k] + v;
  });
  return out;
}

export function clampChannel(name: ChannelName, value: number): number {
  const lim = CHANNEL_LIMITS[name];
  return lim ? Math.min(lim[1], Math.max(lim[0], value)) : value;
}

/** Gesture amplitude by Bible §6 tier — tier 0 is a subtle idle, tier 5 is cinematic. */
export const INTENSITY_AMPLITUDE: Record<AliIntensity, number> = {
  0: 0.6,
  1: 0.75,
  2: 0.9,
  3: 1,
  4: 1.15,
  5: 1.3,
};

export interface ResolvedRig {
  channels: Channels;
  layers: MotionLayer[];
  sparkles: number;
  glow: number;
  farWing: boolean;
}

export const MAX_LAYERS = 4;

function scaleLayer(layer: MotionLayer, amp: number): MotionLayer {
  const keys: MotionLayer['keys'] = {};
  (Object.keys(layer.keys) as ChannelName[]).forEach((k) => {
    keys[k] = (layer.keys[k] as number[]).map((v) => Math.round(v * amp * 1000) / 1000);
  });
  return { ...layer, keys };
}

export function resolveAliRig(
  expression: AliExpression,
  pose: AliPose,
  intensity: AliIntensity,
): ResolvedRig {
  const expr = EXPRESSIONS[expression];
  const p = POSES[pose];
  let channels = mergeInto(DEFAULT_CHANNELS, p.ch);
  channels = mergeInto(channels, expr.ch);
  // Intensity also lifts the rune: a major moment should feel lit.
  channels.rune += intensity >= 4 ? 0.2 : 0;
  (Object.keys(channels) as ChannelName[]).forEach((k) => {
    channels[k] = clampChannel(k, channels[k]);
  });
  const amp = INTENSITY_AMPLITUDE[intensity];
  const layers = [...(p.layers ?? []), ...(expr.gesture ?? [])]
    .slice(0, MAX_LAYERS)
    .map((l) => scaleLayer(l, amp));
  const festive = (expr.positive === true || p.celebratory === true) && intensity >= 3;
  return {
    channels,
    layers,
    sparkles: festive ? Math.min(6, intensity + 1) : 0,
    glow: festive && intensity >= 4 ? 0.45 + (intensity - 4) * 0.2 : 0,
    farWing: p.farWing === true || channels.wingSpread > 0.2,
  };
}
