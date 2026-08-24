import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { MasteryService } from '../mastery/mastery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly mastery: MasteryService,
  ) {}

  @Get('me')
  async me(@CurrentUserId() userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      countryCode: user.countryCode,
      nativeLanguage: user.nativeLanguage,
      targetLanguage: user.targetLanguage,
      timezone: user.timezone,
      learningGoal: user.learningGoal,
      onboardingCompletedAt: user.onboardingCompletedAt,
      clanId: user.clanId,
      createdAt: user.createdAt,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }

  @Patch('me')
  async updateMe(@CurrentUserId() userId: string, @Body() dto: UpdateMeDto) {
    const updated = await this.users.updateProfile(userId, dto);
    return {
      id: updated.id,
      countryCode: updated.countryCode,
      nativeLanguage: updated.nativeLanguage,
      targetLanguage: updated.targetLanguage,
      timezone: updated.timezone,
      learningGoal: updated.learningGoal,
      onboardingCompletedAt: updated.onboardingCompletedAt,
      clanId: updated.clanId,
    };
  }

  /** Spec v2 §19: GET /users/me/words/:wordId/mastery */
  @Get('me/words/:wordId/mastery')
  getWordMastery(@CurrentUserId() userId: string, @Param('wordId') wordId: string) {
    return this.mastery.getDetail(userId, wordId);
  }
}
