/**
 * Client-side mirror of backend/src/ali/ali-expression.ts's exported
 * types — same manual-sync convention already used for BattleChallengeView
 * and friends (see bossBattle.ts/wordDuel.ts's own doc comments). The
 * actual expression/pose selection logic stays server-only and
 * deterministic (ALI Character & Animation Bible v1 §12): the client
 * only ever receives a resolved AliExpressionCue over the wire and maps
 * it to on-screen motion (see components/AliCharacter.tsx).
 */

/** Bible §4 expression list, verbatim. */
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

/** Bible §5 pose list, verbatim. */
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

/** Bible §10 priority table — used by useAliReactionQueue to arbitrate concurrent/rapid triggers. */
export type AliPriority = 0 | 1 | 2 | 3 | 4 | 5;

export interface AliExpressionCue {
  expression: AliExpression;
  pose: AliPose;
  intensity: AliIntensity;
  priority: AliPriority;
  /** 0 means "no timed pop-up moment" — render inline instead of as a dismissable bubble. */
  durationMs: number;
}

/**
 * Client-side mirror of backend's AliDisplayMessage (ali.service.ts) —
 * what every "here's what ALI has to say" endpoint (Daily Quest's
 * aliMessage/liveAliReactions/streakReaction, arcade's streakReaction/
 * deferredAliReactions, Boss Battle's/Master Challenge's
 * deferredAliReactions) actually sends over the wire.
 */
export interface AliDisplayMessage extends AliExpressionCue {
  text: string;
  recommendation: string | null;
}
