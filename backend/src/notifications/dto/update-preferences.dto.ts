import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  dailyQuestsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  learningRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  progressEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  competitionEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStartHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEndHour?: number;
}
