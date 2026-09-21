import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { AvatarUploadUrlDto } from './dto/avatar-upload-url.dto';
import { ConfirmAvatarDto } from './dto/confirm-avatar.dto';
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
      avatarUrl: await this.users.resolveAvatarUrl(user.avatarKey),
    };
  }

  /**
   * Profile picture upload, mirroring WordInTheWild's photo-evidence
   * flow: get a presigned URL, PUT bytes directly to object storage
   * from the client, then confirm the key here once that succeeds.
   * Throttled the same as WordInTheWild's mission/submission routes --
   * no reason a single player needs more than a handful of these a
   * minute.
   */
  @Post('me/avatar/upload-url')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createAvatarUploadUrl(@CurrentUserId() userId: string, @Body() dto: AvatarUploadUrlDto) {
    return this.users.createAvatarUploadTarget(userId, dto.contentType);
  }

  @Post('me/avatar')
  async confirmAvatar(@CurrentUserId() userId: string, @Body() dto: ConfirmAvatarDto) {
    const updated = await this.users.confirmAvatar(userId, dto.key);
    return { avatarUrl: await this.users.resolveAvatarUrl(updated.avatarKey) };
  }

  @Delete('me/avatar')
  async deleteAvatar(@CurrentUserId() userId: string) {
    await this.users.removeAvatar(userId);
    return { avatarUrl: null };
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

  /**
   * Every word the player has been presented with, with their current
   * mastery on each -- backs the Profile "My Words" list (Correction &
   * Completion Spec follow-up). Registered before the :wordId route
   * below for the same reason WordsController documents: NestJS
   * matches by path shape, and this route has one fewer segment, so
   * there's no actual ordering hazard here -- kept first anyway to read
   * top-to-bottom as "list, then one word's detail."
   */
  @Get('me/words')
  listMyWords(@CurrentUserId() userId: string) {
    return this.mastery.listForUser(userId);
  }

  /** Spec v2 §19: GET /users/me/words/:wordId/mastery */
  @Get('me/words/:wordId/mastery')
  getWordMastery(@CurrentUserId() userId: string, @Param('wordId') wordId: string) {
    return this.mastery.getDetail(userId, wordId);
  }
}
