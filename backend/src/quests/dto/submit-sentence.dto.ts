import { IsString, MinLength, MaxLength } from 'class-validator';

export class SubmitSentenceDto {
  @IsString()
  @MaxLength(500)
  @MinLength(1)
  sentence!: string;
}
