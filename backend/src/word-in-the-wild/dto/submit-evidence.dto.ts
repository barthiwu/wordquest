import { IsIn, IsString, MaxLength, ValidateIf } from 'class-validator';

export class SubmitEvidenceDto {
  @IsString()
  missionId!: string;

  @IsIn(['TEXT', 'PHOTO'])
  evidenceType!: 'TEXT' | 'PHOTO';

  @ValidateIf((dto: SubmitEvidenceDto) => dto.evidenceType === 'TEXT')
  @IsString()
  @MaxLength(500)
  text?: string;

  /** Must come from a prior POST .../missions/:missionId/photo-upload-url call, with the bytes already PUT there. */
  @ValidateIf((dto: SubmitEvidenceDto) => dto.evidenceType === 'PHOTO')
  @IsString()
  @MaxLength(200)
  photoKey?: string;
}
