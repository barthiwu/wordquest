import type { AliExpressionCue } from '@/services/aliExpression';

export interface AliReactionQueueState<T extends AliExpressionCue> {
  /** The cue currently being shown, or null when the queue is idle. */
  active: T | null;
  /** At most one cue waiting for `active` to clear -- see
   * enqueueAliReaction's doc comment for why only one is ever kept. */
  pending: T | null;
}

/** A shared empty-state literal so callers/tests don't need to spell out `{ active: null, pending: null }` themselves. */
export const EMPTY_ALI_REACTION_QUEUE_STATE: AliReactionQueueState<never> = {
  active: null,
  pending: null,
};

/**
 * Pure decision core for useAliReactionQueue (see that hook, in
 * hooks/useAliReactionQueue.ts, for the React wiring) -- ALI Character
 * & Animation Bible v1 §10's priority ordering, arbitrated with no
 * framework dependency so it's unit-testable on its own:
 *
 *   1. Priority 0 (NONE) cues never enter the queue -- there's nothing
 *      to show, so `state` is returned unchanged.
 *   2. Nothing currently active -> the new cue becomes active right
 *      away (the common case: one event, no contention).
 *   3. A cue STRICTLY more important than whatever's active preempts it
 *      immediately -- e.g. a Journey completion (priority 5) firing
 *      mid-way through a lower-tier reaction always wins, since §10
 *      ranks it above everything else regardless of timing.
 *   4. Anything else (same or lower priority than active) waits, and
 *      only the single BEST pending cue is kept -- a burst of several
 *      same-or-lower-priority triggers arriving close together
 *      collapses to "show the best one next" rather than queuing every
 *      one of them up. This is the "don't spam or clash" half of the
 *      requirement: without it, a word that happens to trigger a
 *      streak milestone AND an achievement AND a quest-completion
 *      reaction in the same instant would queue three separate popups
 *      back to back.
 */
export function enqueueAliReaction<T extends AliExpressionCue>(
  state: AliReactionQueueState<T>,
  cue: T,
): AliReactionQueueState<T> {
  if (cue.priority <= 0) return state;

  if (!state.active) return { active: cue, pending: null };

  if (cue.priority > state.active.priority) return { active: cue, pending: null };

  if (!state.pending || cue.priority > state.pending.priority) {
    return { active: state.active, pending: cue };
  }

  return state;
}

/**
 * Clears whatever's active, WITHOUT promoting the pending cue -- the
 * hook is responsible for pacing that promotion behind its own cooldown
 * delay (see promotePendingAliReaction) so consecutive reactions never
 * feel like one uninterrupted flicker.
 */
export function clearActiveAliReaction<T extends AliExpressionCue>(
  state: AliReactionQueueState<T>,
): AliReactionQueueState<T> {
  if (!state.active) return state;
  return { active: null, pending: state.pending };
}

/** Promotes the pending cue (if any) into active. A no-op when nothing's pending. */
export function promotePendingAliReaction<T extends AliExpressionCue>(
  state: AliReactionQueueState<T>,
): AliReactionQueueState<T> {
  if (!state.pending) return state;
  return { active: state.pending, pending: null };
}
