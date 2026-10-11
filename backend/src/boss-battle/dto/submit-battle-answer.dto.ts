import { IsString, MaxLength } from 'class-validator';

export class SubmitBattleAnswerDto {
  @IsString()
  @MaxLength(100)
  answer!: string;
}
