import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { LearningProfileService } from './learning-profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * Player-facing surface for the Adaptive AI Learning Engine's Learning
 * Profile (V1 Remaining Systems Spec §1) — the aggregate itself is
 * updated automatically from QuestsService.completeWord; this only
 * exposes it and the post-calibration accept/reject decision.
 */
@Controller('learning-profile')
@UseGuards(JwtAuthGuard)
export class LearningProfileController {
  constructor(private readonly learningProfile: LearningProfileService) {}

  @Get('me')
  getMine(@CurrentUserId() userId: string) {
    return this.learningProfile.getProfile(userId);
  }

  @Post('me/accept-difficulty')
  acceptDifficulty(@CurrentUserId() userId: string) {
    return this.learningProfile.acceptRecommendedDifficulty(userId);
  }

  @Post('me/reject-difficulty')
  rejectDifficulty(@CurrentUserId() userId: string) {
    return this.learningProfile.rejectRecommendedDifficulty(userId);
  }
}
