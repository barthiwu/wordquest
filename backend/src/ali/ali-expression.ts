import { AliEventType } from './ali.service';

/**
 * ALI's semantic animation cue — the deterministic, zero-cost counterpart
 * to ali-tone.ts's tone string and ali-quick-reactions.ts's phrase pool,
 * covering the visual side of a reaction (ALI Character & Animation
 * Bible v1, §12 "Technical Contract": backend sends semantic
 * event/state/intensity/animation/expression/dialogue/duration/priority/
 * context/version; frontend maps IDs to the chosen animation technology —
 * see mobile/src/components/AliCharacter.tsx, built on the existing
 * parameterized magpie rig in aliMagpieShapes.ts).
 *
 * Deliberately NOT decided by the model that writes ALI's dialogue: the
 * same cost/consistency reasoning as ali-quick-reactions.ts's doc comment
 * applies here even harder — an LLM choosing a visual state per call
 * would add latency, cost, and could drift outside the bible's fixed
 * vocabulary (§15 Designer/Animator Notes: "do not create unrelated
 * versions of ALI for each emotion... every state must trace back to the
 * canonical character reference"). This is a pure function of event type
 * + context, computed instantly, every time, from a fixed closed set of
 * expressions/poses.
 */

/** The bible's §4 expression list, verbatim. */
export type AliExpression =
  | 'NEUTRAL'
  | 'CURIOUS'
  | 'PLEASED'
  | 'EXCITED'
  | 'PROUD'
  | 'SURPRISED'
  | 'CONCERNED'
  | 'DISAPPOINTED'
  | 'MISCHIEVOUS'
  | 'ENCOURAGING'
  | 'FOCUSED'
  | 'TRIUMPHANT';

/** The bible's §5 pose list, verbatim (wing-spread and flight variants split into distinct ids). */
export type AliPose =
  | 'PERCHED'
  | 'STANDING'
  | 'HEAD_TILT'
  | 'LOOK_AT_RESULT'
  | 'HOP'
  | 'WING_TWITCH'
  | 'WING_SPREAD_PARTIAL'
  | 'WING_SPREAD_FULL'
  | 'TAKEOFF'
  | 'FLIGHT'
  | 'CIRCULAR_FLIGHT'
  | 'LANDING'
  | 'CELEBRATORY_HOP'
  | 'APPROVING_NOD'
  | 'CONCERN_DROP'
  | 'FOCUSED_STANCE';

/** Bible §6 reaction tiers: 0 none, 1 subtle, 2 noticeable, 3 strong, 4 major, 5 cinematic. */
export type AliIntensity = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Bible §10 priority table: 5 Journey; 4 level-up/first-attempt mastery;
 * 3 mastery/achievement/streak; 2 notable performance/struggle; 1
 * normal; 0 none. The client's reaction queue (mobile) arbitrates
 * concurrent/rapid triggers by this value, highest wins.
 */
export type AliPriority = 0 | 1 | 2 | 3 | 4 | 5;

export interface AliExpressionCue {
  expression: AliExpression;
  pose: AliPose;
  intensity: AliIntensity;
  priority: AliPriority;
  /** How long the client should hold this cue on screen before it's safe
   * to show the next one. 0 means "no bubble/timed moment" — the cue is
   * for a caller that renders it inline in its own persistent UI (the
   * on-demand tutor replies) rather than a pop-up. */
  durationMs: number;
}

const NONE_CUE: AliExpressionCue = {
  expression: 'NEUTRAL',
  pose: 'PERCHED',
  intensity: 0,
  priority: 0,
  durationMs: 0,
};

/**
 * The per-guess quick reaction's visual pairing — the highest-frequency
 * trigger in the app (every single guess), same cost reasoning as
 * quickAliReaction: fixed, not randomized. The bible's small-mobile-
 * readability note argues for a stable, recognizable pair here; text
 * variety already comes from ali-quick-reactions.ts's phrase pool.
 */
export function quickAliExpression(isCorrect: boolean): AliExpressionCue {
  return isCorrect
    ? { expression: 'PLEASED', pose: 'HEAD_TILT', intensity: 1, priority: 1, durationMs: 2800 }
    : {
        expression: 'ENCOURAGING',
        pose: 'HEAD_TILT',
        intensity: 1,
        priority: 1,
        durationMs: 2800,
      };
}

function numberOr(context: Record<string, unknown>, key: string): number | null {
  const v = context[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function boolOr(context: Record<string, unknown>, key: string): boolean {
  return context[key] === true;
}

/**
 * Resolves the cue for a QUEST_COMPLETION react() call from the richer
 * context quests.service.ts's completeWord passes (correctCount/
 * totalCount added alongside the existing word/xp/glyph/streak fields
 * specifically so this can tell a perfect run from a completed-but-
 * imperfect one). Not in the bible's §7 major-sequence list by name, so
 * this stays in the "normal / notable performance" tiers rather than
 * "major".
 */
function resolveQuestCompletion(context: Record<string, unknown>): AliExpressionCue {
  const correctCount = numberOr(context, 'correctCount');
  const totalCount = numberOr(context, 'totalCount');
  const perfect =
    correctCount !== null && totalCount !== null && totalCount > 0 && correctCount === totalCount;
  return perfect
    ? { expression: 'PLEASED', pose: 'APPROVING_NOD', intensity: 2, priority: 2, durationMs: 3200 }
    : {
        expression: 'ENCOURAGING',
        pose: 'HEAD_TILT',
        intensity: 1,
        priority: 1,
        durationMs: 2800,
      };
}

/**
 * The main resolver, called once per react() invocation (see
 * AliService.react). Every AliEventType is covered explicitly — no
 * silent fallthrough — so adding a new event type without updating this
 * switch is a TypeScript error (default only covers a genuinely unknown
 * string arriving at runtime).
 */
export function aliExpressionForEvent(
  type: AliEventType,
  context: Record<string, unknown>,
): AliExpressionCue {
  switch (type) {
    // -- §7 Major Sequences -------------------------------------------
    case 'JOURNEY_COMPLETION':
      return {
        expression: 'TRIUMPHANT',
        pose: 'CIRCULAR_FLIGHT',
        intensity: 5,
        priority: 5,
        durationMs: 6000,
      };
    case 'LEVEL_UP':
      return {
        expression: 'PROUD',
        pose: 'WING_SPREAD_FULL',
        intensity: 4,
        priority: 4,
        durationMs: 4500,
      };
    case 'MASTERY_EVENT': {
      // "First-attempt mastery" vs "mastery after struggle" (§7) — both
      // major sequences, but only first-attempt sits in §10's priority-4
      // bucket; a hard-won mastery after some wrong guesses is priority 3
      // ("mastery/achievement/streak"), still a strong beat, not the
      // rarer top-tier one. See mastery.service.ts's onWordMastered for
      // how `firstAttempt` is derived (timesIncorrect === 0 at mastery).
      const firstAttempt = boolOr(context, 'firstAttempt');
      return firstAttempt
        ? {
            expression: 'TRIUMPHANT',
            pose: 'CELEBRATORY_HOP',
            intensity: 4,
            priority: 4,
            durationMs: 4500,
          }
        : {
            expression: 'PROUD',
            pose: 'APPROVING_NOD',
            intensity: 3,
            priority: 3,
            durationMs: 3500,
          };
    }
    case 'BOSS_BATTLE_RESULT': {
      const rank = numberOr(context, 'rank');
      const won = rank === 1;
      return won
        ? {
            expression: 'TRIUMPHANT',
            pose: 'WING_SPREAD_FULL',
            intensity: 4,
            priority: 4,
            durationMs: 4500,
          }
        : {
            // A sympathetic head-tilt, not distress — the hard "never
            // shame/discourage" boundary lives in the dialogue system
            // prompt; the visual side stays gentle too, never reads as
            // ALI being upset AT the player.
            expression: 'CONCERNED',
            pose: 'HEAD_TILT',
            intensity: 2,
            priority: 2,
            durationMs: 3200,
          };
    }

    // -- §10 "mastery/achievement/streak" bucket -----------------------
    case 'ACHIEVEMENT_UNLOCK':
      return {
        expression: 'EXCITED',
        pose: 'WING_TWITCH',
        intensity: 3,
        priority: 3,
        durationMs: 3500,
      };
    case 'STREAK_MILESTONE':
      return { expression: 'EXCITED', pose: 'HOP', intensity: 3, priority: 3, durationMs: 3500 };

    // -- Normal-tier reactive events ------------------------------------
    case 'QUEST_COMPLETION':
      return resolveQuestCompletion(context);
    case 'ORDER_SELECTION': {
      const isFirst = boolOr(context, 'isFirstSelection');
      return isFirst
        ? {
            expression: 'EXCITED',
            pose: 'WING_TWITCH',
            intensity: 2,
            priority: 2,
            durationMs: 3000,
          }
        : { expression: 'CURIOUS', pose: 'HEAD_TILT', intensity: 1, priority: 1, durationMs: 2600 };
    }

    // -- On-demand Learning Assistant / AI Tutor (spec §4.2) -----------
    // Player-initiated, shown inline in the tutor's own persistent UI
    // rather than a timed pop-up — durationMs 0 signals "no auto-dismiss
    // moment, this cue is for however the caller already renders ALI
    // alongside this reply."
    case 'MISTAKE_EXPLANATION':
      return {
        expression: 'FOCUSED',
        pose: 'CONCERN_DROP',
        intensity: 1,
        priority: 1,
        durationMs: 0,
      };
    case 'VOCABULARY_ALTERNATIVES':
      // A magpie who collects words being shown one is, in character, a
      // little delighted/mischievous about it.
      return {
        expression: 'MISCHIEVOUS',
        pose: 'LOOK_AT_RESULT',
        intensity: 1,
        priority: 1,
        durationMs: 0,
      };
    case 'WRITING_FEEDBACK':
      return {
        expression: 'FOCUSED',
        pose: 'FOCUSED_STANCE',
        intensity: 1,
        priority: 1,
        durationMs: 0,
      };
    case 'FORGETTING_CURVE_REMINDER':
      return {
        expression: 'CURIOUS',
        pose: 'LOOK_AT_RESULT',
        intensity: 1,
        priority: 1,
        durationMs: 0,
      };

    default:
      return NONE_CUE;
  }
}
