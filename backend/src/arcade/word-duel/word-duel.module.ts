import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { ProgressionModule } from '../../progression/progression.module';
import { FriendsModule } from '../../friends/friends.module';
import { AliModule } from '../../ali/ali.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { WordDuelService } from './word-duel.service';
import { WordDuelController } from './word-duel.controller';
import { WordDuelChatService } from './word-duel-chat.service';
import { WordDuelInviteService } from './word-duel-invite.service';
import { NotificationModule } from '../../notifications/notification.module';

@Module({
  imports: [
    ArcadeModule,
    ProgressionModule,
    FriendsModule,
    AliModule,
    AnalyticsModule,
    NotificationModule,
  ],
  controllers: [WordDuelController],
  providers: [WordDuelService, WordDuelChatService, WordDuelInviteService],
})
export class WordDuelModule {}
