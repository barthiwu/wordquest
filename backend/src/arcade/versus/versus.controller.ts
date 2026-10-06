import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArcadeVersusService } from './versus.service';
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
 */
@Controller('arcade/versus')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class ArcadeVersusController {
  constructor(private readonly versus: ArcadeVersusService) {}

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
