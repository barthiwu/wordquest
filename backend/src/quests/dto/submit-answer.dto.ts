import { IsString, MaxLength } from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  @MaxLength(100)
  answer!: string;
}
