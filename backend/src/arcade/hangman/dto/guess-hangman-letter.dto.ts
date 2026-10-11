import { IsString, Matches, MaxLength } from 'class-validator';

export class GuessHangmanLetterDto {
  @IsString()
  @MaxLength(4)
  @Matches(/^[a-zA-Z]$/, { message: 'letter must be a single letter A-Z' })
  letter!: string;
}
