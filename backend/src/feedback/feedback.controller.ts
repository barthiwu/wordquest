import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FeedbackCategory, FeedbackStatus } from '@prisma/client';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ReviewFeedbackDto } from './dto/review-feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * POST /api/v1/feedback — any authenticated player, both the targeted
 * lightweight prompts (spec §18) and the standalone Settings -> Send
 * Feedback screen (spec §20) submit here.
 *
 * GET/PATCH /api/v1/feedback — admin/support review queue, same
 * RolesGuard/@Roles pattern as ModerationController's report queue
 * (the first precedent in this codebase for an internal-only listing
 * endpoint).
 */
@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  submit(@CurrentUserId() userId: string, @Body() dto: CreateFeedbackDto) {
    return this.feedback.submit(userId, dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPPORT')
  list(@Query('status') status?: FeedbackStatus, @Query('category') category?: FeedbackCategory) {
    return this.feedback.list({ status, category });
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPPORT')
  review(@Param('id') id: string, @Body() dto: ReviewFeedbackDto) {
    return this.feedback.updateStatus(id, dto.status);
  }
}
