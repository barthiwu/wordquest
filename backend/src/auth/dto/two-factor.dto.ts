import { IsString, MaxLength, MinLength } from 'class-validator';

/** A 6-digit authenticator code or a recovery code (XXXXX-XXXXX). */
export class TwoFactorCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  code!: string;
}

export class TwoFactorLoginDto extends TwoFactorCodeDto {
  @IsString()
  @MaxLength(2048)
  challengeToken!: string;
}
