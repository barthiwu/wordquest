import { IsEnum, IsString, IsUUID, Length } from 'class-validator';
import { ReportTargetType } from '@prisma/client';

export class CreateReportDto {
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @IsUUID()
  targetId!: string;

  @IsString()
  @Length(3, 300, { message: 'reason must be between 3 and 300 characters' })
  reason!: string;
}
