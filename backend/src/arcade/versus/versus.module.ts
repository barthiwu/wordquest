import { Module } from '@nestjs/common';
import { FriendsModule } from '../../friends/friends.module';
import { NotificationModule } from '../../notifications/notification.module';
import { ProgressionModule } from '../../progression/progression.module';
import { ArcadeVersusService } from './versus.service';
import { ArcadeVersusController } from './versus.controller';

@Module({
  imports: [FriendsModule, NotificationModule, ProgressionModule],
  controllers: [ArcadeVersusController],
  providers: [ArcadeVersusService],
  exports: [ArcadeVersusService],
})
export class ArcadeVersusModule {}
