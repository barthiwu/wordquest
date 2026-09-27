import { IsDateString, IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
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

  /**
   * US/UK spelling preference (2026-09 fairness feature) -- collected on
   * the sign-up screen so a fluent US-English speaker never has to fight
   * through UK spellings (or vice versa) from their very first word.
   * Optional: a player who skips this (or an older client that doesn't
   * send it yet) just gets the UK-fallback behavior every serving
   * surface already applies when englishVariant is unset -- see
   * User.englishVariant's doc comment in schema.prisma.
   */
  @IsOptional()
  @IsIn(['US', 'UK'])
  englishVariant?: 'US' | 'UK';
}
