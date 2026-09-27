import { IsString } from 'class-validator';

export class SubmitWordDuelAnswerDto {
  @IsString()
  answer!: string;
}
