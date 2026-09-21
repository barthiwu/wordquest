import {
  deleteAccount,
  login,
  logout,
  recoverAccount,
  refresh,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from './auth';
import { apiRequest } from './apiClient';

jest.mock('./apiClient', () => ({ apiRequest: jest.fn() }));

describe('auth service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a new account', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    const input = { email: 'a@b.com', password: 'password1', displayName: 'A', dateOfBirth: '2000-01-01' };
    await register(input);
    expect(apiRequest).toHaveBeenCalledWith('/auth/register', { method: 'POST', body: input });
  });

  it('logs in with credentials', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await login({ email: 'a@b.com', password: 'password1' });
    expect(apiRequest).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { email: 'a@b.com', password: 'password1' },
    });
  });

  it('rotates a refresh token', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await refresh('rtok');
    expect(apiRequest).toHaveBeenCalledWith('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'rtok' },
    });
  });

  it('revokes a refresh token on logout', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await logout('rtok');
    expect(apiRequest).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      body: { refreshToken: 'rtok' },
    });
  });

  it('verifies an email with a token', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await verifyEmail('vtok');
    expect(apiRequest).toHaveBeenCalledWith('/auth/verify-email', {
      method: 'POST',
      body: { token: 'vtok' },
    });
  });

  it('resends the verification email for the authenticated player', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await resendVerification('tok');
    expect(apiRequest).toHaveBeenCalledWith('/auth/resend-verification', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('requests a password reset by email', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await requestPasswordReset('a@b.com');
    expect(apiRequest).toHaveBeenCalledWith('/auth/request-password-reset', {
      method: 'POST',
      body: { email: 'a@b.com' },
    });
  });

  it('resets a password with a token', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await resetPassword('rtok', 'newpassword1');
    expect(apiRequest).toHaveBeenCalledWith('/auth/reset-password', {
      method: 'POST',
      body: { token: 'rtok', newPassword: 'newpassword1' },
    });
  });

  it('deletes the authenticated account', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(undefined);
    await deleteAccount('tok');
    expect(apiRequest).toHaveBeenCalledWith('/auth/delete-account', {
      method: 'POST',
      accessToken: 'tok',
    });
  });

  it('recovers a deleted account with credentials', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce({});
    await recoverAccount({ email: 'a@b.com', password: 'password1' });
    expect(apiRequest).toHaveBeenCalledWith('/auth/recover-account', {
      method: 'POST',
      body: { email: 'a@b.com', password: 'password1' },
    });
  });
});
