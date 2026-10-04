import type {
  AliExpression,
  AliIntensity,
  AliPose,
  AliPriority,
  AliSequenceId,
} from '@/services/aliExpression';

export type { AliSequenceId };

/**
 * The six major reaction sequences from the ALI Character & Animation Bible
 * v1 §7. A sequence is an ordered run of (expression, pose, intensity) beats
 * played on the one rig — never separate artwork.
 *
 * NOTE: the Bible says to use the exact sequences from the master
 * specification, which is not in the repo. These are composed from the
 * Bible's own §4/§5 vocabulary and are DRAFTS for Barth to correct: the beats
 * live in this one table so a change is a data edit.
 *
 * Total length of each sequence fits inside the `durationMs` the backend
 * already sends for the matching event (ali-expression.ts), so a sequence
 * never outlives its popup. ALI never reveals answers or blocks input: these
 * play in the reaction popup / recap, never over a live question.
 */

export interface AliSequenceStep {
  expression: AliExpression;
  pose: AliPose;
  intensity: AliIntensity;
  /** How long this beat is held before the next. */
  holdMs: number;
}

export interface AliSequence {
  id: AliSequenceId;
  priority: AliPriority;
  steps: AliSequenceStep[];
  /** The beat to show when the OS asks for reduced motion (§ "reduced-motion fallbacks"): one still frame. */
  stillStep: number;
}

const s = (
  expression: AliExpression,
  pose: AliPose,
  intensity: AliIntensity,
  holdMs: number,
): AliSequenceStep => ({
  expression,
  pose,
  intensity,
  holdMs,
});

export const ALI_SEQUENCES: Record<AliSequenceId, AliSequence> = {
  // Priority 4 — a flawless first try: a gasp of delight, a joyful hop, then a proud wing-spread.
  FIRST_ATTEMPT_MASTERY: {
    id: 'FIRST_ATTEMPT_MASTERY',
    priority: 4,
    steps: [
      s('SURPRISED', 'HEAD_TILT', 3, 700),
      s('EXCITED', 'CELEBRATORY_HOP', 4, 1400),
      s('PROUD', 'WING_SPREAD_PARTIAL', 4, 1300),
      s('PLEASED', 'PERCHED', 2, 800),
    ],
    stillStep: 2,
  },
  // Priority 3 — hard-won: ALI was in it with you; a warm nod, then quiet pride.
  MASTERY_AFTER_STRUGGLE: {
    id: 'MASTERY_AFTER_STRUGGLE',
    priority: 3,
    steps: [
      s('FOCUSED', 'FOCUSED_STANCE', 2, 700),
      s('PLEASED', 'APPROVING_NOD', 3, 1300),
      s('PROUD', 'WING_SPREAD_PARTIAL', 3, 1300),
    ],
    stillStep: 2,
  },
  // Priority 4 — takes flight, circles, lands, and opens his wings.
  LEVEL_UP: {
    id: 'LEVEL_UP',
    priority: 4,
    steps: [
      s('EXCITED', 'TAKEOFF', 4, 900),
      s('TRIUMPHANT', 'CIRCULAR_FLIGHT', 4, 1700),
      s('PROUD', 'LANDING', 4, 800),
      s('PROUD', 'WING_SPREAD_FULL', 4, 1000),
    ],
    stillStep: 3,
  },
  // Priority 5 — the cinematic one: looks ahead, startles, takes off, circles, lands, full spread.
  JOURNEY_TRANSITION: {
    id: 'JOURNEY_TRANSITION',
    priority: 5,
    steps: [
      s('CURIOUS', 'LOOK_AT_RESULT', 3, 700),
      s('SURPRISED', 'WING_SPREAD_PARTIAL', 4, 700),
      s('EXCITED', 'TAKEOFF', 5, 900),
      s('TRIUMPHANT', 'CIRCULAR_FLIGHT', 5, 1700),
      s('PROUD', 'LANDING', 5, 800),
      s('TRIUMPHANT', 'WING_SPREAD_FULL', 5, 1100),
    ],
    stillStep: 5,
  },
  // Priority 4 — locks in, bursts into a hop, takes off, spreads his wings, settles proud.
  BOSS_VICTORY: {
    id: 'BOSS_VICTORY',
    priority: 4,
    steps: [
      s('FOCUSED', 'FOCUSED_STANCE', 3, 500),
      s('EXCITED', 'HOP', 4, 800),
      s('TRIUMPHANT', 'TAKEOFF', 5, 1000),
      s('TRIUMPHANT', 'WING_SPREAD_FULL', 5, 1400),
      s('PROUD', 'PERCHED', 3, 700),
    ],
    stillStep: 3,
  },
  // Priority 3 — sympathetic, never shaming: a gentle drop, an encouraging tilt, then "next round".
  BOSS_DEFEAT: {
    id: 'BOSS_DEFEAT',
    priority: 3,
    steps: [
      s('CONCERNED', 'CONCERN_DROP', 2, 900),
      s('ENCOURAGING', 'HEAD_TILT', 2, 1200),
      s('FOCUSED', 'FOCUSED_STANCE', 2, 900),
    ],
    stillStep: 1,
  },
};

export const ALI_SEQUENCE_IDS = Object.keys(ALI_SEQUENCES) as AliSequenceId[];

export function isAliSequenceId(value: unknown): value is AliSequenceId {
  return typeof value === 'string' && (ALI_SEQUENCE_IDS as string[]).includes(value);
}

export function sequenceDurationMs(id: AliSequenceId): number {
  return ALI_SEQUENCES[id].steps.reduce((sum, st) => sum + st.holdMs, 0);
}

/**
 * Which beat is playing `elapsedMs` into the sequence (clamped to the last
 * beat once it ends, so the final stance holds). Pure so the player can be
 * tested without timers.
 */
export function stepIndexAt(id: AliSequenceId, elapsedMs: number): number {
  const steps = ALI_SEQUENCES[id].steps;
  let t = Math.max(0, elapsedMs);
  for (let i = 0; i < steps.length; i += 1) {
    if (t < steps[i].holdMs) return i;
    t -= steps[i].holdMs;
  }
  return steps.length - 1;
}
