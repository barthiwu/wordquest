import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CompleteItService } from './complete-it.service';
import { SubmitCompleteItAnswerDto } from './dto/submit-complete-it-answer.dto';
import { StartArcadeGameDto } from '../dto/start-arcade-game.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../../auth/guards/email-verification.guard';
import { CurrentUserId } from '../../auth/decorators/current-user.decorator';
import {
  AllowGuest,
  assertGuestStartsGroupOnly,
  IsGuest,
} from '../../auth/decorators/allow-guest.decorator';

/**
 * POST /api/v1/arcade/complete-it/start
 * POST /api/v1/arcade/complete-it/:sessionId/hint
 * POST /api/v1/arcade/complete-it/:sessionId/answer
 *
 * Hints are enabled here (2026-09 decision, Barth) — sized to 60% of
 * the word's own letter count (CompleteItService.maxHintsFor) rather
 * than ScrambleQuest's flat 3-hint cap, but otherwise the same
 * mechanic. All routes act only on the authenticated player's own
 * session (enforced again inside the service); hint/answer get the
 * same tighter rate limit ScrambleQuestController's routes use
 * (spec §11).
 */
@Controller('arcade/complete-it')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
@AllowGuest() // guests may play inside a group; `start` below refuses everything else
export class CompleteItController {
  constructor(private readonly completeIt: CompleteItService) {}

  @Post('start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(
    @CurrentUserId() userId: string,
    @IsGuest() isGuest: boolean,
    @Body() dto: StartArcadeGameDto,
  ) {
    assertGuestStartsGroupOnly(isGuest, dto?.groupId);
    return this.completeIt.start(userId, dto?.versusMatchId, dto?.groupId);
  }

  @Post(':sessionId/hint')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  requestHint(@CurrentUserId() userId: string, @Param('sessionId') sessionId: string) {
    return this.completeIt.requestHint(userId, sessionId);
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
