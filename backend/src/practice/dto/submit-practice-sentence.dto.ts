import { IsString, MinLength } from 'class-validator';

export class SubmitPracticeSentenceDto {
  @IsString()
  @MinLength(1)
  sentence!: string;
}
