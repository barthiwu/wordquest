import { Equals, IsBoolean, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ARCADE_GROUP_CONFIG } from '../../config/arcade.config';

export class GuestJoinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code!: string;

  /** The name other players see. Not unique: a number is added if it is taken. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(ARCADE_GROUP_CONFIG.GUEST_NICKNAME_MIN, ARCADE_GROUP_CONFIG.GUEST_NICKNAME_MAX)
  nickname!: string;

  /** "I am 13 or older" -- same minimum age as an account (COPPA). Must be true. */
  @IsBoolean()
  @Equals(true, { message: 'You must confirm you are old enough to play.' })
  ageConfirmed!: boolean;
}
