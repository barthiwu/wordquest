import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ModerationService } from './moderation.service';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * POST /api/v1/reports — any authenticated player can file a report
 * against a user, clan, or Word in the Wild submission. Reviewing what
 * comes in is ModerationController (admin/support only), a separate
 * controller because the two have entirely different authorization.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly moderation: ModerationService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUserId() userId: string, @Body() dto: CreateReportDto) {
    return this.moderation.fileReport(userId, dto.targetType, dto.targetId, dto.reason);
  }
}
