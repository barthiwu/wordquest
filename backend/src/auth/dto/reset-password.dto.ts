import { IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from './password.validator';

export class ResetPasswordDto {
  @IsString()
  @MaxLength(512)
  token!: string;

  @IsStrongPassword()
  newPassword!: string;
}
