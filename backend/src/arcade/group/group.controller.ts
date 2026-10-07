import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArcadeGroupService } from './group.service';
import { CreateGroupDto, GroupMemberParamDto, JoinGroupDto, StartGroupDto } from './dto/group.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerificationGuard } from '../../auth/guards/email-verification.guard';
import { CurrentUserId } from '../../auth/decorators/current-user.decorator';
import { AllowGuest, IsGuest } from '../../auth/decorators/allow-guest.decorator';

/**
 * POST   /api/v1/arcade/groups                      create a private group (host)
 * GET    /api/v1/arcade/groups/mine                 my groups
 * GET    /api/v1/arcade/groups/preview/:code        what the invite link shows before joining
 * POST   /api/v1/arcade/groups/join                 join by code
 * GET    /api/v1/arcade/groups/:id                  one group (members only; also the polling endpoint)
 * POST   /api/v1/arcade/groups/:id/start            host: start the round
 * POST   /api/v1/arcade/groups/:id/end              host: end the round / group
 * POST   /api/v1/arcade/groups/:id/leave            member: leave
 * DELETE /api/v1/arcade/groups/:id/members/:userId  host: remove a member
 *
 * Guests (see AllowGuest) may read, join and leave groups and play in them;
 * creating or running one needs an account.
 */
@Controller('arcade/groups')
@UseGuards(JwtAuthGuard, EmailVerificationGuard)
export class ArcadeGroupController {
  constructor(private readonly groups: ArcadeGroupService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUserId() userId: string, @Body() dto: CreateGroupDto) {
    return this.groups.create(userId, dto);
  }

  @AllowGuest()
  @Get('mine')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  mine(@CurrentUserId() userId: string) {
    return this.groups.listMine(userId);
  }

  // Guessing codes is the only way to find a group, so the lookup is throttled hard.
  @Get('preview/:code')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  preview(@Param('code') code: string) {
    return this.groups.preview(code);
  }

  @AllowGuest()
  @Post('join')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  join(@CurrentUserId() userId: string, @IsGuest() isGuest: boolean, @Body() dto: JoinGroupDto) {
    return this.groups.join(userId, dto.code, isGuest);
  }

  @AllowGuest()
  @Get(':id')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.groups.get(userId, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(@CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: StartGroupDto) {
    return this.groups.start(userId, id, dto.windowMinutes);
  }

  @Post(':id/end')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  end(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.groups.end(userId, id);
  }

  @AllowGuest()
  @Post(':id/leave')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async leave(@CurrentUserId() userId: string, @Param('id') id: string) {
    await this.groups.leave(userId, id);
  }

  @Delete(':id/members/:userId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  remove(@CurrentUserId() hostId: string, @Param() params: GroupMemberParamDto) {
    return this.groups.removeMember(hostId, params.id, params.userId);
  }
}
