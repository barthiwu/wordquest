import { Module } from '@nestjs/common';
import { AchievementController } from './achievement.controller';
import { AchievementService } from './achievement.service';
import { ProgressionModule } from '../progression/progression.module';
import { QuestCardModule } from '../quest-card/quest-card.module';
import { AliModule } from '../ali/ali.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [ProgressionModule, QuestCardModule, AliModule, NotificationModule],
  controllers: [AchievementController],
  providers: [AchievementService],
  exports: [AchievementService],
})
export class AchievementModule {}
