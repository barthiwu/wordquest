import { Module } from '@nestjs/common';
import { MasterChallengeController } from './master-challenge.controller';
import { MasterChallengeService } from './master-challenge.service';
import { MasterChallengeEvaluationService } from './master-challenge-evaluation.service';
import { ProgressionModule } from '../progression/progression.module';
import { AliModule } from '../ali/ali.module';

@Module({
  imports: [ProgressionModule, AliModule],
  controllers: [MasterChallengeController],
  providers: [MasterChallengeService, MasterChallengeEvaluationService],
})
export class MasterChallengeModule {}
