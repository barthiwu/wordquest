import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const REVIEW_DECISIONS = ['ACTIONED', 'DISMISSED'] as const;
type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export class ReviewReportDto {
  @IsIn(REVIEW_DECISIONS)
  status!: ReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Length(0, 500)
  reviewNotes?: string;
}
