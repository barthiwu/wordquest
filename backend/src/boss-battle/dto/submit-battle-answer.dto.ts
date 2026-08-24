import { IsString } from 'class-validator';

export class SubmitBattleAnswerDto {
  @IsString()
  answer!: string;
}
