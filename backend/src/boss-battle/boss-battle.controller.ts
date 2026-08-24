import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BossBattleService, type BattleAnswerResult } from './boss-battle.service';
import { SubmitBattleAnswerDto } from './dto/submit-battle-answer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../auth/guards/email-verification.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';

const SUBMIT_ANSWER_ENDPOINT = 'boss-battle.submitAnswer';

/**
 * GET  /api/v1/boss-battle/upcoming     — countdown display, no side effects
 * POST /api/v1/boss-battle/join         — join (or resume) this week's live battle
 * POST /api/v1/boss-battle/answer       — answer the player's current challenge
 * GET  /api/v1/boss-battle/leaderboard  — the player's own group, live-ranked
 * answer submission gets a tighter limit than the app-wide default (same
 * reasoning as quests/Word in the Wild — it's where reward-granting happens),
 * and honors an optional Idempotency-Key header (spec §3.7: "server-side
 * idempotency mandatory") — see IdempotencyService's doc comment for why
 * this is the one Boss Battle route that specifically needs it.
 */
@Controller('boss-battle')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class BossBattleController {
  constructor(
    private readonly bossBattle: BossBattleService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('upcoming')
  getUpcoming() {
    return this.bossBattle.getUpcoming();
  }

  @Post('join')
  join(@CurrentUserId() userId: string) {
    return this.bossBattle.joinBattle(userId);
  }

  @Post('answer')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async submitAnswer(
    @CurrentUserId() userId: string,
    @Body() dto: SubmitBattleAnswerDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const cached = await this.idempotency.checkCache<BattleAnswerResult>(
      userId,
      idempotencyKey,
      SUBMIT_ANSWER_ENDPOINT,
    );
    if (cached.cached) return cached.response;

    return this.bossBattle.submitAnswer(userId, dto.answer, idempotencyKey);
  }

  @Get('leaderboard')
  getLeaderboard(@CurrentUserId() userId: string) {
    return this.bossBattle.getMyGroupLeaderboard(userId);
  }
}
