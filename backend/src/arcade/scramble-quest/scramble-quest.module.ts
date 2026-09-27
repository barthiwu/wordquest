import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { ProgressionModule } from '../../progression/progression.module';
import { ScrambleQuestService } from './scramble-quest.service';
import { ScrambleQuestController } from './scramble-quest.controller';

@Module({
  imports: [ArcadeModule, ProgressionModule],
  controllers: [ScrambleQuestController],
  providers: [ScrambleQuestService],
})
export class ScrambleQuestModule {}
