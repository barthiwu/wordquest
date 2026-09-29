import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { gameplayRules } from '../../config/gameplay-rules';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * Verification blocking (V1 Remaining Systems Spec §14), implemented as a
 * grace period rather than an immediate hard lock: a brand-new account has
 * full access for `auth.emailVerificationGraceDays` days after signup,
 * then gameplay-affecting endpoints require emailVerifiedAt to be set.
 *
 * Applied only to controllers that grant progress/rewards (Quests, Boss
 * Battle, Master Challenge, Word in the Wild, Achievement-triggering
 * actions) — always combined with JwtAuthGuard, never in place of it, and
 * never applied to auth/profile/settings/resend-verification themselves,
 * so a lapsed-grace user is never fully locked out of the app, only out
 * of earning further progress.
 *
 * Enforcement itself is gated on `AppConfigService.isEmailConfigured`
 * (2026-09-29): while no email provider is configured (no EMAIL_API_KEY /
 * EMAIL_FROM_ADDRESS set), verification emails can never actually be
 * delivered, so a real player would hit the grace-period wall with no way
 * to ever clear it — they'd never have received a link to click. Skipping
 * enforcement in that state means nobody gets stuck; the moment those two
 * variables are set (see email.service.ts / config.service.ts), this
 * guard starts enforcing the grace period automatically, no further code
 * change required.
 */
@Injectable()
export class EmailVerificationGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.isEmailConfigured) return true; // see class doc comment above

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.userId;
    if (!userId) return true; // JwtAuthGuard runs first in practice; nothing to check without it

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true, createdAt: true },
    });
    if (!user || user.emailVerifiedAt) return true;

    const graceMs = gameplayRules.auth.emailVerificationGraceDays * 24 * 60 * 60 * 1000;
    const graceExpiresAt = new Date(user.createdAt.getTime() + graceMs);
    if (new Date() < graceExpiresAt) return true;

    throw new ForbiddenException(
      'Please verify your email to keep earning progress — check your inbox or request a new link.',
    );
  }
}
