import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { HangmanService } from './hangman.service';
import { GuessHangmanLetterDto } from './dto/guess-hangman-letter.dto';
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
 * POST /api/v1/arcade/hangman/start
 * POST /api/v1/arcade/hangman/:sessionId/guess   { letter }
 * POST /api/v1/arcade/hangman/:sessionId/hint
 *
 * Same guards and rate-limit shape as ScrambleQuest. A guess is one tap,
 * so its limit is a little higher than ScrambleQuest's answer limit.
 */
@Controller('arcade/hangman')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
@AllowGuest() // guests may play inside a group; `start` below refuses everything else
export class HangmanController {
  constructor(private readonly hangman: HangmanService) {}

  @Post('start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(
    @CurrentUserId() userId: string,
    @IsGuest() isGuest: boolean,
    @Body() dto: StartArcadeGameDto,
  ) {
    assertGuestStartsGroupOnly(isGuest, dto?.groupId);
    return this.hangman.start(userId, dto?.versusMatchId, dto?.groupId);
  }

  @Post(':sessionId/guess')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  guess(
    @CurrentUserId() userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: GuessHangmanLetterDto,
  ) {
    return this.hangman.guessLetter(userId, sessionId, dto.letter);
  }

  @Post(':sessionId/hint')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  hint(@CurrentUserId() userId: string, @Param('sessionId') sessionId: string) {
    return this.hangman.requestHint(userId, sessionId);
  }
}
