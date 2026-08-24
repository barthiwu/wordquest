import { IsString } from 'class-validator';
import { IsStrongPassword } from './password.validator';

export class ChangePasswordDto {
  // The authenticated variant of password reset — proves the caller
  // already holds the account rather than just an emailed token, so it
  // needs the CURRENT password too, not just a new one.
  @IsString()
  currentPassword!: string;

  @IsStrongPassword()
  newPassword!: string;
}
