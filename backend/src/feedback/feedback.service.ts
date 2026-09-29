import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  Feedback,
  FeedbackCategory,
  FeedbackStatus,
  FeedbackType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

export interface SubmitFeedbackInput {
  type: FeedbackType;
  category: FeedbackCategory;
  rating?: number;
  message?: string;
  screen?: string;
  context?: Record<string, unknown>;
}

/**
 * Feedback (Telemetry spec §17-§20) — deliberately separate from
 * AnalyticsService/analytics_events. Telemetry is passive observation
 * of what players DO; feedback is something a player deliberately told
 * us, with its own review workflow (NEW -> REVIEWED/RESOLVED, spec
 * §17). Keeping them apart means a support person reviewing feedback
 * never has to wade through DUEL_CLUE_USED-style volume, and feedback
 * rows never get pruned/aggregated the way raw event volume might be.
 *
 * Still emits a lightweight analytics event on submission
 * (FEEDBACK_PROMPT_ANSWERED for a PROMPT, spec §18) so "how many
 * players respond to the prompt at all" shows up in the same funnels
 * as everything else, without duplicating the full message/rating into
 * analytics_events.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async submit(userId: string, input: SubmitFeedbackInput): Promise<Feedback> {
    if (input.rating === undefined && !input.message?.trim()) {
      throw new BadRequestException('Feedback needs a rating, a message, or both.');
    }

    const feedback = await this.prisma.feedback.create({
      data: {
        userId,
        type: input.type,
        category: input.category,
        rating: input.rating,
        message: input.message,
        screen: input.screen,
        context: (input.context ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (input.type === 'PROMPT') {
      this.analytics.track(
        userId,
        'FEEDBACK_PROMPT_ANSWERED',
        { category: input.category, rating: input.rating },
        { screen: input.screen },
      );
    }

    return feedback;
  }

  /** Admin/support review queue (RolesGuard-protected at the controller
   * level) — filterable by status and/or category, newest first. */
  list(filter: { status?: FeedbackStatus; category?: FeedbackCategory }): Promise<Feedback[]> {
    return this.prisma.feedback.findMany({
      where: {
        status: filter.status,
        category: filter.category,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  updateStatus(id: string, status: FeedbackStatus): Promise<Feedback> {
    return this.prisma.feedback.update({ where: { id }, data: { status } });
  }
}
