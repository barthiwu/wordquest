import { IsEnum, IsInt, IsObject, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { FeedbackCategory, FeedbackType } from '@prisma/client';

/**
 * POST /api/v1/feedback body — covers both shapes the spec describes
 * (§18/§20): a lightweight PROMPT response (rating + optional reason
 * checkboxes in `context`) and a FREEFORM Settings -> Send Feedback
 * submission (message, no rating required).
 */
export class CreateFeedbackDto {
  @IsEnum(FeedbackType)
  type!: FeedbackType;

  @IsEnum(FeedbackCategory)
  category!: FeedbackCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  message?: string;

  @IsOptional()
  @IsString()
  screen?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
