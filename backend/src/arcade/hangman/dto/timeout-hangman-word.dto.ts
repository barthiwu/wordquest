import { IsBoolean, IsOptional } from 'class-validator';

export class TimeoutHangmanWordDto {
  /** See GuessHangmanLetterDto.deferNext. */
  @IsOptional()
  @IsBoolean()
  deferNext?: boolean;
}
