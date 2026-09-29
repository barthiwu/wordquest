import { Module } from '@nestjs/common';
import { QuestCardService } from './quest-card.service';
import { QuestCardController } from './quest-card.controller';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  providers: [QuestCardService],
  controllers: [QuestCardController],
  exports: [QuestCardService],
})
export class QuestCardModule {}
