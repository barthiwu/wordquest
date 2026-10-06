import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { ProgressionModule } from '../../progression/progression.module';
import { AliModule } from '../../ali/ali.module';
import { HangmanService } from './hangman.service';
import { HangmanController } from './hangman.controller';

@Module({
  imports: [ArcadeModule, ProgressionModule, AliModule],
  controllers: [HangmanController],
  providers: [HangmanService],
})
export class HangmanModule {}
