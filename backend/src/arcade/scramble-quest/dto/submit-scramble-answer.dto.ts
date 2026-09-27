import { IsString } from 'class-validator';

export class SubmitScrambleAnswerDto {
  @IsString()
  answer!: string;
}
