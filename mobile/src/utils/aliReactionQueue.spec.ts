import {
  clearActiveAliReaction,
  EMPTY_ALI_REACTION_QUEUE_STATE,
  enqueueAliReaction,
  promotePendingAliReaction,
  type AliReactionQueueState,
} from './aliReactionQueue';
import type { AliExpressionCue } from '@/services/aliExpression';

function cue(
  priority: AliExpressionCue['priority'],
  tag: string,
): AliExpressionCue & { tag: string } {
  return {
    expression: 'NEUTRAL',
    pose: 'PERCHED',
    intensity: priority,
    priority,
    durationMs: 3000,
    tag,
  };
}

describe('enqueueAliReaction', () => {
  it('ignores a priority-0 (NONE) cue entirely', () => {
    const state = enqueueAliReaction(EMPTY_ALI_REACTION_QUEUE_STATE, cue(0, 'none'));
    expect(state).toEqual(EMPTY_ALI_REACTION_QUEUE_STATE);
  });

  it('becomes active immediately when nothing is currently active', () => {
    const state = enqueueAliReaction(EMPTY_ALI_REACTION_QUEUE_STATE, cue(3, 'first'));
    expect(state.active?.tag).toBe('first');
    expect(state.pending).toBeNull();
  });

  it('preempts a lower-priority active cue immediately, dropping any pending', () => {
    const withActiveAndPending: AliReactionQueueState<ReturnType<typeof cue>> = {
      active: cue(2, 'active-low'),
      pending: cue(2, 'pending-low'),
    };
    const state = enqueueAliReaction(withActiveAndPending, cue(5, 'journey'));
    expect(state.active?.tag).toBe('journey');
    expect(state.pending).toBeNull();
  });

  it('does not preempt a same-priority active cue -- queues it as pending instead', () => {
    const withActive: AliReactionQueueState<ReturnType<typeof cue>> = {
      active: cue(3, 'active'),
      pending: null,
    };
    const state = enqueueAliReaction(withActive, cue(3, 'same-tier'));
    expect(state.active?.tag).toBe('active');
    expect(state.pending?.tag).toBe('same-tier');
  });

  it('does not preempt a higher-priority active cue -- queues the weaker one as pending instead', () => {
    const withActive: AliReactionQueueState<ReturnType<typeof cue>> = {
      active: cue(4, 'level-up'),
      pending: null,
    };
    const state = enqueueAliReaction(withActive, cue(1, 'normal'));
    expect(state.active?.tag).toBe('level-up');
    expect(state.pending?.tag).toBe('normal');
  });

  it('keeps only the single best pending cue -- a stronger one replaces a weaker pending', () => {
    const withPending: AliReactionQueueState<ReturnType<typeof cue>> = {
      active: cue(4, 'active'),
      pending: cue(1, 'weak-pending'),
    };
    const state = enqueueAliReaction(withPending, cue(3, 'stronger'));
    expect(state.pending?.tag).toBe('stronger');
  });

  it('drops a weaker cue that arrives after a stronger one is already pending', () => {
    const withPending: AliReactionQueueState<ReturnType<typeof cue>> = {
      active: cue(4, 'active'),
      pending: cue(3, 'strong-pending'),
    };
    const state = enqueueAliReaction(withPending, cue(1, 'weaker'));
    expect(state.pending?.tag).toBe('strong-pending');
  });
});

describe('clearActiveAliReaction', () => {
  it('clears active but leaves any pending cue untouched', () => {
    const withBoth: AliReactionQueueState<ReturnType<typeof cue>> = {
      active: cue(3, 'active'),
      pending: cue(2, 'pending'),
    };
    const state = clearActiveAliReaction(withBoth);
    expect(state.active).toBeNull();
    expect(state.pending?.tag).toBe('pending');
  });

  it('is a no-op when nothing is active', () => {
    const state = clearActiveAliReaction(EMPTY_ALI_REACTION_QUEUE_STATE);
    expect(state).toEqual(EMPTY_ALI_REACTION_QUEUE_STATE);
  });
});

describe('promotePendingAliReaction', () => {
  it('promotes the pending cue into active and clears pending', () => {
    const withPending: AliReactionQueueState<ReturnType<typeof cue>> = {
      active: null,
      pending: cue(2, 'next-up'),
    };
    const state = promotePendingAliReaction(withPending);
    expect(state.active?.tag).toBe('next-up');
    expect(state.pending).toBeNull();
  });

  it('is a no-op when nothing is pending', () => {
    const state = promotePendingAliReaction(EMPTY_ALI_REACTION_QUEUE_STATE);
    expect(state).toEqual(EMPTY_ALI_REACTION_QUEUE_STATE);
  });
});
