import { IsString, MaxLength } from 'class-validator';

export class SubmitWordDuelAnswerDto {
  @IsString()
  @MaxLength(100)
  answer!: string;
}
