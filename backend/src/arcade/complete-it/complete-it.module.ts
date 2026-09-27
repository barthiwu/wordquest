import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { ProgressionModule } from '../../progression/progression.module';
import { CompleteItService } from './complete-it.service';
import { CompleteItController } from './complete-it.controller';

@Module({
  imports: [ArcadeModule, ProgressionModule],
  controllers: [CompleteItController],
  providers: [CompleteItService],
})
export class CompleteItModule {}
