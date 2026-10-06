import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ARCADE_GROUP_CONFIG, ARCADE_GROUP_GAMES } from '../../config/arcade.config';

export class CreateGroupDto {
  @IsIn([...ARCADE_GROUP_GAMES])
  game!: (typeof ARCADE_GROUP_GAMES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(ARCADE_GROUP_CONFIG.TITLE_MAX_LENGTH)
  title?: string;

  /** false = members see only their own result (assessment mode). Default true. */
  @IsOptional()
  @IsBoolean()
  showLeaderboard?: boolean;
}

export class JoinGroupDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code!: string;
}

export class StartGroupDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(ARCADE_GROUP_CONFIG.MIN_WINDOW_MINUTES)
  @Max(ARCADE_GROUP_CONFIG.MAX_WINDOW_MINUTES)
  windowMinutes?: number;
}

export class GroupMemberParamDto {
  @IsString()
  @IsUUID()
  id!: string;

  @IsString()
  @IsUUID()
  userId!: string;
}
