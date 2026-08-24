import { apiRequest } from './apiClient';

export type LearningGoal = 'CASUAL' | 'TRAVEL' | 'ACADEMIC' | 'CAREER' | 'FLUENCY';
export type MasteryLevel = 'NEW' | 'RECOGNIZING' | 'RECALLING' | 'STRONG' | 'MASTERED';

export interface Me {
  id: string;
  email: string;
  displayName: string;
  countryCode: string | null;
  nativeLanguage: string | null;
  targetLanguage: string | null;
  timezone: string | null;
  learningGoal: LearningGoal | null;
  onboardingCompletedAt: string | null;
  clanId: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
}

export interface UpdateMeInput {
  countryCode?: string;
  nativeLanguage?: string;
  targetLanguage?: string;
  /** An IANA timezone name (e.g. "America/Los_Angeles") — see utils/timezone.ts's getDeviceTimezone(). */
  timezone?: string;
  learningGoal?: LearningGoal;
  clanId?: string;
  completeOnboarding?: boolean;
}

export interface WordMasteryDetail {
  wordId: string;
  currentLevel: MasteryLevel;
  masteryScore: number;
  timesPresented: number;
  timesCorrect: number;
  timesIncorrect: number;
  currentCorrectStreak: number;
  lastPresentedAt: string | null;
  lastCorrectAt: string | null;
  masteredAt: string | null;
}

export function getMe(accessToken: string): Promise<Me> {
  return apiRequest<Me>('/users/me', { accessToken });
}

export function updateMe(accessToken: string, input: UpdateMeInput) {
  return apiRequest('/users/me', { method: 'PATCH', body: input, accessToken });
}

/** Spec v2 §19 — the player's own relationship with one specific word (presented/correct/incorrect counts, current level, streak). */
export function getWordMastery(accessToken: string, wordId: string): Promise<WordMasteryDetail> {
  return apiRequest<WordMasteryDetail>(`/users/me/words/${wordId}/mastery`, { accessToken });
}
