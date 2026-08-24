import { IsString } from 'class-validator';
import { IsStrongPassword } from './password.validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsStrongPassword()
  newPassword!: string;
}
