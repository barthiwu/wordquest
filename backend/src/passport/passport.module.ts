import { Module } from '@nestjs/common';
import { PassportController } from './passport.controller';
import { QuestCardModule } from '../quest-card/quest-card.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [QuestCardModule, StorageModule],
  controllers: [PassportController],
})
export class PassportModule {}
