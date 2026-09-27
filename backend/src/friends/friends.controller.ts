import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FriendsService } from './friends.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * GET  /api/v1/friends/profile/:userId
 * GET  /api/v1/friends/search?username=
 * GET  /api/v1/friends
 * GET  /api/v1/friends/requests
 * POST /api/v1/friends/requests
 * POST /api/v1/friends/requests/:requestId/accept
 * POST /api/v1/friends/requests/:requestId/decline
 * DELETE /api/v1/friends/:userId
 * POST /api/v1/friends/:userId/block
 * POST /api/v1/friends/:userId/unblock
 *
 * See FriendsService for the request/accept and block semantics
 * (2026-09, Barth: request needs acceptance; block is full/mutual).
 */
@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get('profile/:userId')
  getProfile(@CurrentUserId() viewerId: string, @Param('userId') targetUserId: string) {
    return this.friends.getProfile(viewerId, targetUserId);
  }

  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  search(@CurrentUserId() userId: string, @Query('username') username: string) {
    return this.friends.searchByUsername(userId, username ?? '');
  }

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.friends.listFriends(userId);
  }

  @Get('requests')
  listRequests(@CurrentUserId() userId: string) {
    return this.friends.listRequests(userId);
  }

  @Post('requests')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  sendRequest(@CurrentUserId() userId: string, @Body() dto: SendFriendRequestDto) {
    return this.friends.sendRequest(userId, dto.username);
  }

  @Post('requests/:requestId/accept')
  accept(@CurrentUserId() userId: string, @Param('requestId') requestId: string) {
    return this.friends.acceptRequest(userId, requestId);
  }

  @Post('requests/:requestId/decline')
  decline(@CurrentUserId() userId: string, @Param('requestId') requestId: string) {
    return this.friends.declineRequest(userId, requestId);
  }

  @Delete(':userId')
  unfriend(@CurrentUserId() userId: string, @Param('userId') otherUserId: string) {
    return this.friends.unfriend(userId, otherUserId);
  }

  @Post(':userId/block')
  block(@CurrentUserId() userId: string, @Param('userId') otherUserId: string) {
    return this.friends.block(userId, otherUserId);
  }

  @Post(':userId/unblock')
  unblock(@CurrentUserId() userId: string, @Param('userId') otherUserId: string) {
    return this.friends.unblock(userId, otherUserId);
  }
}
