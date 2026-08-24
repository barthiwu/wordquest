import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export enum LearningGoalDto {
  CASUAL = 'CASUAL',
  TRAVEL = 'TRAVEL',
  ACADEMIC = 'ACADEMIC',
  CAREER = 'CAREER',
  FLUENCY = 'FLUENCY',
}

/**
 * Covers both onboarding screens (player identity, learning goal) and
 * clan selection — a player can PATCH any subset of these in one call
 * as they move through onboarding, rather than one endpoint per screen.
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  nativeLanguage?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  targetLanguage?: string;

  /** IANA timezone name, e.g. "Africa/Lagos" — collected once during onboarding (Player Timezone System §15); validated server-side via Intl, not just format-checked here. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;

  @IsOptional()
  @IsEnum(LearningGoalDto)
  learningGoal?: LearningGoalDto;

  @IsOptional()
  @IsUUID()
  clanId?: string;

  @IsOptional()
  @IsBoolean()
  completeOnboarding?: boolean;
}
