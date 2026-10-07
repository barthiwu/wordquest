import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArcadeGuestService } from './guest.service';
import { GuestJoinDto } from './dto/guest-join.dto';
import { ArcadeGroupService } from './group.service';

/**
 * GET  /api/v1/arcade/guest-join/preview/:code   public: what the link shows before joining
 * POST /api/v1/arcade/guest-join                  public: join a group link with just a nickname
 *
 * Returns a normal session (tokens + user, `isGuest: true`) and the group.
 * Throttled per IP, but generously: a whole class or WhatsApp group on one
 * Wi-Fi network joins in the same minute. The group's member cap and the
 * 180-day purge bound what a flood could create.
 */
@Controller('arcade/guest-join')
export class ArcadeGuestController {
  constructor(
    private readonly guests: ArcadeGuestService,
    private readonly groups: ArcadeGroupService,
  ) {}

  /** Same answer as the signed-in preview; the code in the link is the only secret. */
  @Get('preview/:code')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  preview(@Param('code') code: string) {
    return this.groups.preview(code);
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 80, ttl: 60_000 } })
  join(@Body() dto: GuestJoinDto) {
    return this.guests.join(dto.code, dto.nickname);
  }
}
