import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Self-hosted usage analytics (Sept 2026 request — see
 * docs/PRIVACY_POLICY.md's "Analytics" section: events go to our own
 * database, never a third-party analytics vendor). A handful of core
 * lifecycle events are wired up from the services that already know
 * they happened: AuthService.register, QuestsService.completeWord,
 * BossBattleService.joinBattle, ShopService.purchase.
 *
 * Fire-and-forget by design, same shape as AliService.reactFireAndForget
 * — track() is called, never awaited, and a DB hiccup here must never
 * fail or slow down the caller's real request.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  track(userId: string | null, eventName: string, properties?: Record<string, unknown>): void {
    this.prisma.analyticsEvent
      .create({
        data: { userId, eventName, properties: (properties ?? {}) as Prisma.InputJsonValue },
      })
      .catch(() => {
        // Intentionally silent — see the class doc comment.
      });
  }
}
