import { Module } from '@nestjs/common';
import { ParagraphEvaluationService } from './paragraph-evaluation.service';

@Module({
  providers: [ParagraphEvaluationService],
  exports: [ParagraphEvaluationService],
})
export class ParagraphModule {}
