import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService, type AuthResult, type TwoFactorChallenge } from './auth.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { SocialVerifierService } from './social/social-verifier.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { EmailService } from '../email/email.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('AuthService — two-step verification & social sign-in', () => {
  let service: AuthService;

  const baseUser = {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: 'hashed',
    displayName: 'Ada',
    username: 'ada1',
    countryCode: 'NG',
    status: 'ACTIVE',
    emailVerifiedAt: null as Date | null,
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
    avatarKey: null,
    twoFactorEnabledAt: null as Date | null,
  };

  const users = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    verifyPassword: jest.fn(),
    hashPassword: jest.fn().mockResolvedValue('hashed-throwaway'),
    resolveAvatarUrl: jest.fn().mockResolvedValue(null),
  };
  const prisma = {
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    twoFactorRecoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    user: { update: jest.fn().mockResolvedValue({ failedLoginAttempts: 1 }) },
    authIdentity: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}) },
    securityEvent: { create: jest.fn().mockResolvedValue({}) },
    emailVerificationToken: { updateMany: jest.fn(), create: jest.fn() },
  };
  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const config = {
    jwtAccessSecret: 'access',
    jwtAccessExpiresIn: '15m',
    jwtRefreshSecret: 'refresh',
    jwtRefreshExpiresIn: '30d',
  };
  const twoFactor = { checkCode: jest.fn() };
  const social = { verify: jest.fn(), availability: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwt.signAsync.mockResolvedValue('signed.jwt');
    users.verifyPassword.mockResolvedValue(true);
    users.resolveAvatarUrl.mockResolvedValue(null);
    users.hashPassword.mockResolvedValue('hashed-throwaway');
    prisma.user.update.mockResolvedValue({ failedLoginAttempts: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AppConfigService, useValue: config },
        { provide: EmailService, useValue: { sendVerificationEmail: jest.fn() } },
        { provide: AnalyticsService, useValue: { track: jest.fn() } },
        { provide: TwoFactorService, useValue: twoFactor },
        { provide: SocialVerifierService, useValue: social },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('password login with 2FA', () => {
    const user2fa = { ...baseUser, twoFactorEnabledAt: new Date() };

    it('returns a challenge (and no tokens) when 2FA is on, signed with a derived secret', async () => {
      users.findByEmail.mockResolvedValue(user2fa);
      const result = (await service.login({ email: user2fa.email, password: 'x' })) as TwoFactorChallenge;
      expect(result.twoFactorRequired).toBe(true);
      expect(result.challengeToken).toBe('signed.jwt');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', purpose: '2fa' },
        expect.objectContaining({ secret: 'access:2fa-challenge', expiresIn: '5m' }),
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('does not clear the failure counter after the password alone when 2FA is on', async () => {
      users.findByEmail.mockResolvedValue({ ...user2fa, failedLoginAttempts: 4 });
      await service.login({ email: user2fa.email, password: 'x' });
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { failedLoginAttempts: 0, lockedUntil: null } }),
      );
    });

    it('completes the login with a valid code', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: '2fa' });
      users.findById.mockResolvedValue(user2fa);
      twoFactor.checkCode.mockResolvedValue(true);
      const result = (await service.completeTwoFactorLogin('chal', '123456')) as AuthResult;
      expect(result.accessToken).toBe('signed.jwt');
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('rejects a wrong code and counts it toward the lockout', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: '2fa' });
      users.findById.mockResolvedValue(user2fa);
      twoFactor.checkCode.mockResolvedValue(false);
      await expect(service.completeTwoFactorLogin('chal', '000000')).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { failedLoginAttempts: { increment: 1 } } }),
      );
    });

    it('rejects an expired/invalid challenge and a token without the 2fa purpose', async () => {
      jwt.verifyAsync.mockRejectedValueOnce(new Error('expired'));
      await expect(service.completeTwoFactorLogin('bad', '123456')).rejects.toThrow(UnauthorizedException);
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-1' });
      await expect(service.completeTwoFactorLogin('access-token', '123456')).rejects.toThrow(UnauthorizedException);
      expect(twoFactor.checkCode).not.toHaveBeenCalled();
    });

    it('recoverAccount() demands the second factor for a 2FA account', async () => {
      users.findByEmail.mockResolvedValue({ ...user2fa, status: 'DELETED' });
      await expect(service.recoverAccount({ email: user2fa.email, password: 'x' })).rejects.toThrow(UnauthorizedException);
      twoFactor.checkCode.mockResolvedValue(true);
      const ok = await service.recoverAccount({ email: user2fa.email, password: 'x', twoFactorCode: '123456' });
      expect(ok.accessToken).toBe('signed.jwt');
    });
  });

  describe('socialLogin', () => {
    const profile = {
      provider: 'GOOGLE' as const,
      subject: 'g-123',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
    };

    it('signs in a known identity', async () => {
      social.verify.mockResolvedValue(profile);
      prisma.authIdentity.findUnique.mockResolvedValue({ userId: 'user-1' });
      users.findById.mockResolvedValue(baseUser);
      const result = (await service.socialLogin({ provider: 'GOOGLE', credential: 'tok' })) as AuthResult;
      expect(result.accessToken).toBe('signed.jwt');
      expect(users.create).not.toHaveBeenCalled();
    });

    it('links a provider-verified email to the existing account', async () => {
      social.verify.mockResolvedValue(profile);
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(baseUser);
      const result = (await service.socialLogin({ provider: 'GOOGLE', credential: 'tok' })) as AuthResult;
      expect(result.accessToken).toBe('signed.jwt');
      expect(prisma.authIdentity.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', provider: 'GOOGLE', providerSubject: 'g-123', email: 'ada@example.com' },
      });
    });

    it('when the existing account never verified its email, the proven owner takes it over clean', async () => {
      social.verify.mockResolvedValue(profile);
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue({ ...baseUser, emailVerifiedAt: null, twoFactorEnabledAt: new Date() });
      users.findById.mockResolvedValue({ ...baseUser, emailVerifiedAt: new Date(), twoFactorEnabledAt: null });

      const result = (await service.socialLogin({ provider: 'GOOGLE', credential: 'tok' })) as AuthResult;

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          passwordHash: 'hashed-throwaway',
          twoFactorEnabledAt: null,
          twoFactorSecretEnc: null,
        }),
      });
      expect(prisma.twoFactorRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
      );
      // The squatter's 2FA no longer stands between the owner and the account.
      expect(result.accessToken).toBe('signed.jwt');
    });

    it('leaves an already-verified account alone when linking', async () => {
      social.verify.mockResolvedValue(profile);
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue({ ...baseUser, emailVerifiedAt: new Date() });
      await service.socialLogin({ provider: 'GOOGLE', credential: 'tok' });
      expect(users.hashPassword).not.toHaveBeenCalled();
      expect(prisma.twoFactorRecoveryCode.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses to link an UNVERIFIED provider email to an existing account', async () => {
      social.verify.mockResolvedValue({ ...profile, emailVerified: false });
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(baseUser);
      await expect(service.socialLogin({ provider: 'GOOGLE', credential: 'tok' })).rejects.toThrow(UnauthorizedException);
      expect(prisma.authIdentity.create).not.toHaveBeenCalled();
    });

    it('asks for a date of birth before creating a new account', async () => {
      social.verify.mockResolvedValue(profile);
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      await expect(service.socialLogin({ provider: 'GOOGLE', credential: 'tok' })).rejects.toMatchObject({
        response: { code: 'DOB_REQUIRED' },
      });
      expect(users.create).not.toHaveBeenCalled();
    });

    it('enforces the age gate for new social accounts', async () => {
      social.verify.mockResolvedValue(profile);
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      const year = new Date().getUTCFullYear() - 8;
      await expect(
        service.socialLogin({ provider: 'GOOGLE', credential: 'tok', dateOfBirth: `${year}-01-01` }),
      ).rejects.toThrow(BadRequestException);
      expect(users.create).not.toHaveBeenCalled();
    });

    it('creates, links and verifies a brand-new account', async () => {
      social.verify.mockResolvedValue(profile);
      prisma.authIdentity.findUnique.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue({ ...baseUser, id: 'new-1' });
      const result = (await service.socialLogin({
        provider: 'GOOGLE',
        credential: 'tok',
        dateOfBirth: '1995-05-05',
      })) as AuthResult;
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ada@example.com', displayName: 'Ada Lovelace' }),
      );
      expect(prisma.authIdentity.create).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'new-1' }, data: { emailVerifiedAt: expect.any(Date) } }),
      );
      expect(result.accessToken).toBe('signed.jwt');
    });

    it('applies the 2FA challenge to social sign-ins too', async () => {
      social.verify.mockResolvedValue(profile);
      prisma.authIdentity.findUnique.mockResolvedValue({ userId: 'user-1' });
      users.findById.mockResolvedValue({ ...baseUser, twoFactorEnabledAt: new Date() });
      const result = (await service.socialLogin({ provider: 'GOOGLE', credential: 'tok' })) as TwoFactorChallenge;
      expect(result.twoFactorRequired).toBe(true);
    });
  });
});
