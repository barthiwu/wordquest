import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { ArcadeVersusModule } from '../versus/versus.module';
import { ArcadeGroupModule } from '../group/group.module';
import { ProgressionModule } from '../../progression/progression.module';
import { AliModule } from '../../ali/ali.module';
import { ScrambleQuestService } from './scramble-quest.service';
import { ScrambleQuestController } from './scramble-quest.controller';

@Module({
  imports: [ArcadeModule, ArcadeVersusModule, ArcadeGroupModule, ProgressionModule, AliModule],
  controllers: [ScrambleQuestController],
  providers: [ScrambleQuestService],
})
export class ScrambleQuestModule {}
