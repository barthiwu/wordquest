import { IsString, MinLength } from 'class-validator';

export class SubmitPracticeParagraphDto {
  @IsString()
  @MinLength(1)
  paragraph!: string;
}
