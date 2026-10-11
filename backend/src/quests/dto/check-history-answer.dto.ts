import { IsString, MaxLength } from 'class-validator';

export class CheckHistoryAnswerDto {
  @IsString()
  @MaxLength(64)
  wordId!: string;

  @IsString()
  @MaxLength(100)
  answer!: string;
}
