import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [ReportsController, ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
