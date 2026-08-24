import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ExplainMistakeDto {
  @IsString()
  @IsNotEmpty()
  word!: string;

  @IsString()
  @IsNotEmpty()
  playerAnswer!: string;

  @IsString()
  @IsNotEmpty()
  correctAnswer!: string;

  @IsIn(['GUESS', 'SENTENCE', 'PARAGRAPH'])
  stage!: 'GUESS' | 'SENTENCE' | 'PARAGRAPH';
}
