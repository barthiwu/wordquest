import { Module } from '@nestjs/common';
import { QuestCardService } from './quest-card.service';
import { QuestCardController } from './quest-card.controller';

@Module({
  providers: [QuestCardService],
  controllers: [QuestCardController],
  exports: [QuestCardService],
})
export class QuestCardModule {}
