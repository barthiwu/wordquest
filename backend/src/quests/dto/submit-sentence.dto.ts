import { IsString, MinLength } from 'class-validator';

export class SubmitSentenceDto {
  @IsString()
  @MinLength(1)
  sentence!: string;
}
