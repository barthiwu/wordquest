import { useCallback, useEffect, useRef, useState } from 'react';
import type { AliExpressionCue } from '@/services/aliExpression';
import {
  clearActiveAliReaction,
  EMPTY_ALI_REACTION_QUEUE_STATE,
  enqueueAliReaction,
  promotePendingAliReaction,
  type AliReactionQueueState,
} from '@/utils/aliReactionQueue';

export interface UseAliReactionQueueOptions {
  /** Gap between one reaction being dismissed and the next queued one
   * becoming active, so a rapid string of triggers doesn't read as one
   * uninterrupted flicker of ALI popups. Default 600ms. */
  cooldownMs?: number;
}

export interface UseAliReactionQueueResult<T extends AliExpressionCue> {
  /** The cue to render right now, or null when the queue is idle --
   * `null` means "don't mount ALI's reaction UI at all." */
  active: T | null;
  /** Submits a new cue for the queue to arbitrate (see
   * enqueueAliReaction for the priority/preemption rules). Safe to call
   * as often as reactions actually happen -- NONE-priority cues and
   * excess same-tier bursts are absorbed automatically. */
  enqueue: (cue: T) => void;
  /** Call once the active cue's own UI has finished or been dismissed
   * (an auto-dismiss timeout, a tap-to-continue, a "Continue" button --
   * whatever that UI already does, same as AliBubble's onDismiss
   * contract) to clear it and, after `cooldownMs`, promote whatever's
   * pending. */
  dismiss: () => void;
}

/**
 * React wiring around the pure aliReactionQueue functions (see
 * utils/aliReactionQueue.ts for the actual decision logic and its full
 * doc comment) -- ALI Character & Animation Bible v1 §10's priority
 * ordering plus a cooldown pause between reactions, so a screen that
 * can trigger several ALI-worthy events close together (a word
 * completion that happens to also cross a streak milestone and unlock
 * an achievement) shows at most one reaction at a time, highest
 * priority first, paced rather than spammed.
 *
 * Usage (a screen wired for task #99's live ALI moments):
 *
 *   const aliQueue = useAliReactionQueue<AliExpressionCue & { text: string }>();
 *   // ...on each event that resolves an ALI reaction:
 *   aliQueue.enqueue(result.aliMessage ?? result.aliQuickExpression);
 *   // ...in render:
 *   {aliQueue.active && (
 *     <AliReactionPopup cue={aliQueue.active} onDismiss={aliQueue.dismiss} />
 *   )}
 *
 * Generic over T (constrained to AliExpressionCue) so callers can pass
 * the richer shapes several endpoints already return (AliMessage,
 * WordCompletionResult['aliMessage'], etc.) straight through without a
 * separate mapping step.
 */
export function useAliReactionQueue<T extends AliExpressionCue>(
  options: UseAliReactionQueueOptions = {},
): UseAliReactionQueueResult<T> {
  const { cooldownMs = 600 } = options;

  const [state, setState] = useState<AliReactionQueueState<T>>(
    EMPTY_ALI_REACTION_QUEUE_STATE as AliReactionQueueState<T>,
  );
  // Mirrored on every render so `dismiss` (memoized without `state` in
  // its deps) can read the latest queue state without going stale.
  const stateRef = useRef(state);
  stateRef.current = state;

  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    },
    [],
  );

  const enqueue = useCallback((cue: T) => {
    setState((prev) => enqueueAliReaction(prev, cue));
  }, []);

  const dismiss = useCallback(() => {
    // Computed from the ref (not inside the setState updater) so the
    // setTimeout side effect below runs exactly once per real dismiss()
    // call, never twice under a double-invoked updater.
    const cleared = clearActiveAliReaction(stateRef.current);
    setState(cleared);

    if (cooldownTimer.current) {
      clearTimeout(cooldownTimer.current);
      cooldownTimer.current = null;
    }
    if (cleared.pending) {
      cooldownTimer.current = setTimeout(() => {
        setState((current) => promotePendingAliReaction(current));
      }, cooldownMs);
    }
  }, [cooldownMs]);

  return { active: state.active, enqueue, dismiss };
}
