import { IsEnum } from 'class-validator';
import { FeedbackStatus } from '@prisma/client';

export class ReviewFeedbackDto {
  @IsEnum(FeedbackStatus)
  status!: FeedbackStatus;
}
