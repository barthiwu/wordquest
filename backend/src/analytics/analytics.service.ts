import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isKnownAnalyticsEventName } from './event-names';

/** Optional extra fields for a single server-authored track() call —
 * almost always omitted; server-side call sites rarely have a
 * sessionId/screen to report. Exists mainly so DUEL_LOCK_IN /
 * DUEL_ANSWER_RESULT / DUEL_CLUE_USED (server-authoritative, spec §4A)
 * can carry a screen name without a bespoke method. */
export interface AnalyticsEventMeta {
  sessionId?: string;
  clientEventId?: string;
  platform?: string;
  appVersion?: string;
  screen?: string;
  occurredAt?: Date;
}

export interface ClientAnalyticsEventInput {
  clientEventId: string;
  eventName: string;
  sessionId?: string;
  screen?: string;
  occurredAt: Date;
  properties?: Record<string, unknown>;
}

/**
 * Self-hosted usage analytics (Sept 2026 request — see
 * docs/PRIVACY_POLICY.md's "Analytics" section: events go to our own
 * database, never a third-party analytics vendor). Extended 2026-09-29
 * per the V1 Beta Feedback & Telemetry Implementation Specification —
 * same self-hosted Postgres model, richer schema (sessionId,
 * clientEventId, platform, appVersion, screen, occurredAt) and a
 * controlled event-name vocabulary (./event-names.ts), rather than a
 * second analytics service/database/vendor (spec §2/§30).
 *
 * Fire-and-forget by design for server-authoritative events, same
 * shape as AliService.reactFireAndForget — track() is called, never
 * awaited, and a DB hiccup here must never fail or slow down the
 * caller's real request. trackClientBatch() (client-submitted
 * telemetry, spec §23-§25) is the one path that's awaited, since the
 * mobile AnalyticsClient needs an accepted count back — but it still
 * never throws.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  track(
    userId: string | null,
    eventName: string,
    properties?: Record<string, unknown>,
    meta?: AnalyticsEventMeta,
  ): void {
    this.prisma.analyticsEvent
      .create({
        data: {
          userId,
          eventName,
          properties: (properties ?? {}) as Prisma.InputJsonValue,
          sessionId: meta?.sessionId,
          clientEventId: meta?.clientEventId,
          platform: meta?.platform,
          appVersion: meta?.appVersion,
          screen: meta?.screen,
          ...(meta?.occurredAt ? { occurredAt: meta.occurredAt } : {}),
        },
      })
      .catch(() => {
        // Intentionally silent — see the class doc comment.
      });
  }

  /**
   * Client-submitted telemetry batch (spec §23-§25) — POST
   * /api/v1/analytics/events. Idempotent via createMany({
   * skipDuplicates: true }) against the clientEventId unique index: a
   * retried submission of the same event (unreliable mobile networks)
   * is silently a no-op rather than a duplicate row or a thrown
   * conflict — no read-then-write race, one INSERT does the whole
   * dedup.
   *
   * Unknown event names are dropped rather than rejecting the whole
   * batch — one stale client build sending a since-removed event name
   * should not also cost every other, valid event in its batch (spec
   * §6: names are controlled, but the response to a violation here is
   * to filter, not fail the request the player is waiting on).
   *
   * Never throws: a DB hiccup surfaces as accepted: 0, not a 5xx —
   * telemetry ingestion failing must never look like something the
   * client should alarm on or block gameplay for (spec §30).
   */
  async trackClientBatch(
    userId: string,
    events: ClientAnalyticsEventInput[],
    batchMeta: { platform?: string; appVersion?: string },
  ): Promise<{ accepted: number; rejected: number }> {
    const valid = events.filter((event) => isKnownAnalyticsEventName(event.eventName));
    const rejected = events.length - valid.length;
    if (valid.length === 0) {
      return { accepted: 0, rejected };
    }

    try {
      const result = await this.prisma.analyticsEvent.createMany({
        data: valid.map((event) => ({
          userId,
          eventName: event.eventName,
          clientEventId: event.clientEventId,
          sessionId: event.sessionId,
          screen: event.screen,
          occurredAt: event.occurredAt,
          platform: batchMeta.platform,
          appVersion: batchMeta.appVersion,
          properties: (event.properties ?? {}) as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
      return { accepted: result.count, rejected };
    } catch {
      return { accepted: 0, rejected: events.length };
    }
  }
}
