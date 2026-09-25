import { apiRequest } from './apiClient';

export type LearningGoal = 'CASUAL' | 'TRAVEL' | 'ACADEMIC' | 'CAREER' | 'FLUENCY';
export type MasteryLevel = 'NEW' | 'RECOGNIZING' | 'RECALLING' | 'STRONG' | 'MASTERED';

export interface Me {
  id: string;
  email: string;
  /** The account owner's real name -- shown only to the account owner, never other players. See `username`. */
  displayName: string;
  /** The public handle shown to other players (leaderboards, Boss Battle, Quest Cards). Lowercase letters, digits, underscores; 3-20 chars. */
  username: string;
  countryCode: string | null;
  nativeLanguage: string | null;
  targetLanguage: string | null;
  timezone: string | null;
  learningGoal: LearningGoal | null;
  onboardingCompletedAt: string | null;
  clanId: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
  avatarUrl: string | null;
}

export interface UpdateMeInput {
  displayName?: string;
  username?: string;
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

export type AvatarContentType = 'image/jpeg' | 'image/png';

export interface AvatarUploadTarget {
  key: string;
  uploadUrl: string;
}

export function createAvatarUploadTarget(
  accessToken: string,
  contentType: AvatarContentType,
): Promise<AvatarUploadTarget> {
  return apiRequest<AvatarUploadTarget>('/users/me/avatar/upload-url', {
    method: 'POST',
    body: { contentType },
    accessToken,
  });
}

/**
 * Uploads directly to object storage using the presigned URL from
 * createAvatarUploadTarget -- deliberately NOT routed through
 * apiRequest, same reasoning as Word in the Wild's uploadPhotoToR2:
 * this goes straight to the bucket, not our backend.
 */
export async function uploadAvatarBytes(
  uploadUrl: string,
  photoUri: string,
  contentType: AvatarContentType,
): Promise<void> {
  const fileResponse = await fetch(photoUri);
  const bytes = await fileResponse.blob();

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });

  if (!putResponse.ok) {
    throw new Error(`Avatar upload failed (${putResponse.status})`);
  }
}

/** `key` must come from a prior createAvatarUploadTarget() call, and the client must have already PUT the bytes there. */
export function confirmAvatar(
  accessToken: string,
  key: string,
): Promise<{ avatarUrl: string | null }> {
  return apiRequest<{ avatarUrl: string | null }>('/users/me/avatar', {
    method: 'POST',
    body: { key },
    accessToken,
  });
}

export function deleteAvatar(accessToken: string): Promise<{ avatarUrl: string | null }> {
  return apiRequest<{ avatarUrl: string | null }>('/users/me/avatar', {
    method: 'DELETE',
    accessToken,
  });
}

export function getMe(accessToken: string): Promise<Me> {
  return apiRequest<Me>('/users/me', { accessToken });
}

/** The subset of Me that PATCH /users/me actually returns -- notably not email/createdAt/emailVerifiedAt/avatarUrl. */
export interface UpdateMeResult {
  id: string;
  displayName: string;
  username: string;
  countryCode: string | null;
  nativeLanguage: string | null;
  targetLanguage: string | null;
  timezone: string | null;
  learningGoal: LearningGoal | null;
  onboardingCompletedAt: string | null;
  clanId: string | null;
}

export function updateMe(accessToken: string, input: UpdateMeInput): Promise<UpdateMeResult> {
  return apiRequest<UpdateMeResult>('/users/me', { method: 'PATCH', body: input, accessToken });
}

/** Live "is this available?" check for the username field in Settings -- lets the UI validate before the player saves. */
export function checkUsernameAvailability(
  accessToken: string,
  username: string,
): Promise<{ available: boolean }> {
  return apiRequest<{ available: boolean }>(
    `/users/username-availability?username=${encodeURIComponent(username)}`,
    { accessToken },
  );
}

/** Spec v2 §19 — the player's own relationship with one specific word (presented/correct/incorrect counts, current level, streak). */
export function getWordMastery(accessToken: string, wordId: string): Promise<WordMasteryDetail> {
  return apiRequest<WordMasteryDetail>(`/users/me/words/${wordId}/mastery`, { accessToken });
}

export interface WordMasteryListItem {
  wordId: string;
  word: string;
  currentLevel: MasteryLevel;
  masteryScore: number;
  guessScore: number;
  sentenceScore: number;
  paragraphScore: number;
  timesPresented: number;
  timesCorrect: number;
  timesIncorrect: number;
  lastPresentedAt: string | null;
  masteredAt: string | null;
  nextReviewDueAt: string | null;
}

/** Every word the player has ever been presented with, most-recent first — backs the Profile "My Words" list. */
export function listMyWordMastery(accessToken: string): Promise<WordMasteryListItem[]> {
  return apiRequest<WordMasteryListItem[]>('/users/me/words', { accessToken });
}
