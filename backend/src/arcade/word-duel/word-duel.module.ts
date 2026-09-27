import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { ProgressionModule } from '../../progression/progression.module';
import { WordDuelService } from './word-duel.service';
import { WordDuelController } from './word-duel.controller';

@Module({
  imports: [ArcadeModule, ProgressionModule],
  controllers: [WordDuelController],
  providers: [WordDuelService],
})
export class WordDuelModule {}
