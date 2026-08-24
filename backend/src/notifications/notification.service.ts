import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushProvider } from './push.provider';
import { isWithinQuietHours } from '../common/timezone';

type Db = PrismaService | Prisma.TransactionClient;

type PreferenceCategory =
  'dailyQuestsEnabled' | 'learningRemindersEnabled' | 'progressEnabled' | 'competitionEnabled';

const CATEGORY_BY_TYPE: Record<NotificationType, PreferenceCategory> = {
  MORNING_QUEST: 'dailyQuestsEnabled',
  AFTERNOON_QUEST: 'dailyQuestsEnabled',
  EVENING_QUEST: 'dailyQuestsEnabled',
  REVIEW_REMINDER: 'learningRemindersEnabled',
  FORGETTING_CURVE_REMINDER: 'learningRemindersEnabled',
  WEAK_SKILL_REMINDER: 'learningRemindersEnabled',
  LEVEL_UP: 'progressEnabled',
  JOURNEY_UNLOCK: 'progressEnabled',
  ACHIEVEMENT_UNLOCK: 'progressEnabled',
  CEFR_UNLOCK: 'progressEnabled',
  BOSS_BATTLE_REMINDER: 'competitionEnabled',
  BOSS_BATTLE_RESULT: 'competitionEnabled',
  LEADERBOARD_UPDATE: 'competitionEnabled',
};

const DEFAULT_PREFERENCE = {
  dailyQuestsEnabled: true,
  learningRemindersEnabled: true,
  progressEnabled: true,
  competitionEnabled: true,
  quietHoursStartHour: null as number | null,
  quietHoursEndHour: null as number | null,
};

export interface NotifyOptions {
  deepLink?: string;
  data?: Record<string, unknown>;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink: string | null;
  data: unknown;
  readAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface NotificationPreferenceView {
  dailyQuestsEnabled: boolean;
  learningRemindersEnabled: boolean;
  progressEnabled: boolean;
  competitionEnabled: boolean;
  quietHoursStartHour: number | null;
  quietHoursEndHour: number | null;
}

/**
 * The Notification Engine (V1 Remaining Systems Spec §15/§19) — every
 * notification is written to the in-app inbox first, then optionally
 * pushed via Expo (see push.provider.ts), gated by the player's category
 * preferences and player-local quiet hours (never the device clock —
 * same Player Timezone System every other local-time computation in this
 * codebase uses).
 *
 * `notify` is the one entry point every other module's event triggers
 * call (ProgressionService on level-up/journey/CEFR, AchievementService
 * on unlock, Boss Battle on results, a future reminder scheduler) —
 * matches the AliService.reactFireAndForget / SecurityEvent pattern
 * already established elsewhere: the write itself can join a caller's
 * transaction via `db`, but the push dispatch that follows is always
 * fire-and-forget and never allowed to fail the caller's flow.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: ExpoPushProvider,
  ) {}

  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    opts: NotifyOptions = {},
    db: Db = this.prisma,
  ): Promise<void> {
    const notification = await db.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        deepLink: opts.deepLink,
        data: (opts.data as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // Push dispatch reads its own gating state fresh from the real
    // PrismaService (not `db`) and never blocks the caller — a
    // transaction the caller is mid-way through must not wait on an
    // external HTTP call, and must not roll back if that call fails.
    this.dispatchPushFireAndForget(
      userId,
      notification.id,
      type,
      title,
      body,
      opts.data,
      opts.deepLink,
    );
  }

  /** Convenience for call sites with no transaction to join — identical to `notify` with the default `db`. */
  notifyFireAndForget(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    opts: NotifyOptions = {},
  ): void {
    this.notify(userId, type, title, body, opts).catch((err) => {
      this.logger.warn(`notify() failed for user ${userId}, type ${type}: ${err}`);
    });
  }

  async listForUser(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<NotificationView[]> {
    return this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 50, 100),
    });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async getPreferences(userId: string): Promise<NotificationPreferenceView> {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return pref ?? DEFAULT_PREFERENCE;
  }

  async updatePreferences(
    userId: string,
    patch: Partial<NotificationPreferenceView>,
  ): Promise<NotificationPreferenceView> {
    const updated = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCE, ...patch },
      update: patch,
    });
    return updated;
  }

  async registerPushToken(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });
  }

  async unregisterPushToken(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
  }

  private async dispatchPushFireAndForget(
    userId: string,
    notificationId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    deepLink?: string,
  ): Promise<void> {
    try {
      const [user, pref, tokens] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
        this.prisma.notificationPreference.findUnique({ where: { userId } }),
        this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } }),
      ]);

      if (tokens.length === 0) return;

      const category = CATEGORY_BY_TYPE[type];
      const categoryEnabled = pref ? pref[category] : DEFAULT_PREFERENCE[category];
      if (!categoryEnabled) return;

      const quiet = isWithinQuietHours(
        user?.timezone ?? null,
        pref?.quietHoursStartHour ?? null,
        pref?.quietHoursEndHour ?? null,
      );
      if (quiet) return;

      // The DB row already has deepLink as its own column (listForUser
      // reads it from there for the in-app inbox) — merging it into the
      // *push* payload's `data` here is what lets a tapped push actually
      // navigate somewhere, since Expo only ever hands the client `data`,
      // never the notification row itself (Correction & Completion Spec
      // §6: "push deep linking").
      const pushData = deepLink ? { ...data, deepLink } : data;
      await this.push.send(
        tokens.map((t: { token: string }) => ({ to: t.token, title, body, data: pushData })),
      );
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { sentAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(`Push dispatch failed for notification ${notificationId}: ${err}`);
    }
  }
}
