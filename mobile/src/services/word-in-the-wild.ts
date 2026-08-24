import { apiRequest } from './apiClient';

export type EvidenceType = 'TEXT' | 'PHOTO';
export type AssessmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PhotoContentType = 'image/jpeg' | 'image/png';

export interface Mission {
  id: string;
  wordId: string;
  word: string;
  definition: string;
  status: 'OPEN' | 'SUBMITTED';
  createdAt: string;
}

export interface Submission {
  id: string;
  missionId: string;
  wordId: string;
  evidenceType: EvidenceType;
  assessmentStatus: AssessmentStatus;
  assessmentReasoning: string | null;
  xpAwarded: number;
  createdAt: string;
}

export interface UploadTarget {
  key: string;
  uploadUrl: string;
}

export function createMission(accessToken: string, wordId: string): Promise<Mission> {
  return apiRequest<Mission>('/word-in-the-wild/missions', {
    method: 'POST',
    body: { wordId },
    accessToken,
  });
}

export function createPhotoUploadTarget(
  accessToken: string,
  missionId: string,
  contentType: PhotoContentType,
): Promise<UploadTarget> {
  return apiRequest<UploadTarget>(`/word-in-the-wild/missions/${missionId}/photo-upload-url`, {
    method: 'POST',
    body: { contentType },
    accessToken,
  });
}

/**
 * Uploads directly to R2 using the presigned URL from
 * createPhotoUploadTarget — deliberately NOT routed through apiRequest,
 * since this call goes to R2, not our backend: no Authorization header
 * (R2 doesn't know about our JWTs) and a raw image body, not JSON.
 */
export async function uploadPhotoToR2(
  uploadUrl: string,
  photoUri: string,
  contentType: PhotoContentType,
): Promise<void> {
  const fileResponse = await fetch(photoUri);
  const bytes = await fileResponse.blob();

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });

  if (!putResponse.ok) {
    throw new Error(`Photo upload failed (${putResponse.status})`);
  }
}

export function submitTextEvidence(
  accessToken: string,
  missionId: string,
  text: string,
): Promise<Submission> {
  return apiRequest<Submission>('/word-in-the-wild/submissions', {
    method: 'POST',
    body: { missionId, evidenceType: 'TEXT', text },
    accessToken,
  });
}

export function submitPhotoEvidence(
  accessToken: string,
  missionId: string,
  photoKey: string,
): Promise<Submission> {
  return apiRequest<Submission>('/word-in-the-wild/submissions', {
    method: 'POST',
    body: { missionId, evidenceType: 'PHOTO', photoKey },
    accessToken,
  });
}

export function getSubmission(accessToken: string, submissionId: string): Promise<Submission> {
  return apiRequest<Submission>(`/word-in-the-wild/submissions/${submissionId}`, { accessToken });
}

export function deleteSubmission(
  accessToken: string,
  submissionId: string,
): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/word-in-the-wild/submissions/${submissionId}`, {
    method: 'DELETE',
    accessToken,
  });
}
