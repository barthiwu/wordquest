import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { Prisma, SecurityEventType } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { EmailService } from '../email/email.service';
import { gameplayRules } from '../config/gameplay-rules';
import { calculateAge, isValidPastDate } from '../common/age';
import { AnalyticsService } from '../analytics/analytics.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/** IP/user-agent for the security-event audit log — always optional, never required to authenticate. */
export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: {
    id: string;
    email: string;
    displayName: string;
    username: string;
    countryCode: string | null;
    avatarUrl: string | null;
  };
}

const VERIFICATION_TOKEN_TTL = '24h';
// Shorter-lived than email verification — a password reset link grants
// account access, a materially more sensitive action.
const PASSWORD_RESET_TOKEN_TTL = '1h';

/**
 * Registration, login, refresh-token rotation with reuse detection,
 * email verification, password reset, and account status (suspend/
 * soft-delete/recover) — the full production auth surface (V1 Final
 * Systems Spec).
 *
 * Refresh tokens are signed JWTs (so they self-verify + self-expire) but
 * are ALSO recorded server-side as a sha256 hash in `refresh_tokens`, so a
 * single token can be revoked (logout, rotation, compromise) without
 * waiting out its natural expiry — a bare stateless JWT can't do that.
 *
 * Email verification and password reset tokens follow the same
 * hash-not-plaintext storage pattern — only the raw token is ever
 * emailed, never persisted.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly email: EmailService,
    private readonly analytics: AnalyticsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const dateOfBirth = new Date(`${dto.dateOfBirth}T00:00:00Z`);
    if (!isValidPastDate(dateOfBirth)) {
      throw new BadRequestException('dateOfBirth must be a valid date in the past');
    }

    // Age gate (COPPA) — rejected before the account is ever created,
    // not created-then-blocked, so an under-13 signup leaves no row
    // behind to clean up or accidentally leak through a partial flow.
    const { minimumAgeYears } = gameplayRules.auth;
    if (calculateAge(dateOfBirth) < minimumAgeYears) {
      throw new BadRequestException(
        `You must be at least ${minimumAgeYears} years old to create a WordQuest account.`,
      );
    }

    const user = await this.users.create({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      countryCode: dto.countryCode,
      dateOfBirth,
    });

    // Fire-and-forget, same reasoning as ALI's reactFireAndForget — a
    // slow or failed email send must never block registration itself.
    this.sendVerificationEmail(user.id).catch(() => undefined);
    this.analytics.track(user.id, 'account_created', { countryCode: user.countryCode });

    const tokens = await this.issueTokens(user.id);
    return { ...tokens, user: await this.toPublicUser(user) };
  }

  async login(dto: LoginDto, meta: RequestMeta = {}): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);

    // Locked accounts fail the SAME generic message as a wrong
    // password, below — checked before verifyPassword (which is
    // itself the expensive bcrypt.compare step) so a lockout also
    // short-circuits that cost, but the response is indistinguishable
    // from "wrong password" to preserve the existing enumeration
    // resistance (a distinct "account locked" message would confirm
    // the email is registered).
    const isLocked = !!user?.lockedUntil && user.lockedUntil > new Date();
    const passwordValid =
      user && !isLocked ? await this.users.verifyPassword(dto.password, user.passwordHash) : false;

    if (!user || !passwordValid || user.status === 'DELETED') {
      if (user) {
        this.logSecurityEvent(user.id, isLocked ? 'LOGIN_BLOCKED_LOCKED' : 'LOGIN_FAILED', meta);
        if (!isLocked) await this.registerFailedLogin(user.id);
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'SUSPENDED') {
      this.logSecurityEvent(user.id, 'LOGIN_FAILED', meta);
      throw new UnauthorizedException('This account has been suspended.');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const tokens = await this.issueTokens(user.id);
    this.logSecurityEvent(user.id, 'LOGIN_SUCCESS', meta);
    return { ...tokens, user: await this.toPublicUser(user) };
  }

  /** Account lockout (Sprint 5 "Authentication hardening") — see User.failedLoginAttempts/lockedUntil and gameplayRules.auth. */
  private async registerFailedLogin(userId: string): Promise<void> {
    const { maxFailedLoginAttempts, lockoutDurationMinutes } = gameplayRules.auth;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (updated.failedLoginAttempts >= maxFailedLoginAttempts) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + lockoutDurationMinutes * 60_000) },
      });
    }
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(rawRefreshToken, {
        secret: this.config.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.revokedAt) {
      // Reuse detected — this exact (rotated-out, single-use) token is
      // being presented again. That can only mean it leaked and either
      // the thief or the legitimate owner is now racing the other's
      // rotated copy. Assume compromise: kill every active session for
      // this user, not just this one token, and force a fresh login.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logSecurityEvent(stored.userId, 'REFRESH_TOKEN_REUSE_DETECTED');
      throw new UnauthorizedException(
        'Refresh token reuse detected — all sessions have been revoked. Please log in again.',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Absolute session lifetime (V20 Beta Release Checklist §12): checked
    // against sessionStartedAt — the ORIGINAL login this rotation chain
    // traces back to — not this token's own createdAt/expiresAt, which
    // reset on every rotation and would otherwise let the session renew
    // itself forever. Revokes the whole chain and forces a real login,
    // the same response shape as reuse detection above.
    const maxAgeMs = gameplayRules.auth.absoluteSessionLifetimeDays * 24 * 60 * 60 * 1000;
    if (Date.now() - stored.sessionStartedAt.getTime() > maxAgeMs) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logSecurityEvent(stored.userId, 'SESSION_LIFETIME_EXCEEDED');
      throw new UnauthorizedException('Session has expired. Please log in again.');
    }

    // Rotate: the presented token is single-use.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(payload.sub, stored.sessionStartedAt);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Also called fire-and-forget from register() — safe to call again later for a "resend verification" action, since it's just another token grant, not tied to registration specifically. */
  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return; // already verified — quietly a no-op, not an error

    // Account recovery hardening: a still-valid earlier link becomes
    // dead the moment a new one is issued, so an old email sitting in
    // an inbox (or intercepted in transit) can't be replayed once the
    // player has moved on to a fresher one.
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        expiresAt: this.expiryDateFromNow(VERIFICATION_TOKEN_TTL),
      },
    });

    await this.email.sendVerificationEmail(user.email, rawToken);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification link');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.emailVerificationToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: new Date() } });
    });
    this.logSecurityEvent(stored.userId, 'EMAIL_VERIFIED');
  }

  /** Always resolves the same way regardless of whether the email exists — same "don't leak which emails are registered" principle as login(). */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.status === 'DELETED') return;

    // Same reasoning as sendVerificationEmail — an earlier reset link
    // is more sensitive than a verification link (it grants account
    // access), so invalidating it on a fresh request matters more here.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: this.expiryDateFromNow(PASSWORD_RESET_TOKEN_TTL),
      },
    });

    await this.email.sendPasswordResetEmail(user.email, rawToken);
    this.logSecurityEvent(user.id, 'PASSWORD_RESET_REQUESTED');
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }

    const passwordHash = await this.users.hashPassword(newPassword);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
      // Standard security practice: a password reset invalidates every
      // existing session, not just the device that requested it — if
      // the reset was prompted by a compromised password, a still-live
      // session elsewhere could otherwise outlive the fix.
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    this.logSecurityEvent(stored.userId, 'PASSWORD_CHANGED');
  }

  /**
   * The authenticated counterpart to resetPassword() — proves account
   * ownership via the CURRENT password rather than an emailed token.
   * Same "revoke every existing session" follow-through as a token-based
   * reset: if this change was prompted by a suspected compromise, a
   * still-live session on another device shouldn't outlive it.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const currentValid = await this.users.verifyPassword(currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await this.users.hashPassword(newPassword);
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    this.logSecurityEvent(userId, 'PASSWORD_CHANGED');
  }

  /**
   * Privacy controls (Sprint 5) — a bounded "download my data" export
   * of the account-owned records a player would reasonably expect to
   * see, not a literal dump of every table this user's id ever touched
   * (e.g. per-word Mastery rows and the full XpTransaction ledger are
   * summarized via `progression` rather than enumerated line by line).
   * Never includes passwordHash or raw token hashes.
   */
  async exportUserData(userId: string) {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        countryCode: true,
        timezone: true,
        nativeLanguage: true,
        targetLanguage: true,
        learningGoal: true,
        onboardingCompletedAt: true,
        emailVerifiedAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        clanId: true,
        progression: true,
        learningProfile: true,
        notificationPreference: true,
      },
    });

    const [achievementUnlocks, questCards, shopPurchases, recentSecurityEvents] = await Promise.all(
      [
        this.prisma.achievementUnlock.findMany({
          where: { userId },
          orderBy: { unlockedAt: 'asc' },
        }),
        this.prisma.questCard.findMany({ where: { userId }, orderBy: { earnedAt: 'asc' } }),
        this.prisma.shopPurchase.findMany({
          where: { userId },
          orderBy: { purchasedAt: 'asc' },
          include: { item: { select: { name: true, category: true } } },
        }),
        this.prisma.securityEvent.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ],
    );

    this.logSecurityEvent(userId, 'DATA_EXPORTED');
    return {
      exportedAt: new Date().toISOString(),
      account,
      achievementUnlocks,
      questCards,
      shopPurchases,
      recentSecurityEvents,
    };
  }

  /**
   * Token security hygiene (Sprint 5) — reclaims rows that can never be
   * read again: RefreshToken/EmailVerificationToken/PasswordResetToken
   * are only ever looked up by their (unique) hash before their
   * expiresAt, so anything already past expiry is dead weight. Same
   * @Cron pattern as BossBattleService.autoFinalize.
   */
  @Cron(gameplayRules.auth.tokenCleanupCronExpression)
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();
    await Promise.all([
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
  }

  /** Soft delete — the row and its data are preserved so recoverAccount() has something to restore, not a hard purge. */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'DELETED', deletedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    this.logSecurityEvent(userId, 'ACCOUNT_DELETED');
  }

  /** Account recovery: the same credentials that worked before deletion restore access — this is not a password-reset-strength flow, since it requires knowing the password, not just the email. */
  async recoverAccount(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const passwordValid = user
      ? await this.users.verifyPassword(dto.password, user.passwordHash)
      : false;

    if (!user || !passwordValid || user.status !== 'DELETED') {
      throw new UnauthorizedException(
        'Invalid email or password, or this account is not eligible for recovery.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'ACTIVE', deletedAt: null },
    });

    const tokens = await this.issueTokens(user.id);
    this.logSecurityEvent(user.id, 'ACCOUNT_RECOVERED');
    return { ...tokens, user: await this.toPublicUser(user) };
  }

  /**
   * Fire-and-forget audit log write (V1 Remaining Systems Spec §14) — a
   * failed/slow write here must never break the auth flow it's recording,
   * same reasoning as AliService.reactFireAndForget. `meta` (IP/user
   * agent) is best-effort context, never required.
   */
  private logSecurityEvent(userId: string, type: SecurityEventType, meta: RequestMeta = {}): void {
    this.prisma.securityEvent
      .create({
        data: { userId, type, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
      })
      .catch(() => undefined);
  }

  /**
   * `sessionStartedAt` is omitted for a brand-new session (login/register
   * — defaults to now) and passed through UNCHANGED by `refresh()` when
   * rotating an existing session's token, so the absolute-lifetime check
   * there always measures against when the session actually began, not
   * when this particular rotated token was issued.
   */
  private async issueTokens(userId: string, sessionStartedAt?: Date): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: this.config.jwtAccessSecret, expiresIn: this.config.jwtAccessExpiresIn },
    );

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti },
      { secret: this.config.jwtRefreshSecret, expiresIn: this.config.jwtRefreshExpiresIn },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.expiryDateFromNow(this.config.jwtRefreshExpiresIn),
        sessionStartedAt: sessionStartedAt ?? new Date(),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Parses simple "15m" / "30d" / "1h" style durations used in .env. */
  private expiryDateFromNow(duration: string): Date {
    const match = /^(\d+)([smhd])$/.exec(duration.trim());
    const value = match ? parseInt(match[1], 10) : 30;
    const unit = match ? match[2] : 'd';
    const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000;
    return new Date(Date.now() + value * unitMs);
  }

  /**
   * Resolves avatarUrl here (not left for a later getMe() call) so
   * register/login/recoverAccount's own response already carries the
   * player's real avatar -- Barth, Sept 2026: Home's header showed only
   * initials right after login because AuthUser never carried avatarUrl
   * at all, and the app only re-fetches it via getMe() on a fresh cold
   * start (authStore.hydrate), not after every login. A returning
   * player with an avatar already set would see initials until their
   * next full app relaunch without this.
   */
  private async toPublicUser(user: {
    id: string;
    email: string;
    displayName: string;
    username: string;
    countryCode: string | null;
    avatarKey: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      countryCode: user.countryCode,
      avatarUrl: await this.users.resolveAvatarUrl(user.avatarKey),
    };
  }
}
