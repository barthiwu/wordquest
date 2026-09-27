import { apiRequest } from './apiClient';

export interface Progression {
  level: number;
  totalXp: number;
  glyphBalance: number;
  journeyStage: number;
  currentStreak: number;
  longestStreak: number;
  /** Whether recordDailyActivity has already fired for today's local
   * date -- Daily Quest completion OR a completed Arcade session both
   * count (see backend ProgressionController#me). Home reads this for
   * its streak ring/flame instead of Daily Quest's own completedCount. */
  playedToday: boolean;
  masteredWordsCount: number;
  bossBattlesCompleted: number;
  cefrUnlocked: boolean;
}

export function getMyProgression(accessToken: string): Promise<Progression> {
  return apiRequest<Progression>('/progression/me', { accessToken });
}
