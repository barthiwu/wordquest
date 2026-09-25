import { IsString } from 'class-validator';

export class CheckHistoryAnswerDto {
  @IsString()
  wordId!: string;

  @IsString()
  answer!: string;
}
