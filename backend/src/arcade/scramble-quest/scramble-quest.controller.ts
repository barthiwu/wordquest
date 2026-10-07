import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ScrambleQuestService } from './scramble-quest.service';
import { SubmitScrambleAnswerDto } from './dto/submit-scramble-answer.dto';
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
 * POST /api/v1/arcade/scramble-quest/start
 * POST /api/v1/arcade/scramble-quest/:sessionId/hint
 * POST /api/v1/arcade/scramble-quest/:sessionId/answer
 *
 * All routes act only on the authenticated player's own session
 * (enforced again inside the service). Answer/hint get a tighter rate
 * limit than the app-wide default (spec §11: "Rate-limit answer, hint,
 * and matchmaking operations") — same reasoning and same numbers as
 * QuestsController's answer route.
 */
@Controller('arcade/scramble-quest')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
@AllowGuest() // guests may play inside a group; `start` below refuses everything else
export class ScrambleQuestController {
  constructor(private readonly scrambleQuest: ScrambleQuestService) {}

  @Post('start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(
    @CurrentUserId() userId: string,
    @IsGuest() isGuest: boolean,
    @Body() dto: StartArcadeGameDto,
  ) {
    assertGuestStartsGroupOnly(isGuest, dto?.groupId);
    return this.scrambleQuest.start(userId, dto?.versusMatchId, dto?.groupId);
  }

  @Post(':sessionId/hint')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  requestHint(@CurrentUserId() userId: string, @Param('sessionId') sessionId: string) {
    return this.scrambleQuest.requestHint(userId, sessionId);
  }

  @Post(':sessionId/answer')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitAnswer(
    @CurrentUserId() userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitScrambleAnswerDto,
  ) {
    return this.scrambleQuest.submitAnswer(userId, sessionId, dto.answer);
  }
}
