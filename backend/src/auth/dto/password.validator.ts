import { applyDecorators } from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';

/**
 * Shared password policy — one place, used by RegisterDto,
 * ResetPasswordDto, and ChangePasswordDto, instead of the same three
 * decorators copy-pasted per DTO (Sprint 5 "Authentication hardening"
 * cleanup — the previous per-DTO copies had already drifted into two
 * near-identical comments explaining the same rule).
 *
 * Deliberately not over-engineered at foundation stage — length + one
 * digit/letter mix. Revisit alongside a real password-strength policy
 * before this ships past internal testing.
 */
export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    Length(8, 72),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
      message: 'password must contain at least one letter and one number',
    }),
  ) as PropertyDecorator;
}
