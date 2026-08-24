import { Controller, Get, UseGuards } from '@nestjs/common';
import { AchievementService } from './achievement.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * GET /api/v1/achievements/catalog — the full v1.0 list, public info
 * GET /api/v1/achievements/me      — the player's own unlocks
 */
@Controller('achievements')
@UseGuards(JwtAuthGuard)
export class AchievementController {
  constructor(private readonly achievements: AchievementService) {}

  @Get('catalog')
  getCatalog() {
    return this.achievements.listCatalog();
  }

  @Get('me')
  getMyUnlocks(@CurrentUserId() userId: string) {
    return this.achievements.getMyUnlocks(userId);
  }
}
