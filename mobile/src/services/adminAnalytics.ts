import { apiRequest } from './apiClient';

/**
 * Read-only mirror of backend/src/analytics/analytics-query.service.ts's
 * OverviewStats/WordDuelDashboardStats — see that file for what each
 * field actually measures and why a few deliberately-omittable counts
 * (e.g. Word Duel's own "sessions started") aren't duplicated here.
 */
export interface OverviewStats {
  registeredUsers: number;
  activeUsersLast24h: number;
  activeUsersLast7d: number;
  questsCompleted: number;
  questsStarted: number;
  bossBattlesJoined: number;
  shopPurchases: number;
  arcadeSessionsStarted: number;
}

export interface WordDuelDashboardStats {
  matchesWaiting: number;
  matchesActive: number;
  matchesCompleted: number;
  matchesAbandonedWaiting: number;
  totalAnswers: number;
  correctAnswers: number;
  correctRate: number | null;
  avgCluesUsed: number | null;
  avgResponseTimeMs: number | null;
  clueUsage: { clueNumber: number; fraction: number }[];
}

export interface ArcadeGameDashboardStats {
  sessionsActive: number;
  sessionsCompleted: number;
  sessionsAbandoned: number;
  totalAnswers: number;
  correctAnswers: number;
  correctRate: number | null;
  avgHintsUsed: number | null;
  avgResponseTimeMs: number | null;
}

export interface ArcadeDashboardStats {
  scrambleQuest: ArcadeGameDashboardStats;
  completeIt: ArcadeGameDashboardStats;
  /** Absent from servers that predate Hangman. */
  hangman?: ArcadeGameDashboardStats;
}

/** GET /analytics/dashboard/overview — admin/support-only server-side (RolesGuard); a non-admin token gets a 403. */
export function getOverviewStats(accessToken: string): Promise<OverviewStats> {
  return apiRequest<OverviewStats>('/analytics/dashboard/overview', { accessToken });
}

/** GET /analytics/dashboard/word-duel — same admin/support-only gate as getOverviewStats. */
export function getWordDuelDashboardStats(accessToken: string): Promise<WordDuelDashboardStats> {
  return apiRequest<WordDuelDashboardStats>('/analytics/dashboard/word-duel', { accessToken });
}

/** GET /analytics/dashboard/arcade — same admin/support-only gate as getOverviewStats. */
export function getArcadeDashboardStats(accessToken: string): Promise<ArcadeDashboardStats> {
  return apiRequest<ArcadeDashboardStats>('/analytics/dashboard/arcade', { accessToken });
}
