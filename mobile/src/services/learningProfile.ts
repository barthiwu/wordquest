import { apiRequest } from './apiClient';

export type WordDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface LearningProfile {
  calibrated: boolean;
  calibrationWordsCompleted: number;
  currentDifficulty: WordDifficulty;
  recommendedDifficulty: WordDifficulty | null;
  recommendedDifficultyAcceptedAt: string | null;
  initialCefrEstimate: string | null;
  weaknessAreas: string[];
  avgGuessAccuracy: number;
  avgSentenceScore: number;
  avgParagraphScore: number;
  avgResponseSpeedMs: number;
  hintDependencyRate: number;
  learningConsistency: number;
}

/** The Adaptive AI Learning Engine's Player Learning Profile (spec §1) — Initial Calibration result plus the accept/reject decision on its recommended difficulty. */
export function getMyLearningProfile(accessToken: string): Promise<LearningProfile> {
  return apiRequest<LearningProfile>('/learning-profile/me', { accessToken });
}

export function acceptRecommendedDifficulty(accessToken: string): Promise<LearningProfile> {
  return apiRequest<LearningProfile>('/learning-profile/me/accept-difficulty', {
    method: 'POST',
    accessToken,
  });
}

export function rejectRecommendedDifficulty(accessToken: string): Promise<LearningProfile> {
  return apiRequest<LearningProfile>('/learning-profile/me/reject-difficulty', {
    method: 'POST',
    accessToken,
  });
}
