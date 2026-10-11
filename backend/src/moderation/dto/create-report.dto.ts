import { IsEnum, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { ReportTargetType } from '@prisma/client';

export class CreateReportDto {
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  @MaxLength(500)
  @Length(3, 300, { message: 'reason must be between 3 and 300 characters' })
  reason!: string;
}
