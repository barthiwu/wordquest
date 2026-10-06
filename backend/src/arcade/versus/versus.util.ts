/**
 * Pure rules for settling a head-to-head Arcade match. No I/O, so every
 * edge (draws, forfeits, nobody played) is covered by plain unit tests.
 */

/** One player's progress in a match, summed from their session's answers. */
export interface VersusSide {
  correct: number;
  answered: number;
  /** Sum of server-measured response times, ms. */
  timeMs: number;
  /** True once their session ran to its last word. */
  finished: boolean;
  finishedAt: Date | null;
}

export type VersusWinner = 'HOST' | 'GUEST' | null;
export type VersusReason = 'WIN' | 'DRAW' | 'FORFEIT' | 'NO_CONTEST';

export interface VersusDecision {
  winner: VersusWinner;
  reason: VersusReason;
}

/**
 * Winner = more correct answers; a tie goes to the lower total time; equal
 * on both is a draw. When the match is settled with a player still
 * unfinished (they left, or ran out the clock) the same comparison runs on
 * what each has answered so far and the reason is FORFEIT. If neither
 * player answered a single word nobody wins (NO_CONTEST).
 */
export function decideResult(host: VersusSide, guest: VersusSide): VersusDecision {
  if (host.answered === 0 && guest.answered === 0) {
    return { winner: null, reason: 'NO_CONTEST' };
  }
  const forfeit = !(host.finished && guest.finished);
  if (host.correct !== guest.correct) {
    return {
      winner: host.correct > guest.correct ? 'HOST' : 'GUEST',
      reason: forfeit ? 'FORFEIT' : 'WIN',
    };
  }
  // Equal correct. If exactly one side finished and the other did not, the
  // finisher did strictly more work for the same score.
  if (host.finished !== guest.finished) {
    return { winner: host.finished ? 'HOST' : 'GUEST', reason: 'FORFEIT' };
  }
  if (host.timeMs !== guest.timeMs) {
    return {
      winner: host.timeMs < guest.timeMs ? 'HOST' : 'GUEST',
      reason: forfeit ? 'FORFEIT' : 'WIN',
    };
  }
  return { winner: null, reason: 'DRAW' };
}

/**
 * When an ACTIVE match must be settled even though someone is unfinished:
 * the match's own deadline, or `graceMs` after the first player finished,
 * whichever comes first.
 */
export function settlementDeadline(
  expiresAt: Date,
  sides: readonly VersusSide[],
  graceMs: number,
): Date {
  let deadline = expiresAt.getTime();
  for (const side of sides) {
    if (side.finished && side.finishedAt) {
      deadline = Math.min(deadline, side.finishedAt.getTime() + graceMs);
    }
  }
  return new Date(deadline);
}

/** True when the match can be settled right now. */
export function isReadyToSettle(
  expiresAt: Date,
  host: VersusSide,
  guest: VersusSide,
  graceMs: number,
  now: Date,
): boolean {
  if (host.finished && guest.finished) return true;
  return now.getTime() >= settlementDeadline(expiresAt, [host, guest], graceMs).getTime();
}
