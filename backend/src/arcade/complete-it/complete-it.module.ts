import { Module } from '@nestjs/common';
import { ArcadeModule } from '../arcade.module';
import { ProgressionModule } from '../../progression/progression.module';
import { AliModule } from '../../ali/ali.module';
import { CompleteItService } from './complete-it.service';
import { CompleteItController } from './complete-it.controller';

@Module({
  imports: [ArcadeModule, ProgressionModule, AliModule],
  controllers: [CompleteItController],
  providers: [CompleteItService],
})
export class CompleteItModule {}
