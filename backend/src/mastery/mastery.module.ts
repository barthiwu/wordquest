import { Module } from '@nestjs/common';
import { MasteryService } from './mastery.service';
import { ProgressionModule } from '../progression/progression.module';
import { AchievementModule } from '../achievement/achievement.module';
import { AliModule } from '../ali/ali.module';

@Module({
  imports: [ProgressionModule, AchievementModule, AliModule],
  providers: [MasteryService],
  exports: [MasteryService],
})
export class MasteryModule {}
