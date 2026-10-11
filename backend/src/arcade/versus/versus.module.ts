import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { FriendsModule } from '../../friends/friends.module';
import { NotificationModule } from '../../notifications/notification.module';
import { ProgressionModule } from '../../progression/progression.module';
import { ArcadeVersusService } from './versus.service';
import { ArcadeVersusController } from './versus.controller';
import { ArcadeVersusChatService } from './versus-chat.service';
import { ChatSafetyModule } from '../chat/chat-safety.module';

@Module({
  imports: [ArcadeModule, ChatSafetyModule, FriendsModule, NotificationModule, ProgressionModule],
  controllers: [ArcadeVersusController],
  providers: [ArcadeVersusService, ArcadeVersusChatService],
  exports: [ArcadeVersusService],
})
export class ArcadeVersusModule {}
