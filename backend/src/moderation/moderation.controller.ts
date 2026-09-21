import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { ReportStatus } from '@prisma/client';
import { ModerationService } from './moderation.service';
import { ReviewReportDto } from './dto/review-report.dto';
import { ReviewPhotoDto } from './dto/review-photo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * Admin/support-only review surface (RolesGuard — the first thing in
 * this codebase to actually read User.role) for the two moderation
 * queues ModerationService owns. Never exposed to a regular player.
 */
@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPPORT')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('reports')
  listReports(@Query('status') status?: ReportStatus) {
    return this.moderation.listReports(status);
  }

  @Patch('reports/:id')
  reviewReport(@CurrentUserId() reviewerId: string, @Param('id') id: string, @Body() dto: ReviewReportDto) {
    return this.moderation.reviewReport(reviewerId, id, dto.status, dto.reviewNotes);
  }

  @Get('photo-queue')
  listPhotoQueue() {
    return this.moderation.listPhotoQueue();
  }

  @Patch('photo-queue/:id')
  reviewPhoto(@Param('id') id: string, @Body() dto: ReviewPhotoDto) {
    return this.moderation.reviewPhoto(id, dto.decision);
  }
}
