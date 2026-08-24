import { Module } from '@nestjs/common';
import { PassportController } from './passport.controller';
import { QuestCardModule } from '../quest-card/quest-card.module';

@Module({
  imports: [QuestCardModule],
  controllers: [PassportController],
})
export class PassportModule {}
