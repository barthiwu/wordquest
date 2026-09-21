import { IsDateString, IsEmail, IsOptional, IsString, Length } from 'class-validator';
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

  // Age gate (COPPA, gameplayRules.auth.minimumAgeYears) — a plain
  // "YYYY-MM-DD" calendar date, no time/timezone component (a
  // birthdate isn't a moment, and IsDateString accepts the bare-date
  // form). AuthService.register is what actually enforces the minimum
  // age; this decorator only validates the value is a real date string.
  @IsDateString({ strict: true }, { message: 'dateOfBirth must be a date in YYYY-MM-DD format' })
  dateOfBirth!: string;
}
