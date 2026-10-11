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

/** Starting 2FA enrolment re-proves the account password, so a stolen session alone can't lock the owner out. */
export class TwoFactorSetupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
