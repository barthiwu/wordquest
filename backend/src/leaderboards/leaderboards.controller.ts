import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { LeaderboardsService, type LeaderboardView } from './leaderboards.service';

/**
 * §30 LEADERBOARDS / build order §47 item 25. See LeaderboardsService for
 * which categories are implemented and why (Global + Clan; Friends is
 * deliberately not, since WordQuest has no friends graph to rank yet).
 */
@Controller('leaderboards')
@UseGuards(JwtAuthGuard)
export class LeaderboardsController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  @Get('global')
  getGlobal(
    @CurrentUserId() userId: string,
    @Query('limit') limit?: string,
  ): Promise<LeaderboardView> {
    return this.leaderboards.getGlobal(userId, limit ? Number(limit) : undefined);
  }

  @Get('clan')
  getClan(@CurrentUserId() userId: string): Promise<LeaderboardView> {
    return this.leaderboards.getClan(userId);
  }
}
