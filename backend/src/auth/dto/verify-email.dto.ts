import { IsString, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @MaxLength(512)
  token!: string;
}
