import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/email/email.service';

/**
 * Exercises the real register → login → /users/me flow against a real
 * Postgres instance (see docker-compose.yml / CI's postgres service).
 * Skipped automatically if DATABASE_URL isn't set so `npm test` still
 * works without infra running — only `npm run test:e2e` needs the DB up.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-${Date.now()}@wordquest.test`;
  const recoveryEmail = `e2e-recovery-${Date.now()}@wordquest.test`;

  // Verification/reset links carry a raw token that AuthService only ever
  // stores hashed (tokenHash — see AuthService.hashToken) — by design, the
  // raw value is never readable back out of the database or exposed by any
  // API response, only mailed to the player. EmailService is the one seam
  // that sees the raw token, so it's the one seam this suite can intercept
  // it at, the same way a real inbox would receive it.
  const emailServiceMock = {
    isConfigured: () => true,
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(emailServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [testEmail, recoveryEmail] } } });
    await app.close();
  });

  it('registers a new player and returns tokens + profile', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'E2E Player' })
      .expect(201);

    expect(res.body.user.email).toBe(testEmail);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a duplicate registration', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: 'Sup3rSecret', displayName: 'E2E Player' })
      .expect(409);
  });

  it('logs in and can call the protected /users/me route with the access token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'Sup3rSecret' })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body.email).toBe(testEmail);
  });

  it('rejects /users/me with no token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  /**
   * V19 Stabilization Pass §11 (Authentication Final Review): the full
   * account-recovery chain — register -> verify email -> forget password
   * -> reset password -> log in with the new password — exercised against
   * the real DB/hashing/expiry logic end to end, not just each endpoint in
   * isolation. Raw tokens are captured off the mocked EmailService (see
   * emailServiceMock above) since AuthService only ever persists their
   * sha256 hash — this is the one seam a test can observe them at without
   * reaching into internals no real client has access to either.
   */
  describe('account recovery chain (register -> verify -> forgot password -> reset -> login)', () => {
    let accessToken: string;

    it('registers the recovery-flow player', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: recoveryEmail, password: 'Sup3rSecret', displayName: 'Recovery Player' })
        .expect(201);

      accessToken = res.body.accessToken;
      expect(typeof accessToken).toBe('string');

      // register() sends a verification email fire-and-forget — not
      // awaited by the response, but it's a background call to the SAME
      // mocked EmailService the rest of this chain reads from, so nothing
      // downstream should assume this is the only/last call recorded yet.
      const user = await prisma.user.findUniqueOrThrow({ where: { email: recoveryEmail } });
      expect(user.emailVerifiedAt).toBeNull();
    });

    it('verifies the email using the token from the (mocked) verification email', async () => {
      // resend-verification is awaited by its controller before responding
      // 204, so by the time this request resolves, sendVerificationEmail
      // has definitely been called at least once more for this user.
      await request(app.getHttpServer())
        .post('/api/v1/auth/resend-verification')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const calls = emailServiceMock.sendVerificationEmail.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe(recoveryEmail);
      const rawVerificationToken = lastCall[1] as string;
      expect(typeof rawVerificationToken).toBe('string');

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: rawVerificationToken })
        .expect(204);

      const user = await prisma.user.findUniqueOrThrow({ where: { email: recoveryEmail } });
      expect(user.emailVerifiedAt).not.toBeNull();
    });

    it('rejects reusing the same verification token a second time', async () => {
      const rawVerificationToken = emailServiceMock.sendVerificationEmail.mock.calls.at(-1)![1];

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: rawVerificationToken })
        .expect(401);
    });

    it('requests a password reset and gets a working reset token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/request-password-reset')
        .send({ email: recoveryEmail })
        .expect(204);

      const calls = emailServiceMock.sendPasswordResetEmail.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const [to, rawResetToken] = calls[calls.length - 1];
      expect(to).toBe(recoveryEmail);
      expect(typeof rawResetToken).toBe('string');
    });

    it('always resolves the same way for an unregistered email — no "does this account exist" leak', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/request-password-reset')
        .send({ email: `nobody-${Date.now()}@wordquest.test` })
        .expect(204);
    });

    it('resets the password with the reset token, and the new password logs in', async () => {
      const rawResetToken = emailServiceMock.sendPasswordResetEmail.mock.calls.at(-1)![1];

      // The refresh token minted at registration should not survive a
      // password reset — resetPassword revokes every live session so a
      // compromised-password reset can't be outlived by an already-open one.
      const { refreshToken: preResetRefreshToken } = (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: recoveryEmail, password: 'Sup3rSecret' })
          .expect(200)
      ).body;

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: rawResetToken, newPassword: 'NewSup3rSecret' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: recoveryEmail, password: 'Sup3rSecret' })
        .expect(401); // old password no longer works

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: recoveryEmail, password: 'NewSup3rSecret' })
        .expect(200);
      expect(typeof login.body.accessToken).toBe('string');

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: preResetRefreshToken })
        .expect(401); // revoked by the reset, not just superseded
    });

    it('rejects reusing the same reset token a second time', async () => {
      const rawResetToken = emailServiceMock.sendPasswordResetEmail.mock.calls.at(-1)![1];

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: rawResetToken, newPassword: 'AnotherSecret9' })
        .expect(401);
    });
  });
});
