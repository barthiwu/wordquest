import { IsDateString, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export const SOCIAL_PROVIDERS = ['GOOGLE', 'APPLE', 'FACEBOOK'] as const;

export class SocialLoginDto {
  @IsIn(SOCIAL_PROVIDERS)
  provider!: (typeof SOCIAL_PROVIDERS)[number];

  /** Google/Apple: the OIDC ID token. Facebook: the user access token. */
  @IsString()
  @MaxLength(4096)
  credential!: string;

  /** Apple only shares the name on the very first sign-in, and only to the client. */
  @IsOptional()
  @IsString()
  @Length(2, 40)
  displayName?: string;

  /** Required only when this sign-in would create a NEW account (COPPA age gate). */
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'dateOfBirth must be a date in YYYY-MM-DD format' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @IsOptional()
  @IsIn(['US', 'UK'])
  englishVariant?: 'US' | 'UK';
}
