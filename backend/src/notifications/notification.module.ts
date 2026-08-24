import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { ExpoPushProvider } from './push.provider';
import { AliModule } from '../ali/ali.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';

@Module({
  imports: [AliModule, LeaderboardsModule],
  providers: [NotificationService, ExpoPushProvider, NotificationSchedulerService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
