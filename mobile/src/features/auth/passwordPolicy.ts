import { ApiError } from '@/services/apiClient';

/**
 * Mirrors the server's password policy (backend/src/auth/dto/password.validator.ts):
 * 8-72 characters with at least one letter and one number. Checked on the
 * device so the button doesn't enable for a password the server will
 * reject, and the player sees why instead of a vague "invalid code".
 */
export function isAcceptablePassword(password: string): boolean {
  return (
    password.length >= 8 &&
    password.length <= 72 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

export type ResetErrorKind = 'invalidCode' | 'weakPassword' | 'generic';

/** Maps a failed reset-password call to the message that actually applies. */
export function classifyResetError(error: unknown): ResetErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'invalidCode';
    if (error.status === 400) return 'weakPassword';
  }
  return 'generic';
}
