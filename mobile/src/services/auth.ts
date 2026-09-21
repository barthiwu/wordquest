import { apiRequest } from './apiClient';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  countryCode: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export function register(input: {
  email: string;
  password: string;
  displayName: string;
  countryCode?: string;
  /** "YYYY-MM-DD" — age gate (COPPA), enforced server-side in AuthService.register. */
  dateOfBirth: string;
}): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/register', { method: 'POST', body: input });
}

export function login(input: { email: string; password: string }): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/login', { method: 'POST', body: input });
}

/** Rotates a refresh token for a fresh access/refresh pair — same shape as login/register, so the caller can hand the result straight to authStore.setSession. */
export function refresh(refreshToken: string): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/refresh', { method: 'POST', body: { refreshToken } });
}

/** Revokes the given refresh token server-side. Always call this before clearing local session state — a device that's merely forgotten its tokens is not the same as a session that's actually been ended. */
export function logout(refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken } });
}

export function verifyEmail(token: string): Promise<void> {
  return apiRequest<void>('/auth/verify-email', { method: 'POST', body: { token } });
}

export function resendVerification(accessToken: string): Promise<void> {
  return apiRequest<void>('/auth/resend-verification', { method: 'POST', accessToken });
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiRequest<void>('/auth/request-password-reset', { method: 'POST', body: { email } });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
}

/** Marks the account DELETED (not erased) — recoverAccount can restore it with the right credentials. */
export function deleteAccount(accessToken: string): Promise<void> {
  return apiRequest<void>('/auth/delete-account', { method: 'POST', accessToken });
}

/** Restores a DELETED account back to ACTIVE and issues a fresh session — same credential shape as login. */
export function recoverAccount(input: { email: string; password: string }): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/recover-account', { method: 'POST', body: input });
}
