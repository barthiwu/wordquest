import { apiRequest } from './apiClient';

export interface Progression {
  level: number;
  totalXp: number;
  glyphBalance: number;
  journeyStage: number;
  currentStreak: number;
  longestStreak: number;
  masteredWordsCount: number;
  bossBattlesCompleted: number;
  cefrUnlocked: boolean;
}

export function getMyProgression(accessToken: string): Promise<Progression> {
  return apiRequest<Progression>('/progression/me', { accessToken });
}
