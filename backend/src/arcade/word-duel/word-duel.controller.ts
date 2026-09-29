import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WordDuelService } from './word-duel.service';
import { SubmitWordDuelAnswerDto } from './dto/submit-word-duel-answer.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../../auth/guards/email-verification.guard';
import { CurrentUserId } from '../../auth/decorators/current-user.decorator';

/**
 * POST /api/v1/arcade/word-duel/join
 * GET  /api/v1/arcade/word-duel/:matchId
 * POST /api/v1/arcade/word-duel/:matchId/answer
 * POST /api/v1/arcade/word-duel/:matchId/clue
 *
 * REST + client-polling transport for now (see the doc comment atop
 * WordDuelService) — no WebSocket gateway exists in this codebase yet
 * and that is a deliberate open question for Barth, not an oversight
 * here. `join` doubles as matchmaking AND resume (spec §11: "Rate-
 * limit answer, hint, and matchmaking operations" — same tighter
 * budget the other Arcade games use for their own start/answer
 * routes). `:matchId` (GET) is what a polling client hits on a short
 * interval to pick up the opponent joining and the match ending — a
 * materially higher budget than answer/join/clue, sized for that
 * polling cadence rather than for one-off actions. `clue` (POST) is
 * the player-triggered "Clues" button (2026-09-29, Barth) — same
 * tighter answer/hint-style rate limit as `answer`, mirroring
 * ScrambleQuestController's own hint route.
 */
@Controller('arcade/word-duel')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class WordDuelController {
  constructor(private readonly wordDuel: WordDuelService) {}

  @Post('join')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  joinQueue(@CurrentUserId() userId: string) {
    return this.wordDuel.joinQueue(userId);
  }

  @Get(':matchId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  getState(@CurrentUserId() userId: string, @Param('matchId') matchId: string) {
    return this.wordDuel.getState(userId, matchId);
  }

  @Post(':matchId/answer')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitAnswer(
    @CurrentUserId() userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: SubmitWordDuelAnswerDto,
  ) {
    return this.wordDuel.submitAnswer(userId, matchId, dto.answer);
  }

  @Post(':matchId/clue')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  requestClue(@CurrentUserId() userId: string, @Param('matchId') matchId: string) {
    return this.wordDuel.requestClue(userId, matchId);
  }
}
