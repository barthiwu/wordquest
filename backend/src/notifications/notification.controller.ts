import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.listForUser(userId, { unreadOnly: unreadOnly === 'true' });
  }

  @Post(':id/read')
  markRead(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUserId() userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Get('preferences')
  getPreferences(@CurrentUserId() userId: string) {
    return this.notifications.getPreferences(userId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(userId, dto);
  }

  @Post('push-tokens')
  registerPushToken(@CurrentUserId() userId: string, @Body() dto: RegisterPushTokenDto) {
    return this.notifications.registerPushToken(userId, dto.token, dto.platform);
  }

  @Delete('push-tokens/:token')
  unregisterPushToken(@CurrentUserId() userId: string, @Param('token') token: string) {
    return this.notifications.unregisterPushToken(userId, token);
  }
}
