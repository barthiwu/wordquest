import { Module } from '@nestjs/common';
import { WordInTheWildController } from './word-in-the-wild.controller';
import { WordInTheWildService } from './word-in-the-wild.service';
import { MasteryModule } from '../mastery/mastery.module';
import { ProgressionModule } from '../progression/progression.module';
import { StorageModule } from '../storage/storage.module';
import { AssessmentModule } from '../assessment/assessment.module';

@Module({
  imports: [MasteryModule, ProgressionModule, StorageModule, AssessmentModule],
  controllers: [WordInTheWildController],
  providers: [WordInTheWildService],
  exports: [WordInTheWildService],
})
export class WordInTheWildModule {}
