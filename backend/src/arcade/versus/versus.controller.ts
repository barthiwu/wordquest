import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArcadeVersusService } from './versus.service';
import { ArcadeVersusChatService } from './versus-chat.service';
import { SendDuelMessageDto } from '../word-duel/dto/send-duel-message.dto';
import { InviteVersusDto, QueueVersusDto, RespondVersusDto } from './dto/versus.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../../auth/guards/email-verification.guard';
import { CurrentUserId } from '../../auth/decorators/current-user.decorator';

/**
 * POST /api/v1/arcade/versus/queue          join the random queue
 * POST /api/v1/arcade/versus/invite         challenge a friend
 * GET  /api/v1/arcade/versus/mine           my challenges, live matches, recent results
 * GET  /api/v1/arcade/versus/:id            one match (also the polling endpoint)
 * POST /api/v1/arcade/versus/:id/respond    accept / decline a challenge
 * POST /api/v1/arcade/versus/:id/cancel     back out of a search or challenge
 * GET  /api/v1/arcade/versus/:id/chat       chat messages after ?after=<seq> (+ what I may send)
 * POST /api/v1/arcade/versus/:id/chat       { body } or { quick }
 */
@Controller('arcade/versus')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class ArcadeVersusController {
  constructor(
    private readonly versus: ArcadeVersusService,
    private readonly chat: ArcadeVersusChatService,
  ) {}

  @Post('queue')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  queue(@CurrentUserId() userId: string, @Body() dto: QueueVersusDto) {
    return this.versus.queue(userId, dto.game);
  }

  @Post('invite')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  invite(@CurrentUserId() userId: string, @Body() dto: InviteVersusDto) {
    return this.versus.invite(userId, dto.friendId, dto.game);
  }

  @Get('mine')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  mine(@CurrentUserId() userId: string) {
    return this.versus.listMine(userId);
  }

  // Declared before ':id' routes so 'chat' is never read as an id.
  @Get(':id/chat')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listChat(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Query('after') after?: string,
  ) {
    const cursor = Number.parseInt(after ?? '0', 10);
    return this.chat.listForViewer(userId, id, Number.isFinite(cursor) ? cursor : 0);
  }

  @Post(':id/chat')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  sendChat(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SendDuelMessageDto,
  ) {
    return this.chat.send(userId, id, { body: dto.body, quick: dto.quick });
  }

  @Get(':id')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.versus.getMatch(userId, id);
  }

  @Post(':id/respond')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  respond(@CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: RespondVersusDto) {
    return this.versus.respond(userId, id, dto.accept);
  }

  @Post(':id/cancel')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  cancel(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.versus.cancel(userId, id);
  }
}
