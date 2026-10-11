import { IsString, MaxLength } from 'class-validator';

export class SubmitPracticeGuessDto {
  @IsString()
  @MaxLength(100)
  answer!: string;
}
