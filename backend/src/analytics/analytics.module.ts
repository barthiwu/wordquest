import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsQueryService } from './analytics-query.service';
import { AnalyticsQueryController } from './analytics-query.controller';

@Module({
  controllers: [AnalyticsController, AnalyticsQueryController],
  providers: [AnalyticsService, AnalyticsQueryService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
