import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';
import { SubmitAnalyticsEventsDto } from './dto/submit-analytics-events.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * POST /api/v1/analytics/events
 *
 * Client interaction telemetry ingestion (Telemetry spec §4B/§23) —
 * the AnalyticsClient's batched queue flush target. Deliberately NOT
 * behind EmailVerificationGuard (unlike most gameplay routes): an
 * unverified player mid-onboarding still generates telemetry worth
 * keeping (ONBOARDING_ABANDONED chief among them), and gating this on
 * verification would blind us to exactly the drop-off the spec cares
 * most about (spec §8).
 *
 * Rate-limited generously relative to other write routes — a single
 * batch already amortizes many taps into one request (spec §24), and
 * an app with a backlog after being offline may flush several batches
 * in quick succession on reconnect.
 */
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('events')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async submitEvents(@CurrentUserId() userId: string, @Body() dto: SubmitAnalyticsEventsDto) {
    const result = await this.analytics.trackClientBatch(
      userId,
      dto.events.map((event) => ({
        clientEventId: event.clientEventId,
        eventName: event.eventName,
        sessionId: event.sessionId,
        screen: event.screen,
        occurredAt: new Date(event.occurredAt),
        properties: event.properties,
      })),
      { platform: dto.platform, appVersion: dto.appVersion },
    );
    return result;
  }
}
