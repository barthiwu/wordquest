import { IsString } from 'class-validator';

export class SubmitCompleteItAnswerDto {
  @IsString()
  answer!: string;
}
