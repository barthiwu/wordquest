import { Module } from '@nestjs/common';
import { EvidenceAssessmentService } from './evidence-assessment.service';

@Module({
  providers: [EvidenceAssessmentService],
  exports: [EvidenceAssessmentService],
})
export class AssessmentModule {}
