import { Module } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { ProgressionModule } from '../progression/progression.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [ProgressionModule, AnalyticsModule],
  providers: [ShopService],
  controllers: [ShopController],
  exports: [ShopService],
})
export class ShopModule {}
