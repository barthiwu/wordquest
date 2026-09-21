import { Module } from '@nestjs/common';
import { BossBattleController } from './boss-battle.controller';
import { BossBattleService } from './boss-battle.service';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { MasteryModule } from '../mastery/mastery.module';
import { ProgressionModule } from '../progression/progression.module';
import { AchievementModule } from '../achievement/achievement.module';
import { AliModule } from '../ali/ali.module';
import { NotificationModule } from '../notifications/notification.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { QuestCardModule } from '../quest-card/quest-card.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    VocabularyModule,
    MasteryModule,
    ProgressionModule,
    AchievementModule,
    AliModule,
    NotificationModule,
    IdempotencyModule,
    QuestCardModule,
    AnalyticsModule,
  ],
  controllers: [BossBattleController],
  providers: [BossBattleService],
})
export class BossBattleModule {}
