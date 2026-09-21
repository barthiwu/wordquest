import { IsIn } from 'class-validator';

const PHOTO_DECISIONS = ['APPROVED', 'REJECTED'] as const;
type PhotoDecision = (typeof PHOTO_DECISIONS)[number];

export class ReviewPhotoDto {
  @IsIn(PHOTO_DECISIONS)
  decision!: PhotoDecision;
}
