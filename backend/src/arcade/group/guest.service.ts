import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { ARCADE_GROUP_CONFIG } from '../config/arcade.config';
import { ArcadeGroupService, type GroupView } from './group.service';
import { guestHandleBase, guestHandleCandidate } from './guest.util';

export const GUEST_EMAIL_DOMAIN = 'guest.wordquest.invalid';

/**
 * Join a group link without an account.
 *
 * Group Play is for anyone (a WhatsApp game night, a family, a club, a class),
 * so nobody is forced to register just to play one round. A guest is a real
 * user row flagged `isGuest`: group scores, sessions and tokens work as they do
 * for everyone, but the account has a placeholder email and an unusable
 * password, is confined to group play by JwtAuthGuard, stays off leaderboards
 * and friend search, and is deleted after GUEST_RETENTION_DAYS. If they like
 * it, AuthService.upgradeGuest turns the same row into a real account.
 */
@Injectable()
export class ArcadeGuestService {
  private readonly logger = new Logger(ArcadeGuestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: ArcadeGroupService,
    private readonly auth: AuthService,
  ) {}

  async join(code: string, nickname: string) {
    // Look the group up first so a bad or full link never leaves a stray guest behind.
    const preview = await this.groups.preview(code);
    if (preview.full) {
      throw new ConflictException(`This group is full (${preview.maxMembers} players).`);
    }

    const guest = await this.createGuest(nickname);
    let group: GroupView;
    try {
      group = await this.groups.join(guest.id, code);
    } catch (err) {
      await this.prisma.user.delete({ where: { id: guest.id } }).catch(() => undefined);
      throw err;
    }
    const session = await this.auth.startGuestSession(guest);
    return { ...session, group };
  }

  private async createGuest(nickname: string) {
    const base = guestHandleBase(nickname);
    for (let attempt = 0; attempt < 12; attempt++) {
      const username = guestHandleCandidate(base, attempt, Math.random);
      try {
        return await this.prisma.user.create({
          data: {
            isGuest: true,
            email: `guest-${randomUUID()}@${GUEST_EMAIL_DOMAIN}`,
            // Not a bcrypt hash, so nothing can ever match it: a guest cannot sign in again.
            passwordHash: `!guest!${randomBytes(24).toString('hex')}`,
            displayName: nickname,
            username,
            progression: { create: {} },
            learningProfile: { create: {} },
          },
        });
      } catch (err) {
        const taken = err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2002';
        if (!taken) throw err;
      }
    }
    throw new ConflictException('Could not pick a name. Please try a different one.');
  }

  /** Housekeeping: guests nobody upgraded are removed along with everything they own. */
  @Cron('41 3 * * *')
  async purgeStale(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - ARCADE_GROUP_CONFIG.GUEST_RETENTION_DAYS * 86_400_000);
      const stale = await this.prisma.user.findMany({
        where: { isGuest: true, createdAt: { lt: cutoff } },
        select: { id: true },
        take: 500,
      });
      let removed = 0;
      for (const { id } of stale) {
        try {
          await this.prisma.user.delete({ where: { id } });
          removed++;
        } catch (err) {
          this.logger.warn(`Could not delete guest ${id}: ${err}`);
        }
      }
      if (removed) this.logger.log(`Removed ${removed} stale guest(s)`);
    } catch (err) {
      this.logger.warn(`Guest purge failed: ${err}`);
    }
  }
}
