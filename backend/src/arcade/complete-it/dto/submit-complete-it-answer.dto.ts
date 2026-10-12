import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitCompleteItAnswerDto {
  @IsString()
  @MaxLength(100)
  answer!: string;

  /**
   * Sent by newer app builds: hold the next word back (and its clock) until
   * the player taps Continue and the app calls /begin. Older builds omit it
   * and get the next word straight away, as before.
   */
  @IsOptional()
  @IsBoolean()
  deferNext?: boolean;
}
