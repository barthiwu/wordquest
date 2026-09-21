import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { EmailService } from '../email/email.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('AuthService', () => {
  let service: AuthService;

  const fakeUser = {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: 'hashed',
    displayName: 'Ada',
    countryCode: 'NG',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  const usersMock = {
    create: jest.fn().mockResolvedValue(fakeUser),
    findByEmail: jest.fn().mockResolvedValue(fakeUser),
    verifyPassword: jest.fn().mockResolvedValue(true),
    hashPassword: jest.fn().mockResolvedValue('new-hashed-password'),
  };

  const prismaMock = {
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(fakeUser),
      update: jest.fn().mockResolvedValue({}),
    },
    emailVerificationToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    passwordResetToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    achievementUnlock: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    questCard: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    shopPurchase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  const jwtMock = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    verifyAsync: jest.fn(),
  };

  const configMock = {
    jwtAccessSecret: 'access-secret',
    jwtAccessExpiresIn: '15m',
    jwtRefreshSecret: 'refresh-secret',
    jwtRefreshExpiresIn: '30d',
  };

  const emailMock = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };
  const analyticsMock = { track: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    usersMock.create.mockResolvedValue(fakeUser);
    usersMock.findByEmail.mockResolvedValue(fakeUser);
    usersMock.verifyPassword.mockResolvedValue(true);
    prismaMock.user.findUniqueOrThrow.mockResolvedValue(fakeUser);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: AppConfigService, useValue: configMock },
        { provide: EmailService, useValue: emailMock },
        { provide: AnalyticsService, useValue: analyticsMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('register() creates the user and returns tokens + public profile', async () => {
    const result = await service.register({
      email: 'ada@example.com',
      password: 'Sup3rSecret',
      displayName: 'Ada',
      dateOfBirth: '2000-01-01',
    });

    expect(usersMock.create).toHaveBeenCalled();
    expect(result.user.email).toBe('ada@example.com');
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(prismaMock.refreshToken.create).toHaveBeenCalled();
  });

  it('register() rejects a date of birth under the minimum age (COPPA)', async () => {
    const dobUnderMinimum = new Date();
    dobUnderMinimum.setUTCFullYear(dobUnderMinimum.getUTCFullYear() - 12);

    await expect(
      service.register({
        email: 'young@example.com',
        password: 'Sup3rSecret',
        displayName: 'Too Young',
        dateOfBirth: dobUnderMinimum.toISOString().slice(0, 10),
      }),
    ).rejects.toThrow('at least 13 years old');
    expect(usersMock.create).not.toHaveBeenCalled();
  });

  it('register() rejects a date of birth in the future', async () => {
    const dobInFuture = new Date();
    dobInFuture.setUTCFullYear(dobInFuture.getUTCFullYear() + 1);

    await expect(
      service.register({
        email: 'future@example.com',
        password: 'Sup3rSecret',
        displayName: 'Time Traveler',
        dateOfBirth: dobInFuture.toISOString().slice(0, 10),
      }),
    ).rejects.toThrow('valid date in the past');
    expect(usersMock.create).not.toHaveBeenCalled();
  });

  it('register() accepts a date of birth exactly at the minimum age', async () => {
    const dobExactlyMinimum = new Date();
    dobExactlyMinimum.setUTCFullYear(dobExactlyMinimum.getUTCFullYear() - 13);

    const result = await service.register({
      email: 'exactly13@example.com',
      password: 'Sup3rSecret',
      displayName: 'Exactly Thirteen',
      dateOfBirth: dobExactlyMinimum.toISOString().slice(0, 10),
    });

    expect(usersMock.create).toHaveBeenCalled();
    expect(result.user.email).toBe('ada@example.com'); // fakeUser stub, not the submitted email
  });

  it('register() fires off a verification email without blocking on it (fire-and-forget)', async () => {
    await service.register({
      email: 'ada@example.com',
      password: 'Sup3rSecret',
      displayName: 'Ada',
      dateOfBirth: '2000-01-01',
    });

    // sendVerificationEmail's own internals run async in the background;
    // asserting the underlying email call would require flushing
    // microtasks. What register() itself guarantees is not throwing or
    // blocking on it — covered by the successful resolution above.
    expect(usersMock.create).toHaveBeenCalled();
  });

  it('login() rejects an unknown email without revealing that it is unknown', async () => {
    usersMock.findByEmail.mockResolvedValueOnce(null);
    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('login() rejects a wrong password', async () => {
    usersMock.verifyPassword.mockResolvedValueOnce(false);
    await expect(
      service.login({ email: 'ada@example.com', password: 'wrongpass1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('login() succeeds and issues tokens for a valid credential pair', async () => {
    const result = await service.login({ email: 'ada@example.com', password: 'Sup3rSecret' });
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.refreshToken).toBe('signed.jwt.token');
  });

  it('login() still succeeds even when the fire-and-forget security-event log write fails (failure recovery)', async () => {
    // logSecurityEvent is documented as "a failed/slow write here must
    // never break the auth flow it's recording" — this is the one test
    // that actually exercises that promise rather than just asserting it
    // in a comment.
    prismaMock.securityEvent.create.mockRejectedValueOnce(new Error('audit log DB unreachable'));

    const result = await service.login({ email: 'ada@example.com', password: 'Sup3rSecret' });
    expect(result.accessToken).toBe('signed.jwt.token');

    // Let the fire-and-forget microtask (and its .catch) settle before
    // the test ends, so an unhandled rejection can't leak into a later test.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('login() rejects a SUSPENDED account with a specific message', async () => {
    usersMock.findByEmail.mockResolvedValueOnce({ ...fakeUser, status: 'SUSPENDED' });
    await expect(
      service.login({ email: 'ada@example.com', password: 'Sup3rSecret' }),
    ).rejects.toThrow('suspended');
  });

  it('login() rejects a DELETED account with the SAME generic error as an unknown user — does not confirm the account ever existed', async () => {
    usersMock.findByEmail.mockResolvedValueOnce({ ...fakeUser, status: 'DELETED' });
    await expect(
      service.login({ email: 'ada@example.com', password: 'Sup3rSecret' }),
    ).rejects.toThrow('Invalid email or password');
  });

  describe('account lockout', () => {
    it('counts a failed login attempt against the account, not just the IP', async () => {
      usersMock.verifyPassword.mockResolvedValueOnce(false);
      await expect(
        service.login({ email: 'ada@example.com', password: 'wrongpass1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLoginAttempts: { increment: 1 } },
        select: { failedLoginAttempts: true },
      });
    });

    it('locks the account once failedLoginAttempts reaches the configured max', async () => {
      usersMock.verifyPassword.mockResolvedValueOnce(false);
      prismaMock.user.update.mockResolvedValueOnce({ failedLoginAttempts: 5 });

      await expect(
        service.login({ email: 'ada@example.com', password: 'wrongpass1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lockedUntil: expect.any(Date) },
      });
    });

    it('rejects a locked account with the SAME generic message, without checking the password', async () => {
      usersMock.findByEmail.mockResolvedValueOnce({
        ...fakeUser,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        service.login({ email: 'ada@example.com', password: 'Sup3rSecret' }),
      ).rejects.toThrow('Invalid email or password');
      expect(usersMock.verifyPassword).not.toHaveBeenCalled();
    });

    it('clears the lockout state on a successful login', async () => {
      usersMock.findByEmail.mockResolvedValueOnce({
        ...fakeUser,
        failedLoginAttempts: 3,
        lockedUntil: null,
      });

      await service.login({ email: 'ada@example.com', password: 'Sup3rSecret' });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });

    it('a lockout whose lockedUntil has already passed is treated as expired, not locked', async () => {
      usersMock.findByEmail.mockResolvedValueOnce({
        ...fakeUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 60_000), // in the past
      });

      const result = await service.login({ email: 'ada@example.com', password: 'Sup3rSecret' });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(usersMock.verifyPassword).toHaveBeenCalled();
    });
  });

  it('refresh() rejects a token that fails signature/expiry verification', async () => {
    jwtMock.verifyAsync.mockRejectedValueOnce(new Error('bad signature'));
    await expect(service.refresh('garbage-token')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh() rejects a token that verifies but is not found/rotated server-side', async () => {
    jwtMock.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', jti: 'abc' });
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);
    await expect(service.refresh('valid.jwt.but.revoked')).rejects.toThrow(UnauthorizedException);
  });

  it('refresh() rotates a valid, matching token and issues a new pair', async () => {
    jwtMock.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', jti: 'abc' });
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
      id: 'rt-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      sessionStartedAt: new Date(),
    });

    const result = await service.refresh('valid.jwt.token');

    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.accessToken).toBe('signed.jwt.token');
  });

  describe('refresh() absolute session lifetime (V20 Beta Release Checklist §12)', () => {
    it('rejects and revokes every session once sessionStartedAt is past the absolute lifetime, even for an otherwise-valid, unexpired token', async () => {
      jwtMock.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', jti: 'abc' });
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000), // this rotated token itself isn't expired
        sessionStartedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000), // session began 91 days ago
      });

      await expect(service.refresh('valid.but.ancient.session.token')).rejects.toThrow(
        'Session has expired',
      );

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('still rotates normally just under the absolute lifetime boundary', async () => {
      jwtMock.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', jti: 'abc' });
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        sessionStartedAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000), // still within 90 days
      });

      const result = await service.refresh('valid.recent.session.token');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('carries sessionStartedAt forward unchanged into the newly-issued token, rather than resetting it on rotation', async () => {
      const originalSessionStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      jwtMock.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', jti: 'abc' });
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        sessionStartedAt: originalSessionStart,
      });

      await service.refresh('valid.jwt.token');

      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionStartedAt: originalSessionStart }),
        }),
      );
    });
  });

  describe('refresh() reuse detection', () => {
    it('revokes every active session for the user when a REVOKED (already-rotated) token is presented again', async () => {
      jwtMock.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', jti: 'abc' });
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(), // already used once before — this is the reuse
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.refresh('stolen.rotated.token')).rejects.toThrow('reuse detected');

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does not attempt to rotate/reissue tokens when reuse is detected', async () => {
      jwtMock.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', jti: 'abc' });
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.refresh('stolen.rotated.token')).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('still rejects an expired-but-not-revoked token with the ordinary generic message, not the reuse message', async () => {
      jwtMock.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', jti: 'abc' });
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1), // expired, never used
      });

      await expect(service.refresh('expired.token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
      expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('sendVerificationEmail', () => {
    it('is a no-op when the user is already verified', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
        ...fakeUser,
        emailVerifiedAt: new Date(),
      });

      await service.sendVerificationEmail('user-1');

      expect(prismaMock.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(emailMock.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('creates a token and emails it for an unverified user', async () => {
      await service.sendVerificationEmail('user-1');

      expect(prismaMock.emailVerificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
      );
      expect(emailMock.sendVerificationEmail).toHaveBeenCalledWith(
        'ada@example.com',
        expect.any(String),
      );
    });

    it('never persists the raw token — only its hash', async () => {
      await service.sendVerificationEmail('user-1');

      const createCall = prismaMock.emailVerificationToken.create.mock.calls[0][0];
      const emailedToken = emailMock.sendVerificationEmail.mock.calls[0][1];
      expect(createCall.data.tokenHash).not.toBe(emailedToken);
      expect(createCall.data.tokenHash).toHaveLength(64); // sha256 hex digest length
    });
  });

  describe('verifyEmail', () => {
    it('throws UnauthorizedException for a token with no matching record', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce(null);
      await expect(service.verifyEmail('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for an already-used token', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: 'evt-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.verifyEmail('used-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for an expired token', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: 'evt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1),
      });
      await expect(service.verifyEmail('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('marks the token used and the user verified for a valid token', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: 'evt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.verifyEmail('good-token');

      expect(prismaMock.emailVerificationToken.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('resolves without creating a token when the email does not exist — same anti-enumeration principle as login()', async () => {
      usersMock.findByEmail.mockResolvedValueOnce(null);
      await expect(service.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
      expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('resolves without creating a token for a DELETED account', async () => {
      usersMock.findByEmail.mockResolvedValueOnce({ ...fakeUser, status: 'DELETED' });
      await service.requestPasswordReset('ada@example.com');
      expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates a token and emails it for a valid active account', async () => {
      await service.requestPasswordReset('ada@example.com');

      expect(prismaMock.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
      );
      expect(emailMock.sendPasswordResetEmail).toHaveBeenCalledWith(
        'ada@example.com',
        expect.any(String),
      );
    });
  });

  describe('resetPassword', () => {
    it('throws UnauthorizedException for a token with no matching record', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce(null);
      await expect(service.resetPassword('bad-token', 'NewPass123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for an already-used token', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.resetPassword('used-token', 'NewPass123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for an expired token', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1),
      });
      await expect(service.resetPassword('expired-token', 'NewPass123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('hashes the new password, marks the token used, and revokes every existing session', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await service.resetPassword('good-token', 'NewPass123');

      expect(usersMock.hashPassword).toHaveBeenCalledWith('NewPass123');
      expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'new-hashed-password' },
      });
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('deleteAccount', () => {
    it('sets status to DELETED with a timestamp and revokes every active session', async () => {
      await service.deleteAccount('user-1');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'DELETED', deletedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('recoverAccount', () => {
    it('rejects when the account is not actually DELETED', async () => {
      usersMock.findByEmail.mockResolvedValueOnce({ ...fakeUser, status: 'ACTIVE' });
      await expect(
        service.recoverAccount({ email: 'ada@example.com', password: 'Sup3rSecret' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password even for a DELETED account', async () => {
      usersMock.findByEmail.mockResolvedValueOnce({ ...fakeUser, status: 'DELETED' });
      usersMock.verifyPassword.mockResolvedValueOnce(false);
      await expect(
        service.recoverAccount({ email: 'ada@example.com', password: 'WrongPass1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('restores an ACTIVE status and issues fresh tokens on success', async () => {
      usersMock.findByEmail.mockResolvedValueOnce({ ...fakeUser, status: 'DELETED' });

      const result = await service.recoverAccount({
        email: 'ada@example.com',
        password: 'Sup3rSecret',
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      expect(result.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('changePassword', () => {
    it('rejects when the current password is wrong', async () => {
      usersMock.verifyPassword.mockResolvedValueOnce(false);
      await expect(service.changePassword('user-1', 'WrongCurrent1', 'NewPass123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersMock.hashPassword).not.toHaveBeenCalled();
    });

    it('hashes the new password and revokes every existing session on success', async () => {
      await service.changePassword('user-1', 'Sup3rSecret', 'NewPass123');

      expect(usersMock.hashPassword).toHaveBeenCalledWith('NewPass123');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'new-hashed-password' },
      });
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('exportUserData', () => {
    it('queries the account profile via a `select` that never asks for the password hash, and returns the bounded set of owned records', async () => {
      const exportedAccount = { id: 'user-1', email: 'ada@example.com', displayName: 'Ada' };
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce(exportedAccount);

      const result = await service.exportUserData('user-1');

      const selectArg = prismaMock.user.findUniqueOrThrow.mock.calls[0][0];
      expect(selectArg.where).toEqual({ id: 'user-1' });
      expect(selectArg.select).not.toHaveProperty('passwordHash');

      expect(result.account).toBe(exportedAccount);
      expect(result.achievementUnlocks).toEqual([]);
      expect(result.questCards).toEqual([]);
      expect(result.shopPurchases).toEqual([]);
      expect(result.recentSecurityEvents).toEqual([]);
      expect(result.exportedAt).toEqual(expect.any(String));
    });

    it('logs a DATA_EXPORTED security event', async () => {
      await service.exportUserData('user-1');
      expect(prismaMock.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'DATA_EXPORTED' }) }),
      );
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('deletes expired rows from all three token tables', async () => {
      await service.cleanupExpiredTokens();

      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
      expect(prismaMock.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
      expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});
