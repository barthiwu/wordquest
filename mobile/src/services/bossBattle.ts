import { apiRequest } from './apiClient';
import type { AliExpressionCue, AliDisplayMessage } from './aliExpression';

export type BossBattleStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED';

export interface UpcomingBattle {
  weekId: string;
  scheduledStartUtc: string;
  scheduledEndUtc: string;
  status: BossBattleStatus;
}

export interface BattleChallengeView {
  groupId: string;
  /**
   * ISO timestamp — server-authoritative; render a countdown from it,
   * never decide anything from it client-side. This is THIS PLAYER's
   * own deadline, not necessarily the group's full-hour end — a player
   * who joined partway through the hour has a nearer cutoff than that.
   */
  battleEndsAt: string;
  /**
   * True when THIS PLAYER's own battle is already over — their guesses
   * are used up, their personal time window elapsed, or the group's
   * battle window itself ended. Every other field is a meaningless
   * placeholder when this is true; route straight to the "battle over"
   * state without reading them.
   */
  battleEnded: boolean;
  /** How many of this player's questions they've already answered — for a "7 of 30" progress readout. */
  questionsAnswered: number;
  /** The hard per-player guess cap. */
  maxQuestions: number;
  displayPattern: string;
  missingIndexes: number[];
  wordLength: number;
  definition: string;
  partOfSpeech: string;
}

export interface BattleAnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
  exampleSentence: string;
  xpAwarded: number;
  battleXp: number;
  battleEnded: boolean;
  nextChallenge: BattleChallengeView | null;
  /** A short, zero-cost ALI reaction to this specific answer (V21 §6) — null once the battle has ended. */
  aliQuickReaction: string | null;
  /** The visual pairing for aliQuickReaction (ALI Character & Animation
   * Bible v1 §12) — same null-once-ended rule. Rendered by
   * components/AliCharacter.tsx. */
  aliQuickExpression: AliExpressionCue | null;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  /** Resolved player avatar, or null when they have none set. Backs the
   * avatar-tap "Profile / Add Friend / Block" popup (2026-09). */
  avatarUrl: string | null;
  /** Null while the battle is still LIVE — no comparative rank is shown until the group finalizes. */
  rank: number | null;
  battleXp: number;
  correctAnswers: number;
  incorrectAnswers: number;
  isYou: boolean;
  /** Null while the battle is still LIVE — populated once the group finalizes. */
  rewardXp: number | null;
  rewardGlyphs: number | null;
}

/**
 * While `status` is SCHEDULED or LIVE, `entries` contains only the
 * player's own row — a private progress view, matching Boss Battle's
 * "no live visibility into other players" design (Correction &
 * Completion Spec §4). The full ranked group only appears once `status`
 * is COMPLETED.
 */
export interface BattleLeaderboardView {
  groupId: string;
  status: BossBattleStatus;
  entries: LeaderboardEntry[];
  /** A "while your battle ran..." recap of ALI's fire-and-forgotten reactions (Boss result, Level-up, Journey, Mastery, Achievement). Always [] until this player's group finalizes. */
  deferredAliReactions: AliDisplayMessage[];
}

/** Lightweight — for a pre-battle countdown display, no join/eligibility side effects. */
export function getUpcomingBattle(accessToken: string): Promise<UpcomingBattle> {
  return apiRequest<UpcomingBattle>('/boss-battle/upcoming', { accessToken });
}

/** Joins (or resumes) this week's live battle, matched into a group of up to 20 players. */
export function joinBattle(accessToken: string): Promise<BattleChallengeView> {
  return apiRequest<BattleChallengeView>('/boss-battle/join', { method: 'POST', accessToken });
}

/**
 * A locally-generated idempotency key, good enough for "don't
 * double-submit if a retry fires after a flaky connection" — the
 * server is the actual source of truth on whether it's ever seen this
 * key before, this just needs to be unique per attempt, not
 * cryptographically strong.
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Answers the player's current Boss Battle challenge. Honors server-side idempotency — a retried request with the same key returns the original result instead of re-scoring. */
export function submitBattleAnswer(
  accessToken: string,
  answer: string,
  idempotencyKey = generateIdempotencyKey(),
): Promise<BattleAnswerResult> {
  return apiRequest<BattleAnswerResult>('/boss-battle/answer', {
    method: 'POST',
    body: { answer },
    accessToken,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** The player's own group, live-ranked. */
export function getBattleLeaderboard(accessToken: string): Promise<BattleLeaderboardView> {
  return apiRequest<BattleLeaderboardView>('/boss-battle/leaderboard', { accessToken });
}
