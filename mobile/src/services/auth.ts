import { apiRequest } from './apiClient';
import type { UserRole } from './users';

export interface AuthUser {
  id: string;
  email: string;
  /** Not sent by register/login (only /users/me) -- undefined until the next getMe() hydrate. */
  role?: UserRole;
  /** The account owner's real name -- shown only to the account owner, never other players. See `username`. */
  displayName: string;
  /** The public handle shown to other players (leaderboards, Boss Battle, Quest Cards). */
  username: string;
  countryCode: string | null;
  /**
   * Resolved (short-lived, presigned) on the backend -- see AuthService.
   * toPublicUser. Present on register/login/recoverAccount responses so
   * Home's header (and anywhere else `user` is read) doesn't need a
   * separate fetch to show it; PassportScreen also pushes a fresh value
   * here via updateUser() right after an upload/delete so it doesn't go
   * stale until the next login.
   */
  avatarUrl: string | null;
  /** True while playing as a guest (joined a group link without an account). */
  isGuest?: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/** Returned instead of tokens when the account has two-step verification turned on. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

export type LoginResult = AuthResult | TwoFactorChallenge;

export function isTwoFactorChallenge(result: LoginResult): result is TwoFactorChallenge {
  return (result as TwoFactorChallenge).twoFactorRequired === true;
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

/**
 * A guest turns their session into a real account, keeping their name and the
 * group they are in. Same fields as register(); needs the guest's access token.
 */
export function upgradeGuest(
  accessToken: string,
  input: Parameters<typeof register>[0] & { englishVariant?: 'US' | 'UK' },
): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/guest/upgrade', {
    method: 'POST',
    body: input,
    accessToken,
  });
}

export function login(input: { email: string; password: string }): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/login', { method: 'POST', body: input });
}

/** Second step of a two-step-verification login: the challenge from login()/socialLogin() plus an authenticator or recovery code. */
export function completeTwoFactorLogin(input: { challengeToken: string; code: string }): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/2fa/login', { method: 'POST', body: input });
}

export type SocialProvider = 'GOOGLE' | 'APPLE' | 'FACEBOOK';

export interface SocialProvidersInfo {
  google: { enabled: boolean; clientIds: string[] };
  apple: { enabled: boolean; clientIds: string[] };
  facebook: { enabled: boolean; appId: string | null };
}

/** Which social sign-in providers the server has configured — the app only shows those. */
export function getSocialProviders(): Promise<SocialProvidersInfo> {
  return apiRequest<SocialProvidersInfo>('/auth/providers');
}

export interface SocialLoginInput {
  provider: SocialProvider;
  /** Google/Apple: the OIDC ID token. Facebook: the user access token. */
  credential: string;
  /** Apple only shares the name once, to the client. */
  displayName?: string;
  /** "YYYY-MM-DD" — only needed when this creates a NEW account (the server answers DOB_REQUIRED). */
  dateOfBirth?: string;
}

export function socialLogin(input: SocialLoginInput): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/social', { method: 'POST', body: input });
}

/** True when the server asked for a birthdate before it can create a social account. */
export function isDobRequiredError(body: unknown): boolean {
  const b = body as { code?: string; message?: { code?: string } } | undefined;
  return b?.code === 'DOB_REQUIRED' || b?.message?.code === 'DOB_REQUIRED';
}

// --- Two-step verification (Settings → Security) -----------------------------

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

export function getTwoFactorStatus(accessToken: string): Promise<TwoFactorStatus> {
  return apiRequest<TwoFactorStatus>('/auth/2fa/status', { accessToken });
}

/** Starts enrolment: returns the secret + otpauth:// URL to show as a QR code. Not active until confirmed. */
export function beginTwoFactorSetup(accessToken: string): Promise<{ secret: string; otpauthUrl: string }> {
  return apiRequest('/auth/2fa/setup', { method: 'POST', accessToken });
}

/** Confirms enrolment with a first valid code; returns the one-time recovery codes. */
export function enableTwoFactor(accessToken: string, code: string): Promise<{ recoveryCodes: string[] }> {
  return apiRequest('/auth/2fa/enable', { method: 'POST', accessToken, body: { code } });
}

export function disableTwoFactor(accessToken: string, code: string): Promise<void> {
  return apiRequest<void>('/auth/2fa/disable', { method: 'POST', accessToken, body: { code } });
}

export function regenerateRecoveryCodes(accessToken: string, code: string): Promise<{ recoveryCodes: string[] }> {
  return apiRequest('/auth/2fa/recovery-codes', { method: 'POST', accessToken, body: { code } });
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
export function recoverAccount(input: {
  email: string;
  password: string;
  /** Needed when the account has two-step verification on. */
  twoFactorCode?: string;
}): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/recover-account', { method: 'POST', body: input });
}
