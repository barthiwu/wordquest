import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CompleteItService } from './complete-it.service';
import { SubmitCompleteItAnswerDto } from './dto/submit-complete-it-answer.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../../auth/guards/email-verification.guard';
import { CurrentUserId } from '../../auth/decorators/current-user.decorator';

/**
 * POST /api/v1/arcade/complete-it/start
 * POST /api/v1/arcade/complete-it/:sessionId/answer
 *
 * No hint route — COMPLETE_IT_CONFIG.HINTS_ENABLED is false (2026-09
 * decision), unlike ScrambleQuest. All routes act only on the
 * authenticated player's own session (enforced again inside the
 * service); answer gets the same tighter rate limit ScrambleQuest's
 * answer route uses (spec §11).
 */
@Controller('arcade/complete-it')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class CompleteItController {
  constructor(private readonly completeIt: CompleteItService) {}

  @Post('start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(@CurrentUserId() userId: string) {
    return this.completeIt.start(userId);
  }

  @Post(':sessionId/answer')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitAnswer(
    @CurrentUserId() userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitCompleteItAnswerDto,
  ) {
    return this.completeIt.submitAnswer(userId, sessionId, dto.answer);
  }
}
