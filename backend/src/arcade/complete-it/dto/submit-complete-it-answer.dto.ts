import { IsString, MaxLength } from 'class-validator';

export class SubmitCompleteItAnswerDto {
  @IsString()
  @MaxLength(100)
  answer!: string;
}
