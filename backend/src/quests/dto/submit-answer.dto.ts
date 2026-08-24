import { IsString } from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  answer!: string;
}
