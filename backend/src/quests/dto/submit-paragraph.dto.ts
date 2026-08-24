import { IsString, MinLength } from 'class-validator';

export class SubmitParagraphDto {
  @IsString()
  @MinLength(1)
  paragraph!: string;
}
