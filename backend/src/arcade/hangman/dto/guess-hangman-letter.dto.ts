import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GuessHangmanLetterDto {
  @IsString()
  @MaxLength(4)
  @Matches(/^[a-zA-Z]$/, { message: 'letter must be a single letter A-Z' })
  letter!: string;

  /**
   * Sent by newer app builds: hold the next word back (and its clock) until
   * the player taps Continue and the app calls /begin. Older builds omit it
   * and get the next word straight away, as before.
   */
  @IsOptional()
  @IsBoolean()
  deferNext?: boolean;
}
