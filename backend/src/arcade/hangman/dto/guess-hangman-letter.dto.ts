import { IsString, Matches } from 'class-validator';

export class GuessHangmanLetterDto {
  @IsString()
  @Matches(/^[a-zA-Z]$/, { message: 'letter must be a single letter A-Z' })
  letter!: string;
}
