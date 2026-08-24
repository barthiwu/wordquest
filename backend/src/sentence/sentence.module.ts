import { Module } from '@nestjs/common';
import { SentenceEvaluationService } from './sentence-evaluation.service';

@Module({
  providers: [SentenceEvaluationService],
  exports: [SentenceEvaluationService],
})
export class SentenceModule {}
