import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MasterChallengeService } from './master-challenge.service';
import { SubmitMasterChallengeDto } from './dto/submit-master-challenge.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../auth/guards/email-verification.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { PlayerClockService } from '../common/player-clock.service';

/**
 * GET  /api/v1/master-challenge/status
 * POST /api/v1/master-challenge/submit
 * localDate is derived server-side from the player's stored timezone
 * (Player Timezone System, V1 Remaining Systems Spec §15) — no longer a
 * query param / body field the client supplies.
 */
@Controller('master-challenge')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class MasterChallengeController {
  constructor(
    private readonly masterChallenge: MasterChallengeService,
    private readonly clock: PlayerClockService,
  ) {}

  @Get('status')
  async getStatus(@CurrentUserId() userId: string) {
    const { localDate } = await this.clock.now(userId);
    return this.masterChallenge.getStatus(userId, localDate);
  }

  @Post('submit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async submit(@CurrentUserId() userId: string, @Body() dto: SubmitMasterChallengeDto) {
    const { localDate } = await this.clock.now(userId);
    return this.masterChallenge.submit(userId, localDate, dto.paragraph);
  }
}
