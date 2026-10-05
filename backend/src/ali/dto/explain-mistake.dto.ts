import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExplainMistakeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  word!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  playerAnswer!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  correctAnswer!: string;

  @IsIn(['GUESS', 'SENTENCE', 'PARAGRAPH'])
  stage!: 'GUESS' | 'SENTENCE' | 'PARAGRAPH';
}
