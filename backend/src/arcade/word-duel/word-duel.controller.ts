import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WordDuelService } from './word-duel.service';
import { WordDuelChatService } from './word-duel-chat.service';
import { WordDuelInviteService } from './word-duel-invite.service';
import { InviteDuelFriendDto } from './dto/invite-duel-friend.dto';
import { SendDuelMessageDto } from './dto/send-duel-message.dto';
import { SubmitWordDuelAnswerDto } from './dto/submit-word-duel-answer.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../../auth/guards/email-verification.guard';
import { CurrentUserId } from '../../auth/decorators/current-user.decorator';

/**
 * POST /api/v1/arcade/word-duel/join
 * POST /api/v1/arcade/word-duel/invite             { friendId }   challenge a friend
 * GET  /api/v1/arcade/word-duel/:matchId/invite    the challenged friend's view
 * POST /api/v1/arcade/word-duel/:matchId/accept
 * POST /api/v1/arcade/word-duel/:matchId/decline
 * GET  /api/v1/arcade/word-duel/:matchId
 * POST /api/v1/arcade/word-duel/:matchId/answer
 * POST /api/v1/arcade/word-duel/:matchId/clue
 * POST /api/v1/arcade/word-duel/:matchId/chat   { body }
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
  constructor(
    private readonly wordDuel: WordDuelService,
    private readonly chat: WordDuelChatService,
    private readonly invites: WordDuelInviteService,
  ) {}

  @Post('join')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  joinQueue(@CurrentUserId() userId: string) {
    return this.wordDuel.joinQueue(userId);
  }

  @Post('invite')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  invite(@CurrentUserId() userId: string, @Body() dto: InviteDuelFriendDto) {
    return this.invites.invite(userId, dto.friendId);
  }

  @Get(':matchId/invite')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getInvite(@CurrentUserId() userId: string, @Param('matchId') matchId: string) {
    return this.invites.getInvite(userId, matchId);
  }

  @Post(':matchId/accept')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  acceptInvite(@CurrentUserId() userId: string, @Param('matchId') matchId: string) {
    return this.invites.accept(userId, matchId);
  }

  @Post(':matchId/decline')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  declineInvite(@CurrentUserId() userId: string, @Param('matchId') matchId: string) {
    return this.invites.decline(userId, matchId);
  }

  /**
   * The polling read. With `?chatAfter=<seq>` it also carries any chat
   * messages newer than that cursor (pass 0 on the first call), so chat
   * rides the same request the screen already makes every couple of
   * seconds instead of adding a second poll.
   */
  @Get(':matchId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async getState(
    @CurrentUserId() userId: string,
    @Param('matchId') matchId: string,
    @Query('chatAfter') chatAfter?: string,
  ) {
    const state = await this.wordDuel.getState(userId, matchId);
    if (chatAfter === undefined) return state;
    const cursor = Number.parseInt(chatAfter, 10);
    const messages = await this.chat.listForViewer(
      userId,
      matchId,
      Number.isFinite(cursor) ? cursor : 0,
    );
    return { ...state, chat: messages };
  }

  @Post(':matchId/chat')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  sendChat(
    @CurrentUserId() userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: SendDuelMessageDto,
  ) {
    return this.chat.send(userId, matchId, dto.body);
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

  /** Leaving the opponent search: closes this player's WAITING match so nobody gets paired with an empty seat. */
  @Post(':matchId/leave')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  leaveQueue(@CurrentUserId() userId: string, @Param('matchId') matchId: string) {
    return this.wordDuel.leaveQueue(userId, matchId);
  }

  @Post(':matchId/clue')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  requestClue(@CurrentUserId() userId: string, @Param('matchId') matchId: string) {
    return this.wordDuel.requestClue(userId, matchId);
  }
}
