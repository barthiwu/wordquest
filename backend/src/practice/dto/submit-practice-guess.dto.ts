import { IsString } from 'class-validator';

export class SubmitPracticeGuessDto {
  @IsString()
  answer!: string;
}
