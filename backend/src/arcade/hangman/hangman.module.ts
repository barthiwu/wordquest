import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { ArcadeVersusModule } from '../versus/versus.module';
import { ArcadeGroupModule } from '../group/group.module';
import { ProgressionModule } from '../../progression/progression.module';
import { AliModule } from '../../ali/ali.module';
import { HangmanService } from './hangman.service';
import { HangmanController } from './hangman.controller';

@Module({
  imports: [ArcadeModule, ArcadeVersusModule, ArcadeGroupModule, ProgressionModule, AliModule],
  controllers: [HangmanController],
  providers: [HangmanService],
})
export class HangmanModule {}
