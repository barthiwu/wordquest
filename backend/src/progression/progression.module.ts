import { Module } from '@nestjs/common';
import { ProgressionService } from './progression.service';
import { ProgressionController } from './progression.controller';
import { AliModule } from '../ali/ali.module';
import { NotificationModule } from '../notifications/notification.module';
import { QuestCardModule } from '../quest-card/quest-card.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AliModule, NotificationModule, QuestCardModule, AnalyticsModule],
  controllers: [ProgressionController],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
