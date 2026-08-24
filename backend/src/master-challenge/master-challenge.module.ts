import { Module } from '@nestjs/common';
import { MasterChallengeController } from './master-challenge.controller';
import { MasterChallengeService } from './master-challenge.service';
import { MasterChallengeEvaluationService } from './master-challenge-evaluation.service';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [ProgressionModule],
  controllers: [MasterChallengeController],
  providers: [MasterChallengeService, MasterChallengeEvaluationService],
})
export class MasterChallengeModule {}
