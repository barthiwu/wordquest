import { apiRequest } from './apiClient';

export type BossBattleStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED';

export interface UpcomingBattle {
  weekId: string;
  scheduledStartUtc: string;
  scheduledEndUtc: string;
  status: BossBattleStatus;
}

export interface BattleChallengeView {
  groupId: string;
  /** ISO timestamp — server-authoritative; render a countdown from it, never decide anything from it client-side. */
  battleEndsAt: string;
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
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
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
