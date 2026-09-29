import { Controller, Get, UseGuards } from '@nestjs/common';
import { AnalyticsQueryService } from './analytics-query.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * GET /api/v1/analytics/dashboard/* — admin/support-only (same
 * RolesGuard/@Roles pattern as ModerationController and
 * FeedbackController's own review endpoints). Read-only; no
 * player-facing route lives in this controller.
 */
@Controller('analytics/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPPORT')
export class AnalyticsQueryController {
  constructor(private readonly analyticsQuery: AnalyticsQueryService) {}

  @Get('overview')
  overview() {
    return this.analyticsQuery.getOverview();
  }

  @Get('word-duel')
  wordDuel() {
    return this.analyticsQuery.getWordDuelDashboard();
  }

  @Get('arcade')
  arcade() {
    return this.analyticsQuery.getArcadeDashboard();
  }
}
