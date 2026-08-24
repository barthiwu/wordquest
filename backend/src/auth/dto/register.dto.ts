import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { IsStrongPassword } from './password.validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsStrongPassword()
  password!: string;

  @IsString()
  @Length(2, 40)
  displayName!: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'countryCode must be an ISO 3166-1 alpha-2 code, e.g. "NG"' })
  countryCode?: string;
}
