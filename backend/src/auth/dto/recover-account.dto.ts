import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LoginDto } from './login.dto';

export class RecoverAccountDto extends LoginDto {
  /** Required when the account has two-step verification turned on. */
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  twoFactorCode?: string;
}
